import json
from collections.abc import AsyncIterator
from uuid import UUID, uuid4

from redis.asyncio import Redis

from app.config import get_settings


class EventBus:
    def __init__(self) -> None:
        self.redis: Redis | None = None

    def _client(self) -> Redis:
        if self.redis is None:
            self.redis = Redis.from_url(get_settings().redis_url, decode_responses=True)
        return self.redis

    def reset_for_worker_process(self) -> None:
        self.redis = None

    @staticmethod
    def stream_key(task_id: UUID | str) -> str:
        return f"aivora:task-events:{task_id}"

    async def append(
        self,
        task_id: UUID | str,
        event_type: str,
        data: dict,
        stage: str | None = None,
        progress: int | None = None,
    ) -> str:
        payload = {
            "id": str(uuid4()),
            "type": event_type,
            "task_id": str(task_id),
            "stage": stage,
            "progress": progress,
            "data": data,
        }
        event_id = await self._client().xadd(
            self.stream_key(task_id),
            {"payload": json.dumps(payload, ensure_ascii=False)},
            maxlen=1000,
            approximate=True,
        )
        return event_id

    async def read_after(self, task_id: UUID | str, last_id: str = "0-0") -> list[dict]:
        rows = await self._client().xrange(self.stream_key(task_id), min=f"({last_id}", max="+")
        return [json.loads(fields["payload"]) for _, fields in rows]

    async def listen(self, task_id: UUID | str, last_id: str = "$") -> AsyncIterator[dict]:
        current = last_id
        while True:
            rows = await self._client().xread({self.stream_key(task_id): current}, block=15000, count=20)
            if not rows:
                yield {"type": "heartbeat", "task_id": str(task_id), "data": {}}
                continue
            for _, entries in rows:
                for redis_id, fields in entries:
                    current = redis_id
                    yield json.loads(fields["payload"])


event_bus = EventBus()
