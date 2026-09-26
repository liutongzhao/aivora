from pathlib import Path
from uuid import UUID

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.modules.tasks.models import AITask
from app.modules.tasks.service import TaskService  # Loads the task's related ORM models.


USER = UUID("00000000-0000-0000-0000-000000000001")
MIGRATION = Path(__file__).resolve().parents[2] / "backend/db/migrations/V016__remove_task_dispatch_fields.sql"


@pytest.mark.asyncio
async def test_migration_refuses_to_drop_dispatch_fields_with_active_tasks(task_db):
    guard = MIGRATION.read_text().split("DROP INDEX")[0]
    async with task_db() as db:
        task = AITask(user_id=USER, mode="programming", status="queued", stage="queued")
        db.add(task)
        await db.commit()
        with pytest.raises(DBAPIError, match="Drain Aivora"):
            await db.execute(text(guard))
        await db.rollback()
