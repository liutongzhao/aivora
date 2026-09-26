import subprocess
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
import pytest_asyncio
from minio import Minio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.infrastructure.storage import storage


@pytest.fixture(scope="session")
def isolated_infrastructure():
    suffix = uuid4().hex[:12]
    database = f"aivora_task1_{suffix}"
    bucket = f"aivora-task1-{suffix}"
    root = Path(__file__).resolve().parents[2]
    subprocess.run(
        ["docker", "exec", "aivora-postgres", "psql", "-U", "aivora", "-d", "postgres",
         "-v", "ON_ERROR_STOP=1", "-c", f"CREATE DATABASE {database}"],
        check=True, capture_output=True, text=True,
    )
    client = Minio("127.0.0.1:19000", access_key="aivora", secret_key="change-me", secure=False)
    try:
        flyway = [
            "docker", "run", "--rm", "-v", f"{root / 'backend/db/migrations'}:/flyway/sql:ro",
            "flyway/flyway:latest",
            f"-url=jdbc:postgresql://host.docker.internal:15439/{database}",
            "-user=aivora", "-password=aivora",
        ]
        for command in ("migrate", "validate"):
            subprocess.run(flyway + [command], check=True, capture_output=True, text=True)
        client.make_bucket(bucket)
        original_bucket = storage.bucket
        storage.bucket = bucket
        yield f"postgresql+asyncpg://aivora:aivora@127.0.0.1:15439/{database}", bucket
        storage.bucket = original_bucket
    finally:
        if client.bucket_exists(bucket):
            for item in client.list_objects(bucket, recursive=True):
                client.remove_object(bucket, item.object_name)
            client.remove_bucket(bucket)
        subprocess.run(
            ["docker", "exec", "aivora-postgres", "psql", "-U", "aivora", "-d", "postgres",
             "-v", "ON_ERROR_STOP=1", "-c", f"DROP DATABASE {database} WITH (FORCE)"],
            check=True, capture_output=True, text=True,
        )


@pytest_asyncio.fixture
async def task_db(isolated_infrastructure):
    engine = create_async_engine(isolated_infrastructure[0])
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.execute(text(
            "INSERT INTO users (id, email, password_hash) VALUES "
            "('00000000-0000-0000-0000-000000000001', 'task1a@example.test', 'x'), "
            "('00000000-0000-0000-0000-000000000002', 'task1b@example.test', 'x') "
            "ON CONFLICT (id) DO NOTHING"
        ))
    yield factory
    await engine.dispose()


@pytest_asyncio.fixture
async def dispatch_users(task_db):
    users = [uuid4() for _ in range(4)]
    async with task_db() as db:
        for index, user in enumerate(users):
            await db.execute(
                text("INSERT INTO users (id, email, password_hash) VALUES (:id, :email, 'x')"),
                {"id": user, "email": f"dispatch-{user}-{index}@example.test"},
            )
        await db.commit()
    yield users
    async with task_db() as db:
        for user in users:
            await db.execute(text("DELETE FROM users WHERE id = :id"), {"id": user})
        await db.commit()


@pytest.fixture
def dispatch_boundary(monkeypatch):
    from app.modules.tasks import service
    monkeypatch.setattr(
        service, "get_settings",
        lambda: SimpleNamespace(redis_url="redis://unused", byok_required=False),
    )

    class FakeRedis:
        def __init__(self):
            self.values = {}

        async def set(self, key, value, ex=None):
            self.values[key] = value

        async def get(self, key):
            return self.values.get(key)

        async def delete(self, key):
            self.values.pop(key, None)

        async def aclose(self):
            pass

    redis = FakeRedis()
    dispatched = []

    async def append(*args, **kwargs):
        return "1-0"

    monkeypatch.setattr(service.event_bus, "append", append)
    monkeypatch.setattr(
        service.celery_app, "send_task",
        lambda *args, **kwargs: dispatched.append((args[0], kwargs)),
    )
    return redis, dispatched
