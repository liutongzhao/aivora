import asyncio

from app.infrastructure.database import session_factory
from app.modules.tasks.service import reconcile_created_tasks
from app.workers.celery_app import celery_app


async def maintenance_once(factory=session_factory) -> int:
    async with factory() as db:
        return await reconcile_created_tasks(db)


@celery_app.task(name="aivora.maintain_task_inputs", queue="aivora-maintenance")
def maintain_task_inputs() -> None:
    asyncio.run(maintenance_once())
