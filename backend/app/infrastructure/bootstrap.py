from sqlalchemy import select

from app.config import get_settings
from app.infrastructure.database import session_factory
from app.modules.identity.models import User
from app.modules.identity.passwords import hash_password
from app.infrastructure.storage import storage


async def bootstrap_initial_admin() -> None:
    storage.ensure_bucket()
    settings = get_settings()
    if not settings.initial_admin_email or not settings.initial_admin_password:
        return
    async with session_factory() as db:
        result = await db.execute(select(User).where(User.email == settings.initial_admin_email.lower()))
        if result.scalar_one_or_none():
            return
        db.add(
            User(
                email=settings.initial_admin_email.lower(),
                username="admin",
                password_hash=hash_password(settings.initial_admin_password),
                role="admin",
            )
        )
        await db.commit()
