from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database import get_db_session
from app.modules.identity.dependencies import require_admin
from app.modules.identity.models import Session, User
from app.modules.tasks.models import AITask

router = APIRouter(prefix="/api/admin", tags=["admin"])


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
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    user.is_active = is_active
    if not is_active:
        await db.execute(
            Session.__table__.update()
            .where(Session.user_id == user_id, Session.revoked_at.is_(None))
            .values(revoked_at=func.now())
        )
    await db.commit()
    return {"success": True, "user_id": str(user_id), "is_active": is_active}


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
