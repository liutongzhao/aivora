from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.models.models import AIModel
from app.modules.models.schemas import AIModelCreate


class ModelCatalogService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_enabled(self) -> list[AIModel]:
        result = await self.db.execute(
            select(AIModel).where(AIModel.enabled.is_(True)).order_by(AIModel.sort_order, AIModel.name)
        )
        return list(result.scalars().all())

    async def list_all(self) -> list[AIModel]:
        result = await self.db.execute(select(AIModel).order_by(AIModel.sort_order, AIModel.name))
        return list(result.scalars().all())

    async def create(self, request: AIModelCreate) -> AIModel:
        model = AIModel(**request.model_dump())
        self.db.add(model)
        await self.db.commit()
        await self.db.refresh(model)
        return model

    async def set_enabled(self, model_id: UUID, enabled: bool) -> AIModel | None:
        model = await self.db.get(AIModel, model_id)
        if not model:
            return None
        model.enabled = enabled
        await self.db.commit()
        await self.db.refresh(model)
        return model

