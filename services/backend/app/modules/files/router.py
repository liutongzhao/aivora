from uuid import UUID

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database import get_db_session
from app.modules.files.schemas import FileResponse, FileUrlResponse
from app.modules.files.service import FileService
from app.modules.identity.dependencies import get_current_user
from app.modules.identity.models import User

router = APIRouter(prefix="/api/files", tags=["files"])


@router.post("/upload", response_model=FileResponse)
async def upload_file(
    upload: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> object:
    data = await upload.read()
    return await FileService(db).save_bytes(
        user.id,
        data,
        upload.content_type or "application/octet-stream",
    )


@router.get("/{file_id}/download-url", response_model=FileUrlResponse)
async def get_download_url(
    file_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> FileUrlResponse:
    expires_in = 600
    url = await FileService(db).signed_url(user.id, file_id)
    return FileUrlResponse(file_id=file_id, url=url, expires_in=expires_in)


@router.delete("/{file_id}")
async def delete_file(
    file_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    await FileService(db).delete(user.id, file_id)
    return {"success": True}
