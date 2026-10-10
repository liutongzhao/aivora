import asyncio
import json
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database import get_db_session
from app.infrastructure.events import event_bus
from app.infrastructure.storage import storage
from app.modules.files.models import StoredFile
from app.modules.identity.dependencies import get_current_user
from app.modules.identity.models import User
from app.modules.tasks.models import AITask, Answer, TaskImage, TaskStreamToken
from app.modules.tasks.schemas import ProcessScreenshotRequest, TaskCreatedResponse, TaskResponse
from app.modules.tasks.service import TaskService, hash_stream_token
from app.modules.usage.service import UsageError

router = APIRouter(prefix="/api/ai", tags=["ai"])


async def _find_stream_task(
    task_id: UUID,
    token: str,
    db: AsyncSession,
) -> AITask:
    task = await db.get(AITask, task_id)
    if not task:
        raise HTTPException(status_code=401, detail="SSE Token 无效或已过期")
    token_hash = hash_stream_token(token)
    now = datetime.now(timezone.utc)
    legacy_valid = (
        task.stream_token_hash == token_hash
        and task.stream_token_expires_at is not None
        and task.stream_token_expires_at > now
    )
    issued_valid = await db.scalar(select(TaskStreamToken.token_hash).where(
        TaskStreamToken.task_id == task_id,
        TaskStreamToken.token_hash == token_hash,
        TaskStreamToken.expires_at > now,
    ))
    if not legacy_valid and not issued_valid:
        raise HTTPException(status_code=401, detail="SSE Token 无效或已过期")
    return task


async def _database_terminal(task_id: UUID, db: AsyncSession) -> dict | None:
    task = await db.scalar(
        select(AITask).where(AITask.id == task_id).execution_options(populate_existing=True)
    )
    if not task:
        return None
    if task.status == "failed":
        return {
            "type": "error", "task_id": str(task_id), "stage": "error",
            "data": {"code": task.error_code or "TASK_FAILED", "message": "任务处理失败"},
        }
    if task.status == "cancelled":
        return {
            "type": "cancelled", "task_id": str(task_id), "stage": "cancelled",
            "data": {"message": "任务已取消"},
        }
    if task.status == "completed":
        answer = await db.scalar(select(Answer).where(Answer.task_id == task_id))
        result = None if answer is None else {
            "questionType": answer.question_type, "content": answer.content,
            "rawContent": answer.raw_content, "parsed": answer.parsed,
            "parseWarning": answer.parse_warning,
        }
        return {
            "type": "completed", "task_id": str(task_id), "stage": "completed",
            "data": {"result": result, **(result or {})},
        }
    return None


def _stream_frame(event: dict) -> str:
    return "event: message\ndata: " + json.dumps(event, ensure_ascii=False) + "\n\n"


@router.post("/process-screenshot", response_model=TaskCreatedResponse)
async def process_screenshot(
    request: ProcessScreenshotRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> TaskCreatedResponse:
    try:
        task, stream_token = await TaskService(db).create(user.id, request)
    except UsageError as error:
        raise HTTPException(status_code=error.status_code, detail={"code": error.code, "message": error.message})
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    if not stream_token:
        raise HTTPException(status_code=409, detail="重复任务已存在，请重新提交新的请求标识")
    return TaskCreatedResponse(task_id=task.id, stream_token=stream_token)


@router.get("/tasks")
async def list_tasks(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
) -> dict:
    safe_page = max(page, 1)
    safe_page_size = min(max(page_size, 1), 100)
    statuses = [item.strip() for item in status.split(",") if item.strip()] if status else []
    task_filter = [AITask.user_id == user.id]
    if statuses:
        task_filter.append(AITask.status.in_(statuses))
    total = await db.scalar(
        select(func.count()).select_from(AITask).where(*task_filter)
    )
    result = await db.execute(
        select(AITask)
        .where(*task_filter)
        .order_by(AITask.created_at.desc())
        .offset((safe_page - 1) * safe_page_size)
        .limit(safe_page_size)
    )
    return {
        "page": safe_page,
        "page_size": safe_page_size,
        "total": total or 0,
        "tasks": [
            {
                "id": str(task.id),
                "user_id": str(task.user_id),
                "mode": task.mode,
                "status": task.status,
                "stage": task.stage,
                "progress": task.progress,
                "error_code": task.error_code,
                "error_message": task.error_message,
                "created_at": task.created_at,
                "completed_at": task.completed_at,
            }
            for task in result.scalars().all()
        ]
    }


@router.get("/stream/{task_id}")
async def stream_task(
    task_id: UUID,
    request: Request,
    token: str,
    db: AsyncSession = Depends(get_db_session),
) -> StreamingResponse:
    task = await _find_stream_task(task_id, token, db)
    last_id = request.headers.get("Last-Event-ID", "0-0")

    async def event_generator():
        yield _stream_frame({"type": "connected", "task_id": str(task.id)})
        try:
            for event in await event_bus.read_after(task.id, last_id):
                yield f"id: {event.get('id', '')}\nevent: message\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"
                if event.get("type") in {"completed", "error", "cancelled"}:
                    return
            terminal = await _database_terminal(task.id, db)
            if terminal:
                yield _stream_frame(terminal)
                return
            async for event in event_bus.listen(task.id):
                if await request.is_disconnected():
                    return
                if event.get("type") == "heartbeat":
                    terminal = await _database_terminal(task.id, db)
                    if terminal:
                        yield _stream_frame(terminal)
                        return
                    yield ": heartbeat\n\n"
                    continue
                yield f"id: {event.get('id', '')}\nevent: message\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"
                if event.get("type") in {"completed", "error", "cancelled"}:
                    return
        except Exception:
            terminal = await _database_terminal(task.id, db)
            yield _stream_frame(terminal or {
                "type": "error", "task_id": str(task.id), "stage": "error",
                "data": {"code": "STREAM_UNAVAILABLE", "message": "事件流暂不可用"},
            })

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/tasks/{task_id}/images/{file_id}")
async def get_task_image(
    task_id: UUID,
    file_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> Response:
    file = await db.scalar(
        select(StoredFile)
        .join(TaskImage, TaskImage.stored_file_id == StoredFile.id)
        .join(AITask, AITask.id == TaskImage.task_id)
        .where(
            TaskImage.task_id == task_id,
            StoredFile.id == file_id,
            AITask.user_id == user.id,
            StoredFile.deleted_at.is_(None),
        )
    )
    if not file:
        raise HTTPException(status_code=404, detail="题目截图不存在")
    try:
        content = await asyncio.to_thread(storage.get_bytes, file.object_key)
    except Exception as error:
        raise HTTPException(status_code=404, detail="题目截图读取失败") from error
    return Response(
        content=content,
        media_type=file.content_type or "application/octet-stream",
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> TaskResponse:
    try:
        task, answer = await TaskService(db).get_task(user.id, task_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))
    result = None
    if answer:
        result = {
            "questionType": answer.question_type,
            "content": answer.content,
            "rawContent": answer.raw_content,
            "parsed": answer.parsed,
            "parseWarning": answer.parse_warning,
        }
    files = (await db.execute(
        select(StoredFile)
        .join(TaskImage, TaskImage.stored_file_id == StoredFile.id)
        .where(TaskImage.task_id == task_id)
        .order_by(TaskImage.ordinal)
    )).scalars().all()
    if result is None:
        result = {}
    result["images"] = [
        {
            "id": str(file.id),
            "contentType": file.content_type,
            "url": f"/api/ai/tasks/{task_id}/images/{file.id}",
        }
        for file in files
    ]
    return TaskResponse(
        id=task.id,
        mode=task.mode,
        status=task.status,
        stage=task.stage,
        progress=task.progress,
        error_code=task.error_code,
        error_message=task.error_message,
        created_at=task.created_at,
        completed_at=task.completed_at,
        result=result,
    )


@router.get("/tasks/{task_id}/stream-token")
async def issue_stream_token(
    task_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    try:
        token = await TaskService(db).issue_stream_token(user.id, task_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))
    return {"token": token}


@router.delete("/tasks/{task_id}")
async def cancel_task(
    task_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    task = await db.scalar(select(AITask).where(AITask.id == task_id, AITask.user_id == user.id))
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.status in {"completed", "failed", "cancelled"}:
        return {"success": True}
    cancelled = await db.scalar(
        update(AITask).where(
            AITask.id == task_id,
            AITask.user_id == user.id,
            AITask.status.not_in(("completed", "failed", "cancelled")),
        ).values(
            status="cancelled", stage="cancelled",
        ).returning(AITask.id)
    )
    await db.commit()
    if cancelled:
        await event_bus.append(task.id, "cancelled", {"message": "任务已取消"}, stage="cancelled")
    return {"success": True}
