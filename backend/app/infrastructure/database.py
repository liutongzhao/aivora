from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings

settings = get_settings()
engine = create_async_engine(settings.database_url, pool_pre_ping=True)
session_factory = async_sessionmaker(engine, expire_on_commit=False)


def reset_for_worker_process() -> None:
    """Drop inherited pool state after Celery forks a worker child."""
    global engine
    engine.sync_engine.dispose(close=False)
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    session_factory.configure(bind=engine)


async def get_db_session() -> AsyncIterator[AsyncSession]:
    async with session_factory() as session:
        yield session
