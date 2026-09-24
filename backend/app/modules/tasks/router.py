import asyncio
import json
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database import get_db_session
from app.infrastructure.events import event_bus
from app.modules.identity.dependencies import get_current_user
from app.modules.identity.models import User
from app.modules.tasks.models import AITask
from app.modules.tasks.schemas import ProcessScreenshotRequest, TaskCreatedResponse, TaskResponse
from app.modules.tasks.service import TaskService, hash_stream_token

router = APIRouter(prefix="/api/ai", tags=["ai"])


async def _find_stream_task(
    task_id: UUID,
    token: str,
    db: AsyncSession,
) -> AITask:
    task = await db.get(AITask, task_id)
    if (
        not task
        or not task.stream_token_hash
        or task.stream_token_hash != hash_stream_token(token)
        or not task.stream_token_expires_at
        or task.stream_token_expires_at <= datetime.now(timezone.utc)
    ):
        raise HTTPException(status_code=401, detail="SSE Token 无效或已过期")
    return task


@router.post("/process-screenshot", response_model=TaskCreatedResponse)
async def process_screenshot(
    request: ProcessScreenshotRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> TaskCreatedResponse:
    try:
        task, stream_token = await TaskService(db).create(user.id, request)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    if not stream_token:
        raise HTTPException(status_code=409, detail="重复任务已存在，请重新提交新的请求标识")
    return TaskCreatedResponse(task_id=task.id, stream_token=stream_token)


@router.get("/tasks")
async def list_tasks(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    limit: int = 50,
) -> dict:
    result = await db.execute(
        select(AITask)
        .where(AITask.user_id == user.id)
        .order_by(AITask.created_at.desc())
        .limit(min(max(limit, 1), 100))
    )
    return {
        "tasks": [
            {
                "id": str(task.id),
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
        yield "event: message\ndata: " + json.dumps(
            {"type": "connected", "task_id": str(task.id)}, ensure_ascii=False
        ) + "\n\n"
        for event in await event_bus.read_after(task.id, last_id):
            yield f"id: {event.get('id', '')}\nevent: message\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"
            if event.get("type") in {"completed", "error", "cancelled"}:
                return
        async for event in event_bus.listen(task.id):
            if await request.is_disconnected():
                return
            if event.get("type") == "heartbeat":
                yield ": heartbeat\n\n"
                continue
            yield f"id: {event.get('id', '')}\nevent: message\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"
            if event.get("type") in {"completed", "error", "cancelled"}:
                return

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
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
        }
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


@router.delete("/tasks/{task_id}")
async def cancel_task(
    task_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    task = await db.get(AITask, task_id)
    if not task or task.user_id != user.id:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.status in {"completed", "failed", "cancelled"}:
        return {"success": True}
    task.status = "cancelled"
    task.stage = "cancelled"
    await db.commit()
    await event_bus.append(task.id, "cancelled", {"message": "任务已取消"}, stage="cancelled")
    return {"success": True}
