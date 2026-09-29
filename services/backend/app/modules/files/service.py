import hashlib
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.infrastructure.storage import storage
from app.modules.files.models import StoredFile


class FileService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def save_bytes(
        self,
        user_id: UUID,
        data: bytes,
        content_type: str,
        task_id: UUID | None = None,
        prefix: str = "task-images",
        expires_hours: int | None = 24,
        commit: bool = True,
        uploaded_keys: list[str] | None = None,
    ) -> StoredFile:
        if not data:
            raise HTTPException(status_code=400, detail="文件不能为空")
        if len(data) > 20 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="文件不能超过 20MB")
        digest = hashlib.sha256(data).hexdigest()
        object_key = f"{prefix}/{user_id}/{task_id or uuid4()}/{uuid4()}"
        if uploaded_keys is not None:
            uploaded_keys.append(object_key)
        stored = storage.put_bytes(object_key, data, content_type)
        expires_at = (
            datetime.now(timezone.utc) + timedelta(hours=expires_hours)
            if expires_hours
            else None
        )
        file = StoredFile(
            user_id=user_id,
            task_id=task_id,
            bucket_name=stored.bucket,
            object_key=stored.object_key,
            content_type=stored.content_type,
            size_bytes=stored.size_bytes,
            sha256=digest,
            expires_at=expires_at,
        )
        self.db.add(file)
        if commit:
            await self.db.commit()
            await self.db.refresh(file)
        else:
            await self.db.flush()
        return file

    async def get_owned(self, user_id: UUID, file_id: UUID) -> StoredFile:
        result = await self.db.execute(
            select(StoredFile).where(
                StoredFile.id == file_id,
                StoredFile.user_id == user_id,
                StoredFile.deleted_at.is_(None),
            )
        )
        file = result.scalar_one_or_none()
        if not file:
            raise HTTPException(status_code=404, detail="文件不存在")
        return file

    async def signed_url(self, user_id: UUID, file_id: UUID) -> str:
        file = await self.get_owned(user_id, file_id)
        return storage.presigned_get(file.object_key)

    async def delete(self, user_id: UUID, file_id: UUID) -> None:
        file = await self.get_owned(user_id, file_id)
        storage.delete(file.object_key)
        file.deleted_at = datetime.now(timezone.utc)
        await self.db.commit()
