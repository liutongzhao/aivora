import asyncio
from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
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
from app.modules.usage.models import TrialModelSettings
from app.modules.byok.crypto import encrypt_secret
from app.modules.byok.crypto import decrypt_secret
from app.modules.byok.outbound import probe_model, validate_endpoint
from app.config import get_settings
from app.modules.admin.models import AdminAuditLog
from app.modules.admin.service import AdminAuditService, AdminLicenseService, sanitize_audit_details

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


class TrialModelSettingsRequest(BaseModel):
    base_url: str = Field(min_length=1, max_length=2000)
    api_key: str | None = Field(default=None, min_length=8, max_length=4096)
    model_name: str = Field(min_length=1, max_length=160)
    display_name: str = Field(min_length=1, max_length=160)
    enabled: bool = True
    trial_total: int = Field(default=20, ge=0, le=100000)


async def _audit(db: AsyncSession, admin_id: UUID, action: str, resource_type: str, resource_id: str | None, metadata: dict) -> None:
    db.add(
        AdminAuditLog(
            admin_user_id=admin_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=sanitize_audit_details(metadata),
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
            "builtin_model_total": user.builtin_model_total,
            "builtin_model_used": user.builtin_model_used,
            "builtin_model_remaining": max(0, user.builtin_model_total - user.builtin_model_used),
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


@router.post("/users/{user_id}/builtin-model-adjustments")
async def adjust_builtin_model_usage(
    user_id: UUID,
    request: TrialAdjustmentRequest,
    actor: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    user = await db.scalar(select(User).where(User.id == user_id).with_for_update())
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    user.builtin_model_total += request.amount
    db.add(UsageLedger(
        user_id=user_id,
        usage_type="admin_builtin_model_grant",
        amount=request.amount,
        status="committed",
        idempotency_key=f"admin-builtin:{actor.id}:{user_id}:{datetime.now(timezone.utc).isoformat()}",
    ))
    await _audit(db, actor.id, "builtin_model_adjusted", "user", str(user_id), {
        "amount": request.amount, "reason": request.reason,
    })
    await db.commit()
    return {
        "success": True,
        "builtinModelTotal": user.builtin_model_total,
        "builtinModelRemaining": user.builtin_model_total - user.builtin_model_used,
    }


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


@router.get("/trial-model")
async def get_trial_model(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    item = await db.get(TrialModelSettings, True)
    return {
        "baseUrl": item.base_url if item else "",
        "modelName": item.model_name if item else "",
        "displayName": item.display_name if item else "",
        "enabled": item.enabled if item else False,
        "trialTotal": item.trial_total if item else 20,
        "keyConfigured": bool(item and item.api_key_encrypted),
    }


@router.post("/trial-model/test")
async def test_trial_model(
    request: TrialModelSettingsRequest,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    api_key = request.api_key
    if not api_key:
        item = await db.get(TrialModelSettings, True)
        if item and item.api_key_encrypted:
            api_key = decrypt_secret(item.api_key_encrypted)
    if not api_key:
        raise HTTPException(status_code=400, detail="请先配置 API Key")
    try:
        await probe_model(
            validate_endpoint(request.base_url.strip()),
            api_key,
            request.model_name.strip(),
        )
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=400, detail=str(error))
    return {"success": True, "message": "内置模型调用测试成功，未消耗次数"}


@router.put("/trial-model")
async def update_trial_model(
    request: TrialModelSettingsRequest,
    actor: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    item = await db.get(TrialModelSettings, True)
    if not item:
        item = TrialModelSettings(id=True)
        db.add(item)
    item.base_url = request.base_url.strip()
    if request.api_key:
        item.api_key_encrypted = encrypt_secret(request.api_key)
    elif not item.api_key_encrypted:
        raise HTTPException(status_code=400, detail="请填写 API Key")
    item.model_name = request.model_name.strip()
    item.display_name = request.display_name.strip()
    item.enabled = request.enabled
    item.trial_total = request.trial_total
    item.updated_by = actor.id
    await _audit(db, actor.id, "trial_model_updated", "trial_model", "default", {
        "base_url": item.base_url, "model_name": item.model_name,
        "display_name": item.display_name, "enabled": item.enabled,
        "trial_total": item.trial_total,
    })
    await db.commit()
    return {"success": True, "modelName": item.model_name, "displayName": item.display_name, "trialTotal": item.trial_total}


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


@router.get("/audit-logs")
async def list_audit_logs(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
    action: str | None = None,
    resource_type: str | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    logs, total = await AdminAuditService().list_logs(
        db,
        action=action,
        resource_type=resource_type,
        search=search,
        limit=limit,
        offset=offset,
    )
    return {"logs": logs, "total": total, "limit": min(max(limit, 1), 100), "offset": max(offset, 0)}


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
                "url": f"/api/admin/tasks/{task_id}/images/{file.id}",
            }
            for file in files
        ],
    }


@router.get("/tasks/{task_id}/images/{file_id}")
async def get_task_image(
    task_id: UUID,
    file_id: UUID,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> StreamingResponse:
    file = await db.scalar(
        select(StoredFile)
        .join(TaskImage, TaskImage.stored_file_id == StoredFile.id)
        .where(
            TaskImage.task_id == task_id,
            StoredFile.id == file_id,
            StoredFile.deleted_at.is_(None),
        )
    )
    if not file:
        raise HTTPException(status_code=404, detail="题目截图不存在")
    try:
        object_response = await asyncio.to_thread(storage.get_object, file.object_key)
    except Exception as error:
        raise HTTPException(status_code=404, detail="题目截图读取失败") from error

    async def stream_image():
        try:
            while chunk := await asyncio.to_thread(object_response.read, 1024 * 1024):
                yield chunk
        finally:
            object_response.close()
            object_response.release_conn()

    return StreamingResponse(
        stream_image(),
        media_type=file.content_type or "application/octet-stream",
        headers={"Cache-Control": "private, max-age=300", "Content-Length": str(file.size_bytes)},
    )


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
