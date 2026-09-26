from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.byok.crypto import decrypt_secret, encrypt_secret
from app.modules.byok.models import (
    ProviderConnection,
    QuestionModelDefault,
    UserModel,
    UserPromptVersion,
)
from app.modules.byok.schemas import (
    ConnectionCreate,
    ConnectionUpdate,
    ModelCreate,
    ModelDefaultUpdate,
    PromptUpdate,
)


MODES = {"programming", "debug", "single_choice", "multiple_choice", "universal"}


class BYOKService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def connections(self, user_id: UUID) -> list[ProviderConnection]:
        return list((await self.db.scalars(
            select(ProviderConnection).where(ProviderConnection.user_id == user_id)
        )).all())

    async def create_connection(self, user_id: UUID, request: ConnectionCreate) -> ProviderConnection:
        item = ProviderConnection(
            user_id=user_id, name=request.name, base_url=str(request.base_url).rstrip("/"),
            api_key_encrypted=encrypt_secret(request.api_key),
        )
        self.db.add(item)
        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def update_connection(
        self, user_id: UUID, connection_id: UUID, request: ConnectionUpdate,
    ) -> ProviderConnection | None:
        item = await self.db.scalar(select(ProviderConnection).where(
            ProviderConnection.id == connection_id, ProviderConnection.user_id == user_id,
        ))
        if not item:
            return None
        if request.name is not None:
            item.name = request.name
        if request.base_url is not None:
            item.base_url = str(request.base_url).rstrip("/")
        if request.api_key is not None:
            if not request.replace_key:
                raise ValueError("替换 API 密钥需要确认")
            item.api_key_encrypted = encrypt_secret(request.api_key)
        if request.enabled is not None:
            item.enabled = request.enabled
        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def delete_connection(self, user_id: UUID, connection_id: UUID) -> bool:
        item = await self.db.scalar(select(ProviderConnection).where(
            ProviderConnection.id == connection_id, ProviderConnection.user_id == user_id,
        ))
        if not item:
            return False
        item.enabled = False
        await self.db.commit()
        return True

    async def models(self, user_id: UUID) -> list[UserModel]:
        return list((await self.db.scalars(
            select(UserModel).where(UserModel.user_id == user_id)
        )).all())

    async def resolve_runtime(self, user_id: UUID, mode: str):
        default = await self.db.scalar(select(QuestionModelDefault).where(
            QuestionModelDefault.user_id == user_id, QuestionModelDefault.mode == mode,
        ))
        if not default:
            raise ValueError("请先为该题型配置模型")
        model = await self.db.scalar(select(UserModel).where(
            UserModel.id == default.model_id, UserModel.user_id == user_id,
            UserModel.enabled.is_(True),
        ))
        if not model:
            raise ValueError("默认模型不可用")
        connection = await self.db.scalar(select(ProviderConnection).where(
            ProviderConnection.id == model.connection_id,
            ProviderConnection.user_id == user_id,
            ProviderConnection.enabled.is_(True),
        ))
        if not connection:
            raise ValueError("模型连接不可用")
        return {
            "connection_id": connection.id,
            "model_id": model.id,
            "model": model.name,
            "base_url": connection.base_url,
            "api_key": decrypt_secret(connection.api_key_encrypted),
            "language": default.language,
        }

    async def create_model(self, user_id: UUID, request: ModelCreate) -> UserModel:
        connection = await self.db.scalar(select(ProviderConnection).where(
            ProviderConnection.id == request.connection_id,
            ProviderConnection.user_id == user_id,
            ProviderConnection.enabled.is_(True),
        ))
        if not connection:
            raise ValueError("连接不存在")
        item = UserModel(user_id=user_id, **request.model_dump())
        self.db.add(item)
        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def set_default(
        self, user_id: UUID, mode: str, request: ModelDefaultUpdate,
    ) -> QuestionModelDefault:
        if mode not in MODES:
            raise ValueError("不支持的题型")
        model = await self.db.scalar(select(UserModel).where(
            UserModel.id == request.model_id, UserModel.user_id == user_id,
            UserModel.enabled.is_(True), UserModel.supports_vision.is_(True),
        ))
        if not model:
            raise ValueError("模型不存在或不支持图片")
        item = await self.db.scalar(select(QuestionModelDefault).where(
            QuestionModelDefault.user_id == user_id, QuestionModelDefault.mode == mode,
        ))
        if item:
            item.model_id = model.id
            item.language = request.language
        else:
            item = QuestionModelDefault(
                user_id=user_id, mode=mode, model_id=model.id, language=request.language,
            )
            self.db.add(item)
        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def prompts(self, user_id: UUID, mode: str) -> list[UserPromptVersion]:
        return list((await self.db.scalars(select(UserPromptVersion).where(
            UserPromptVersion.user_id == user_id, UserPromptVersion.mode == mode,
        ).order_by(UserPromptVersion.version.desc()))).all())

    async def save_prompt(self, user_id: UUID, mode: str, request: PromptUpdate) -> UserPromptVersion:
        if mode not in MODES:
            raise ValueError("不支持的题型")
        version = await self.db.scalar(select(func.coalesce(func.max(
            UserPromptVersion.version
        ), 0)).where(
            UserPromptVersion.user_id == user_id, UserPromptVersion.mode == mode,
        ))
        item = UserPromptVersion(
            user_id=user_id, mode=mode, version=int(version) + 1, content=request.content,
        )
        self.db.add(item)
        await self.db.commit()
        await self.db.refresh(item)
        return item
