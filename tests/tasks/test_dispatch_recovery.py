from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import select

from app.modules.tasks.dispatch import Claim, claim_next, mark_published, reconcile, start_claim
from app.modules.tasks.models import AITask, TaskStreamToken
from app.workers import dispatcher
from app.workers import maintenance
from app.workers.celery_app import celery_app
from app.config import Settings


NOW = datetime.now(timezone.utc)


async def insert_task(factory, user, **values):
    async with factory() as db:
        task = AITask(user_id=user, mode="programming", status="queued", stage="queued",
                      created_at=NOW, **values)
        db.add(task)
        await db.commit()
        return task.id


async def claim(factory):
    async with factory() as db:
        result = await claim_next(db, NOW, 4, 2)
        await db.commit()
        return result


@pytest.mark.asyncio
async def test_published_but_ack_lost_is_safe_to_repeat(task_db, dispatch_users):
    task_id = await insert_task(task_db, dispatch_users[0])
    token = await claim(task_db)
    async with task_db() as db:
        await mark_published(db, token)
        await db.commit()
    async with task_db() as db:
        pending = await reconcile(db, NOW + timedelta(minutes=2))
        await db.commit()
    assert task_id in pending
    async with task_db() as db:
        assert await start_claim(db, token, NOW + timedelta(minutes=2)) is True
        await db.commit()
    async with task_db() as db:
        assert await start_claim(db, token, NOW + timedelta(minutes=2)) is False
        await db.rollback()


@pytest.mark.asyncio
async def test_unpublished_claim_survives_broker_failure_and_stale_generation_is_fenced(task_db, dispatch_users):
    task_id = await insert_task(task_db, dispatch_users[0])
    original = await claim(task_db)
    async with task_db() as db:
        assert task_id in await reconcile(db, NOW + timedelta(seconds=1))
        await db.commit()
    async with task_db() as db:
        await reconcile(db, NOW + timedelta(minutes=6))
        await db.commit()
    replacement = await claim(task_db)
    assert replacement.task_id == task_id
    assert replacement.generation > original.generation
    async with task_db() as db:
        assert await start_claim(db, original, NOW + timedelta(minutes=6)) is False
        await db.rollback()


@pytest.mark.asyncio
async def test_running_and_legacy_uncertain_tasks_fail_without_requeue(task_db, dispatch_users):
    task_id = await insert_task(task_db, dispatch_users[0])
    token = await claim(task_db)
    async with task_db() as db:
        assert await start_claim(db, token, NOW) is True
        await db.commit()
        legacy = AITask(user_id=dispatch_users[0], mode="programming", status="streaming",
                        stage="ai_streaming", started_at=NOW - timedelta(minutes=10))
        db.add(legacy)
        await db.commit()
        legacy_id = legacy.id
    async with task_db() as db:
        assert await reconcile(db, NOW + timedelta(minutes=5)) == []
        await db.commit()
        for identifier in (task_id, legacy_id):
            task = await db.get(AITask, identifier)
            assert task.status == "failed"
            assert task.error_code == "WORKER_LOST_UNCERTAIN"
    assert await claim(task_db) is None


@pytest.mark.asyncio
async def test_legacy_worker_waits_beyond_hard_limit_before_uncertain_failure(task_db, dispatch_users):
    async with task_db() as db:
        task = AITask(user_id=dispatch_users[0], mode="programming", status="processing",
                      stage="loading_images", started_at=NOW - timedelta(seconds=180))
        db.add(task)
        await db.commit()
        task_id = task.id
    async with task_db() as db:
        await reconcile(db, NOW)
        await db.commit()
        assert (await db.get(AITask, task_id)).status == "processing"
    async with task_db() as db:
        await reconcile(db, NOW + timedelta(minutes=2))
        await db.commit()
        assert (await db.get(AITask, task_id)).error_code == "WORKER_LOST_UNCERTAIN"


def test_dispatch_defaults_off_and_periodic_entry_is_registered(monkeypatch):
    monkeypatch.delenv("TASK_DISPATCH_ENABLED", raising=False)
    assert Settings(_env_file=None).task_dispatch_enabled is False
    assert celery_app.tasks["aivora.dispatch_queued"].name == "aivora.dispatch_queued"
    assert any(entry["task"] == "aivora.dispatch_queued"
               for entry in celery_app.conf.beat_schedule.values())


@pytest.mark.asyncio
async def test_dispatch_reconciles_tokens_without_waiting_for_object_cleanup(
    task_db, dispatch_users, monkeypatch,
):
    from app.modules.tasks import service

    task_id = await insert_task(task_db, dispatch_users[0])
    async with task_db() as db:
        db.add(TaskStreamToken(task_id=task_id, token_hash="a" * 64,
                               expires_at=NOW - timedelta(seconds=1)))
        placeholder = AITask(user_id=dispatch_users[0], mode="programming", status="created",
                             stage="created", created_at=NOW - timedelta(hours=1))
        db.add(placeholder)
        await db.commit()
        placeholder_id = placeholder.id

    def forbidden_cleanup(task):
        raise AssertionError("dispatch must not access object storage")

    monkeypatch.setattr(service, "_remove_task_objects", forbidden_cleanup)
    async with task_db() as db:
        await reconcile(db, NOW)
        await db.commit()
        assert (await db.scalars(select(TaskStreamToken).where(
            TaskStreamToken.task_id == task_id
        ))).all() == []
        assert (await db.get(AITask, placeholder_id)).status == "created"
    async with task_db() as db:
        assert await claim_next(db, NOW, 4, 2) is not None
        await db.commit()

    monkeypatch.setattr(service, "_remove_task_objects", lambda task: True)
    await maintenance.maintenance_once(task_db)
    async with task_db() as db:
        task = await db.get(AITask, placeholder_id)
        assert task.status == "failed"
        assert task.error_code == "TASK_INPUT_INTERRUPTED"


def test_input_maintenance_runs_on_dedicated_queue():
    entry = celery_app.conf.beat_schedule["aivora-maintain-task-inputs"]
    assert entry["task"] == "aivora.maintain_task_inputs"
    assert entry["options"]["queue"] == "aivora-maintenance"
    assert celery_app.tasks["aivora.maintain_task_inputs"].name == entry["task"]


@pytest.mark.asyncio
async def test_dispatcher_does_not_publish_when_disabled(task_db, dispatch_users, monkeypatch):
    await insert_task(task_db, dispatch_users[0])
    calls = []
    monkeypatch.setattr(dispatcher.celery_app, "send_task",
                        lambda *args, **kwargs: calls.append((args, kwargs)))
    await dispatcher.dispatch_once(task_db, enabled=False)
    assert calls == []


@pytest.mark.asyncio
async def test_broker_failure_leaves_reserved_claim_for_next_cycle(task_db, dispatch_users, monkeypatch):
    task_id = await insert_task(task_db, dispatch_users[0])

    def unavailable(*args, **kwargs):
        raise ConnectionError("broker unavailable")

    monkeypatch.setattr(dispatcher.celery_app, "send_task", unavailable)
    await dispatcher.dispatch_once(task_db, enabled=True)
    async with task_db() as db:
        task = await db.get(AITask, task_id)
        assert task.lease_state == "reserved"
        assert task.published_at is None
        generation = task.dispatch_generation

    sent = []
    monkeypatch.setattr(dispatcher.celery_app, "send_task",
                        lambda name, **kwargs: sent.append((name, kwargs)))
    await dispatcher.dispatch_once(task_db, enabled=True)
    assert sent == [("aivora.run_ai_task", {
        "args": [str(task_id), generation], "queue": "aivora",
    })]
    async with task_db() as db:
        assert (await db.get(AITask, task_id)).published_at is not None


@pytest.mark.asyncio
async def test_ack_lost_after_send_republishes_same_generation(task_db, dispatch_users, monkeypatch):
    task_id = await insert_task(task_db, dispatch_users[0])
    sent = []
    monkeypatch.setattr(dispatcher.celery_app, "send_task",
                        lambda name, **kwargs: sent.append(kwargs["args"]))

    async def failed_mark(*args):
        raise ConnectionError("ack persistence lost")

    original = dispatcher.mark_published
    monkeypatch.setattr(dispatcher, "mark_published", failed_mark)
    await dispatcher.dispatch_once(task_db, enabled=True)
    monkeypatch.setattr(dispatcher, "mark_published", original)
    await dispatcher.dispatch_once(task_db, enabled=True)
    assert len(sent) == 2
    assert sent[0] == sent[1]
    assert sent[0][0] == str(task_id)
    async with task_db() as db:
        task = await db.get(AITask, task_id)
        assert await start_claim(db, Claim(task.id, task.user_id, sent[0][1]), NOW) is True
        await db.commit()
    async with task_db() as db:
        assert await start_claim(db, Claim(task.id, task.user_id, sent[1][1]), NOW) is False
        await db.rollback()
