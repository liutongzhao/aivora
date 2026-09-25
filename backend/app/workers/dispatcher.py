import asyncio
import logging
from datetime import datetime, timezone

from app.config import get_settings
from app.infrastructure.database import session_factory
from app.modules.tasks.dispatch import Claim, claim_next, mark_published, reconcile
from app.modules.tasks.models import AITask
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


async def dispatch_once(factory=session_factory, *, enabled: bool | None = None) -> None:
    settings = get_settings()
    if enabled is None:
        enabled = settings.task_dispatch_enabled
    if not enabled:
        return
    now = datetime.now(timezone.utc)
    async with factory() as db:
        pending = await reconcile(db, now)
        await db.commit()
        claims = []
        for task_id in pending:
            task = await db.get(AITask, task_id)
            if task and task.status == "queued" and task.lease_state == "reserved":
                claims.append(Claim(task.id, task.user_id, task.dispatch_generation))
        await db.rollback()
        for _ in range(settings.task_dispatch_global_limit):
            claim = await claim_next(
                db, now, settings.task_dispatch_global_limit,
                settings.task_dispatch_user_limit,
            )
            await db.commit()
            if claim is None:
                break
            claims.append(claim)
        for claim in claims:
            try:
                celery_app.send_task(
                    "aivora.run_ai_task", args=[str(claim.task_id), claim.generation],
                    queue="aivora",
                )
                await mark_published(db, claim)
                await db.commit()
            except Exception:
                await db.rollback()
                logger.exception("Dispatch publication uncertain for task %s", claim.task_id)


@celery_app.task(name="aivora.dispatch_queued")
def dispatch_queued() -> None:
    asyncio.run(dispatch_once())
