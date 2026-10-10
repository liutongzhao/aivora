from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database import get_db_session
from app.infrastructure.storage import storage
from app.modules.identity.dependencies import require_admin
from app.modules.identity.models import Session, User
from app.modules.files.models import StoredFile
from app.modules.tasks.models import AITask, Answer, TaskImage
from app.modules.licenses.models import LicenseBatch, LicenseCode, LicenseSettings, UserEntitlement
from app.modules.licenses.service import LicenseCodeService, LicenseError
from app.modules.usage.models import UsageLedger
from app.modules.admin.models import AdminAuditLog
from app.modules.admin.service import AdminLicenseService

router = APIRouter(prefix="/api/admin", tags=["admin"])


class TrialAdjustmentRequest(BaseModel):
    amount: int = Field(ge=1, le=1000)
    reason: str = Field(min_length=3, max_length=500)


class LicenseBatchRequest(BaseModel):
    name: str | None = Field(default=None, max_length=160)
    quantity: int = Field(ge=1, le=10000)
    duration_months: int | None = Field(default=None, ge=1, le=120)


class LicenseSettingsRequest(BaseModel):
    default_duration_months: int = Field(ge=1, le=120)
    max_duration_months: int = Field(ge=1, le=120)


class AdminReasonRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class EntitlementExtensionRequest(AdminReasonRequest):
    months: int = Field(ge=1, le=120)


async def _audit(db: AsyncSession, admin_id: UUID, action: str, resource_type: str, resource_id: str | None, metadata: dict) -> None:
    db.add(
        AdminAuditLog(
            admin_user_id=admin_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=metadata,
        )
    )


@router.get("/users")
async def list_users(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
    search: str | None = None,
    limit: int = 50,
) -> dict:
    query = select(User).order_by(User.created_at.desc()).limit(min(limit, 100))
    if search:
        query = query.where(User.email.ilike(f"%{search}%"))
    result = await db.execute(query)
    users = result.scalars().all()
    return {
        "users": [
            {
                "id": str(item.id),
                "email": item.email,
                "username": item.username,
                "role": item.role,
                "is_active": item.is_active,
                "created_at": item.created_at,
            }
            for item in users
        ]
    }


@router.patch("/users/{user_id}/status")
async def set_user_status(
    user_id: UUID,
    is_active: bool,
    actor: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if actor.id == user_id and not is_active:
        raise HTTPException(status_code=400, detail="不能停用当前管理员账号")
    user.is_active = is_active
    user.status = "active" if is_active else "suspended"
    if not is_active:
        await db.execute(
            Session.__table__.update()
            .where(Session.user_id == user_id, Session.revoked_at.is_(None))
            .values(revoked_at=func.now())
        )
    await _audit(
        db,
        actor.id,
        "user_reactivated" if is_active else "user_suspended",
        "user",
        str(user_id),
        {},
    )
    await db.commit()
    return {"success": True, "user_id": str(user_id), "is_active": is_active}


@router.get("/users/{user_id}")
async def user_detail(
    user_id: UUID,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    entitlement = await db.scalar(
        select(UserEntitlement)
        .where(UserEntitlement.user_id == user_id)
        .order_by(UserEntitlement.expires_at.desc())
    )
    task_count = await db.scalar(select(func.count()).select_from(AITask).where(AITask.user_id == user_id))
    return {
        "user": {
            "id": str(user.id),
            "email": user.email,
            "username": user.username,
            "status": user.status,
            "email_verified": bool(user.email_verified_at),
            "created_at": user.created_at,
            "last_login_at": user.last_login_at,
        },
        "usage": {
            "trial_total": user.trial_total,
            "trial_used": user.trial_used,
            "trial_remaining": max(0, user.trial_total - user.trial_used),
            "task_count": task_count or 0,
        },
        "entitlement": None if not entitlement else {
            "status": entitlement.status,
            "starts_at": entitlement.starts_at,
            "expires_at": entitlement.expires_at,
        },
    }


@router.post("/users/{user_id}/trial-adjustments")
async def adjust_trial(
    user_id: UUID,
    request: TrialAdjustmentRequest,
    actor: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    user = await db.scalar(select(User).where(User.id == user_id).with_for_update())
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    user.trial_total += request.amount
    ledger = UsageLedger(
        user_id=user_id,
        usage_type="admin_trial_grant",
        amount=request.amount,
        status="committed",
        idempotency_key=f"admin:{actor.id}:{user_id}:{datetime.now(timezone.utc).isoformat()}",
    )
    db.add(ledger)
    await _audit(db, actor.id, "trial_adjusted", "user", str(user_id), {"amount": request.amount, "reason": request.reason})
    await db.commit()
    return {"success": True, "trialTotal": user.trial_total, "trialRemaining": user.trial_total - user.trial_used}


@router.get("/license-settings")
async def get_license_settings(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    settings = await db.get(LicenseSettings, True)
    return {
        "defaultDurationMonths": settings.default_duration_months if settings else 6,
        "maxDurationMonths": settings.max_duration_months if settings else 24,
    }


@router.patch("/license-settings")
async def update_license_settings(
    request: LicenseSettingsRequest,
    actor: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    if request.max_duration_months < request.default_duration_months:
        raise HTTPException(status_code=400, detail="最大期限不能小于默认期限")
    settings = await db.get(LicenseSettings, True)
    if not settings:
        settings = LicenseSettings(id=True)
        db.add(settings)
    settings.default_duration_months = request.default_duration_months
    settings.max_duration_months = request.max_duration_months
    settings.updated_by = actor.id
    await _audit(db, actor.id, "license_settings_updated", "license_settings", "default", request.model_dump())
    await db.commit()
    return {"success": True, **request.model_dump()}


@router.post("/license-batches")
async def create_license_batch(
    request: LicenseBatchRequest,
    actor: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    settings = await db.get(LicenseSettings, True)
    duration = request.duration_months or (settings.default_duration_months if settings else 6)
    try:
        batch, codes = await LicenseCodeService().create_batch(
            db, actor.id, request.name, request.quantity, duration
        )
    except LicenseError as error:
        raise HTTPException(status_code=error.status_code, detail={"code": error.code, "message": error.message})
    await _audit(db, actor.id, "license_batch_created", "license_batch", str(batch.id), {
        "quantity": request.quantity,
        "duration_months": duration,
    })
    await db.commit()
    return {
        "success": True,
        "batchId": str(batch.id),
        "durationMonths": duration,
        "codes": codes,
        "warning": "授权码只在本次生成结果中显示，请立即保存。",
    }


@router.get("/license-codes")
async def list_license_codes(
    actor: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
    status: str | None = None,
    limit: int = 100,
) -> dict:
    query = (
        select(LicenseCode, LicenseBatch)
        .join(LicenseBatch, LicenseBatch.id == LicenseCode.batch_id)
        .order_by(LicenseCode.created_at.desc())
        .limit(min(max(limit, 1), 200))
    )
    if status:
        query = query.where(LicenseCode.status == status)
    result = await db.execute(query)
    return {
        "codes": [
            {
                "id": str(code.id),
                "batch_id": str(code.batch_id),
                "batch_name": batch.name,
                "duration_months": batch.duration_months,
                "suffix": code.code_suffix,
                "status": code.status,
                "activated_by": str(code.activated_by) if code.activated_by else None,
                "activated_at": code.activated_at,
                "created_at": code.created_at,
            }
            for code, batch in result.all()
        ]
    }


@router.post("/license-codes/{code_id}/revoke")
async def revoke_license_code(
    code_id: UUID,
    request: AdminReasonRequest,
    actor: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    try:
        code = await AdminLicenseService().revoke_license_code(db, actor.id, code_id, request.reason)
    except LicenseError as error:
        raise HTTPException(status_code=error.status_code, detail={"code": error.code, "message": error.message})
    return {"success": True, "id": str(code.id), "status": code.status}


@router.post("/users/{user_id}/entitlement/extend")
async def extend_user_entitlement(
    user_id: UUID,
    request: EntitlementExtensionRequest,
    actor: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    try:
        entitlement = await AdminLicenseService().extend_entitlement(
            db, actor.id, user_id, request.months, request.reason
        )
    except LicenseError as error:
        raise HTTPException(status_code=error.status_code, detail={"code": error.code, "message": error.message})
    return {
        "success": True,
        "status": entitlement.status,
        "startsAt": entitlement.starts_at,
        "expiresAt": entitlement.expires_at,
    }


@router.post("/users/{user_id}/entitlement/{status}")
async def set_user_entitlement_status(
    user_id: UUID,
    status: str,
    request: AdminReasonRequest,
    actor: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    try:
        entitlement = await AdminLicenseService().set_entitlement_status(
            db, actor.id, user_id, status, request.reason
        )
    except LicenseError as error:
        raise HTTPException(status_code=error.status_code, detail={"code": error.code, "message": error.message})
    return {"success": True, "status": entitlement.status}


@router.get("/tasks")
async def list_tasks(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
    limit: int = 50,
) -> dict:
    result = await db.execute(select(AITask).order_by(AITask.created_at.desc()).limit(min(limit, 100)))
    return {
        "tasks": [
            {
                "id": str(task.id),
                "user_id": str(task.user_id),
                "mode": task.mode,
                "status": task.status,
                "stage": task.stage,
                "progress": task.progress,
                "error_code": task.error_code,
                "created_at": task.created_at,
                "completed_at": task.completed_at,
            }
            for task in result.scalars().all()
        ]
    }


@router.get("/tasks/{task_id}")
async def get_task(
    task_id: UUID,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    task = await db.get(AITask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    answer = await db.scalar(select(Answer).where(Answer.task_id == task_id))
    files = (await db.execute(
        select(StoredFile)
        .join(TaskImage, TaskImage.stored_file_id == StoredFile.id)
        .where(TaskImage.task_id == task_id)
        .order_by(TaskImage.ordinal)
    )).scalars().all()
    return {
        "task": {
            "id": str(task.id),
            "user_id": str(task.user_id),
            "mode": task.mode,
            "status": task.status,
            "stage": task.stage,
            "progress": task.progress,
            "created_at": task.created_at,
            "completed_at": task.completed_at,
            "error_code": task.error_code,
            "error_message": task.error_message,
        },
        "answer": None if not answer else {
            "question_type": answer.question_type,
            "content": answer.content,
            "raw_content": answer.raw_content,
            "parsed": answer.parsed,
            "parse_warning": answer.parse_warning,
        },
        "images": [
            {
                "id": str(file.id),
                "content_type": file.content_type,
                "size_bytes": file.size_bytes,
                "url": storage.presigned_get(file.object_key),
            }
            for file in files
        ],
    }


@router.get("/overview")
async def overview(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    users = await db.scalar(select(func.count()).select_from(User))
    tasks = await db.scalar(select(func.count()).select_from(AITask))
    running = await db.scalar(
        select(func.count()).select_from(AITask).where(AITask.status.in_(["queued", "processing", "streaming"]))
    )
    return {"users": users or 0, "tasks": tasks or 0, "running_tasks": running or 0}
