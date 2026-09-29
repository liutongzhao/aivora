from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.identity.models import Session, User


class IdentityRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def find_user_by_email(self, email: str) -> User | None:
        result = await self.db.execute(select(User).where(User.email == email.lower()))
        return result.scalar_one_or_none()

    async def find_user(self, user_id: UUID) -> User | None:
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def create_user(self, user: User) -> User:
        self.db.add(user)
        await self.db.flush()
        return user

    async def create_session(self, session: Session) -> Session:
        self.db.add(session)
        await self.db.flush()
        return session

    async def find_session(self, token_hash: str) -> Session | None:
        result = await self.db.execute(
            select(Session).where(
                Session.token_hash == token_hash,
                Session.revoked_at.is_(None),
                Session.expires_at > datetime.now(timezone.utc),
            )
        )
        return result.scalar_one_or_none()

    async def touch_session(self, session_id: UUID) -> None:
        await self.db.execute(
            update(Session)
            .where(Session.id == session_id)
            .values(last_used_at=datetime.now(timezone.utc))
        )

    async def revoke_session(self, session_id: UUID) -> None:
        await self.db.execute(
            update(Session)
            .where(Session.id == session_id)
            .values(revoked_at=datetime.now(timezone.utc))
        )

