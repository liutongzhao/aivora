from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database import get_db_session
from app.modules.identity.dependencies import get_current_user
from app.modules.identity.models import User
from app.modules.usage.service import TrialUsageService
from app.modules.usage.models import UsageLedger

router = APIRouter(prefix="/api/account", tags=["usage"])


@router.get("/usage")
async def get_usage(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    return await TrialUsageService().summary(db, user.id)


@router.get("/usage-history")
async def get_usage_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    result = await db.execute(
        select(UsageLedger)
        .where(UsageLedger.user_id == user.id)
        .order_by(UsageLedger.created_at.desc())
        .limit(100)
    )
    return [
        {
            "id": str(record.id),
            "usage_type": record.usage_type,
            "amount": record.amount,
            "status": record.status,
            "created_at": record.created_at,
            "task_id": str(record.task_id) if record.task_id else None,
        }
        for record in result.scalars().all()
    ]
