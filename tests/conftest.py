import sys
from pathlib import Path
import subprocess
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


BACKEND_ROOT = Path(__file__).resolve().parents[1] / "services" / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture(scope="session")
def registration_database():
    name = f"aivora_registration_{uuid4().hex[:12]}"
    subprocess.run(
        ["docker", "exec", "aivora-postgres", "psql", "-U", "aivora", "-d", "postgres",
         "-v", "ON_ERROR_STOP=1", "-c", f"CREATE DATABASE {name}"],
        check=True, capture_output=True, text=True,
    )
    flyway = [
        "docker", "run", "--rm", "-v",
        f"{BACKEND_ROOT / 'db/migrations'}:/flyway/sql:ro",
        "flyway/flyway:latest",
        f"-url=jdbc:postgresql://host.docker.internal:15439/{name}",
        "-user=aivora", "-password=aivora",
    ]
    try:
        subprocess.run(flyway + ["migrate"], check=True, capture_output=True, text=True)
        yield f"postgresql+asyncpg://aivora:aivora@127.0.0.1:15439/{name}"
    finally:
        subprocess.run(
            ["docker", "exec", "aivora-postgres", "psql", "-U", "aivora", "-d", "postgres",
             "-v", "ON_ERROR_STOP=1", "-c", f"DROP DATABASE {name} WITH (FORCE)"],
            check=True, capture_output=True, text=True,
        )


@pytest_asyncio.fixture
async def registration_db(registration_database):
    engine = create_async_engine(registration_database)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    yield factory
    await engine.dispose()
