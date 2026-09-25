from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.tasks.models import AITask, TaskStreamToken


_LOCK_KEY = 0x4149564F5241
RESERVATION_TIME = timedelta(minutes=5)
RUNNING_TIME = timedelta(minutes=4)
REPUBLISH_AFTER = timedelta(seconds=30)
LEGACY_WORKER_LIMIT = timedelta(minutes=4)


@dataclass(frozen=True)
class Claim:
    task_id: UUID
    user_id: UUID
    generation: int


async def _lock(db: AsyncSession) -> None:
    await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _LOCK_KEY})


async def claim_next(
    db: AsyncSession, now: datetime, global_limit: int, user_limit: int
) -> Claim | None:
    await _lock(db)
    active = (await db.execute(
        select(AITask.user_id, func.count(AITask.id))
        .where(AITask.lease_state.in_(("reserved", "running")),
               AITask.status.in_(("queued", "processing", "streaming")))
        .group_by(AITask.user_id)
    )).all()
    counts = dict(active)
    if sum(counts.values()) >= global_limit:
        return None
    candidates = (await db.scalars(
        select(AITask).where(AITask.status == "queued", AITask.lease_state.is_(None))
        .order_by(AITask.created_at, AITask.user_id, AITask.id)
    )).all()
    eligible = [task for task in candidates if counts.get(task.user_id, 0) < user_limit]
    if not eligible:
        return None
    selected = min(
        eligible,
        key=lambda task: (
            counts.get(task.user_id, 0) != 0,
            task.created_at, str(task.user_id), str(task.id),
        ),
    )
    selected.dispatch_generation += 1
    selected.lease_state = "reserved"
    selected.lease_expires_at = now + RESERVATION_TIME
    selected.published_at = None
    await db.flush()
    return Claim(selected.id, selected.user_id, selected.dispatch_generation)


async def mark_published(db: AsyncSession, claim: Claim) -> None:
    await db.execute(
        update(AITask).where(
            AITask.id == claim.task_id,
            AITask.dispatch_generation == claim.generation,
            AITask.lease_state == "reserved",
            AITask.status == "queued",
        ).values(published_at=func.now())
    )


async def start_claim(db: AsyncSession, claim: Claim, now: datetime) -> bool:
    acquired = await db.scalar(
        update(AITask).where(
            AITask.id == claim.task_id,
            AITask.user_id == claim.user_id,
            AITask.dispatch_generation == claim.generation,
            AITask.status == "queued",
            AITask.lease_state == "reserved",
            AITask.lease_expires_at > now,
        ).values(
            status="processing", stage="loading_images", progress=10,
            started_at=now, lease_state="running",
            lease_expires_at=now + RUNNING_TIME,
        ).returning(AITask.id)
    )
    return acquired is not None


async def reconcile(db: AsyncSession, now: datetime) -> list[UUID]:
    await _lock(db)
    await db.execute(delete(TaskStreamToken).where(TaskStreamToken.expires_at <= now))
    await db.execute(
        update(AITask).where(
            AITask.lease_state == "reserved",
            AITask.status == "queued",
            AITask.lease_expires_at <= now,
        ).values(
            lease_state=None, lease_expires_at=None, published_at=None,
            dispatch_generation=AITask.dispatch_generation + 1,
        )
    )
    await db.execute(
        update(AITask).where(
            AITask.lease_state == "running",
            AITask.status.in_(("processing", "streaming")),
            AITask.lease_expires_at <= now,
        ).values(
            status="failed", stage="error", lease_state=None, lease_expires_at=None,
            error_code="WORKER_LOST_UNCERTAIN",
            error_message="任务执行状态无法确认，请勿重复提交",
            completed_at=now,
        )
    )
    await db.execute(
        update(AITask).where(
            AITask.lease_state.is_(None),
            AITask.status.in_(("processing", "streaming")),
            AITask.started_at <= now - LEGACY_WORKER_LIMIT,
        ).values(
            status="failed", stage="error",
            error_code="WORKER_LOST_UNCERTAIN",
            error_message="任务执行状态无法确认，请勿重复提交",
            completed_at=now,
        )
    )
    return list((await db.scalars(
        select(AITask.id).where(
            AITask.status == "queued",
            AITask.lease_state == "reserved",
            AITask.lease_expires_at > now,
            (AITask.published_at.is_(None) |
             (AITask.published_at <= now - REPUBLISH_AFTER)),
        ).order_by(AITask.created_at, AITask.id)
    )).all())
