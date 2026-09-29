import threading
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings

settings = get_settings()
engine = create_async_engine(settings.database_url, pool_pre_ping=True)


class ThreadLocalSessionFactory:
    """Keep asyncpg pools bound to the event loop that owns them."""

    def __init__(self, default_engine) -> None:
        self._default_factory = async_sessionmaker(default_engine, expire_on_commit=False)
        self._local = threading.local()

    def _factory(self):
        factory = getattr(self._local, "factory", None)
        if factory is None and threading.current_thread() is not threading.main_thread():
            worker_engine = create_async_engine(settings.database_url, pool_pre_ping=True)
            factory = async_sessionmaker(worker_engine, expire_on_commit=False)
            self._local.engine = worker_engine
            self._local.factory = factory
        return factory or self._default_factory

    def __call__(self, **kwargs):
        return self._factory()(**kwargs)

    def configure(self, **kwargs) -> None:
        self._default_factory.configure(**kwargs)


session_factory = ThreadLocalSessionFactory(engine)


async def get_db_session() -> AsyncIterator[AsyncSession]:
    async with session_factory() as session:
        yield session
