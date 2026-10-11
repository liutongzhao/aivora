import asyncio
import os
import sys
from pathlib import Path
import subprocess
from uuid import uuid4

import asyncpg
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


BACKEND_ROOT = Path(__file__).resolve().parents[1] / "services" / "backend"
POSTGRES_HOST = os.getenv("AIVORA_TEST_POSTGRES_HOST", "127.0.0.1")
POSTGRES_PORT = int(os.getenv("AIVORA_TEST_POSTGRES_PORT", "15439"))
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def _run_database_command(sql: str) -> None:
    async def execute() -> None:
        connection = await asyncpg.connect(
            host=POSTGRES_HOST,
            port=POSTGRES_PORT,
            user="aivora",
            password="aivora",
            database="postgres",
        )
        try:
            await connection.execute(sql)
        finally:
            await connection.close()

    asyncio.run(execute())


@pytest.fixture(scope="session")
def registration_database():
    name = f"aivora_registration_{uuid4().hex[:12]}"
    _run_database_command(f"CREATE DATABASE {name}")
    flyway = [
        "docker", "run", "--rm", "-v",
        f"{BACKEND_ROOT / 'db/migrations'}:/flyway/sql:ro",
        "flyway/flyway:latest",
        f"-url=jdbc:postgresql://host.docker.internal:15439/{name}",
        "-user=aivora", "-password=aivora",
    ]
    if sys.platform.startswith("linux"):
        flyway[2:2] = ["--add-host", "host.docker.internal:host-gateway"]
    try:
        subprocess.run(flyway + ["migrate"], check=True, capture_output=True, text=True)
        yield f"postgresql+asyncpg://aivora:aivora@{POSTGRES_HOST}:{POSTGRES_PORT}/{name}"
    finally:
        _run_database_command(f"DROP DATABASE {name} WITH (FORCE)")


@pytest_asyncio.fixture
async def registration_db(registration_database):
    engine = create_async_engine(registration_database)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    yield factory
    await engine.dispose()
