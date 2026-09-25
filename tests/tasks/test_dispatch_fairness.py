import asyncio
from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import select

from app.modules.tasks.models import AITask
from app.modules.tasks.dispatch import claim_next


NOW = datetime.now(timezone.utc)


async def seed(factory, users, *, status="queued"):
    async with factory() as db:
        rows = [
            AITask(user_id=user, mode="programming", status=status, stage=status,
                   created_at=NOW + timedelta(seconds=index))
            for index, user in enumerate(users)
        ]
        db.add_all(rows)
        await db.commit()
        return [row.id for row in rows]


async def claim(factory, global_limit=4, user_limit=2):
    async with factory() as db:
        result = await claim_next(db, NOW + timedelta(minutes=1), global_limit, user_limit)
        await db.commit()
        return result


@pytest.mark.asyncio
async def test_oldest_waiting_users_get_first_four_slots(task_db, dispatch_users):
    await seed(task_db, [dispatch_users[0]] * 6 + dispatch_users[1:])
    claims = [await claim(task_db) for _ in range(4)]
    assert {item.user_id for item in claims} == set(dispatch_users)
    assert await claim(task_db) is None
    async with task_db() as db:
        reserved = (await db.scalars(select(AITask).where(
            AITask.user_id.in_(dispatch_users), AITask.lease_state == "reserved"
        ))).all()
        assert len(reserved) == 4
        assert all(item.dispatch_generation == 1 for item in reserved)


@pytest.mark.asyncio
async def test_cancelled_and_terminal_rows_are_never_claimed(task_db, dispatch_users):
    await seed(task_db, [dispatch_users[0]], status="cancelled")
    await seed(task_db, [dispatch_users[0]], status="failed")
    assert await claim(task_db) is None


@pytest.mark.asyncio
async def test_per_user_capacity_is_two(task_db, dispatch_users):
    await seed(task_db, [dispatch_users[0]] * 6)
    claims = [await claim(task_db, 8, 2) for _ in range(2)]
    assert all(item is not None for item in claims)
    assert len({item.task_id for item in claims}) == 2
    assert await claim(task_db, 8, 2) is None


@pytest.mark.asyncio
async def test_two_sessions_cannot_overclaim_one_global_slot(task_db, dispatch_users):
    await seed(task_db, dispatch_users[:2])
    first, second = await asyncio.wait_for(
        asyncio.gather(claim(task_db, 1), claim(task_db, 1)), 10
    )
    assert sum(item is not None for item in (first, second)) == 1


@pytest.mark.asyncio
async def test_two_sessions_at_global_and_user_boundary(task_db, dispatch_users):
    await seed(task_db, [dispatch_users[0]] * 3 + [dispatch_users[1]])
    prior = await claim(task_db, 3, 2)
    assert prior is not None and prior.user_id == dispatch_users[0]
    first, second = await asyncio.wait_for(
        asyncio.gather(claim(task_db, 3, 2), claim(task_db, 3, 2)), 10
    )
    assert first is not None and second is not None
    assert {first.user_id, second.user_id} == set(dispatch_users[:2])
    assert await claim(task_db, 3, 2) is None


@pytest.mark.asyncio
async def test_two_sessions_cannot_both_take_last_user_slot(task_db, dispatch_users):
    await seed(task_db, [dispatch_users[0]] * 4)
    assert await claim(task_db, 4, 2) is not None
    first, second = await asyncio.wait_for(
        asyncio.gather(claim(task_db, 4, 2), claim(task_db, 4, 2)), 10
    )
    assert sum(item is not None for item in (first, second)) == 1
