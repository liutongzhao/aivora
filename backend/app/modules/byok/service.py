from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.byok.crypto import decrypt_secret, encrypt_secret
from app.modules.byok.outbound import probe_connection, probe_model, validate_endpoint
from app.modules.byok.models import (
    ProviderConnection,
    QuestionModelDefault,
    UserModel,
    UserPromptVersion,
)
from app.modules.byok.schemas import (
    ConnectionCreate,
    ConnectionTestRequest,
    ConnectionUpdate,
    ModelCreate,
    ModelDefaultUpdate,
    ModelUpdate,
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
            user_id=user_id, name=request.name, base_url=validate_endpoint(str(request.base_url)),
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
            item.base_url = validate_endpoint(str(request.base_url))
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

    async def test_connection(self, user_id: UUID, connection_id: UUID) -> list[str]:
        item = await self.db.scalar(select(ProviderConnection).where(
            ProviderConnection.id == connection_id, ProviderConnection.user_id == user_id,
        ))
        if not item:
            raise ValueError("连接不存在")
        return await probe_connection(item.base_url, decrypt_secret(item.api_key_encrypted))

    async def test_new_connection(self, request: ConnectionTestRequest) -> list[str]:
        return await probe_connection(str(request.base_url), request.api_key)

    async def models(self, user_id: UUID) -> list[UserModel]:
        return list((await self.db.scalars(
            select(UserModel).where(
                UserModel.user_id == user_id,
                UserModel.archived.is_(False),
            )
        )).all())

    async def defaults(self, user_id: UUID) -> list[QuestionModelDefault]:
        return list((await self.db.scalars(
            select(QuestionModelDefault).where(QuestionModelDefault.user_id == user_id)
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
            UserModel.archived.is_(False),
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
        prompt = await self.db.scalar(
            select(UserPromptVersion)
            .where(
                UserPromptVersion.user_id == user_id,
                UserPromptVersion.mode == mode,
                UserPromptVersion.enabled.is_(True),
            )
            .order_by(UserPromptVersion.version.desc())
        )
        return {
            "connection_id": connection.id,
            "model_id": model.id,
            "prompt_version_id": prompt.id if prompt else None,
            "prompt": prompt.content if prompt else None,
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
        existing = await self.db.scalar(select(UserModel.id).where(
            UserModel.connection_id == connection.id,
            UserModel.name == request.name,
            UserModel.archived.is_(False),
        ))
        if existing:
            raise ValueError("该连接下的模型已添加")
        item = UserModel(user_id=user_id, **request.model_dump())
        self.db.add(item)
        try:
            await self.db.commit()
        except IntegrityError as error:
            await self.db.rollback()
            raise ValueError("该连接下的模型已添加") from error
        await self.db.refresh(item)
        return item

    async def update_model(
        self, user_id: UUID, model_id: UUID, request: ModelUpdate,
    ) -> UserModel | None:
        item = await self.db.scalar(select(UserModel).where(
            UserModel.id == model_id,
            UserModel.user_id == user_id,
            UserModel.archived.is_(False),
        ))
        if not item:
            return None
        if request.connection_id is not None:
            connection = await self.db.scalar(select(ProviderConnection).where(
                ProviderConnection.id == request.connection_id,
                ProviderConnection.user_id == user_id,
                ProviderConnection.enabled.is_(True),
            ))
            if not connection:
                raise ValueError("连接不存在或已停用")
            item.connection_id = connection.id
        if request.name is not None:
            item.name = request.name
        if request.display_name is not None:
            item.display_name = request.display_name
        if request.name is not None or request.connection_id is not None:
            with self.db.no_autoflush:
                existing = await self.db.scalar(select(UserModel.id).where(
                    UserModel.connection_id == item.connection_id,
                    UserModel.name == item.name,
                    UserModel.id != item.id,
                    UserModel.archived.is_(False),
                ))
            if existing:
                raise ValueError("该连接下的模型已添加")
        if request.supports_vision is not None:
            item.supports_vision = request.supports_vision
        if request.enabled is not None:
            item.enabled = request.enabled
        try:
            await self.db.commit()
        except IntegrityError as error:
            await self.db.rollback()
            raise ValueError("该连接下的模型已添加") from error
        await self.db.refresh(item)
        return item

    async def remove_model(self, user_id: UUID, model_id: UUID) -> bool:
        item = await self.db.scalar(select(UserModel).where(
            UserModel.id == model_id,
            UserModel.user_id == user_id,
            UserModel.archived.is_(False),
        ))
        if not item:
            return False
        default = await self.db.scalar(select(QuestionModelDefault).where(
            QuestionModelDefault.user_id == user_id,
            QuestionModelDefault.model_id == model_id,
        ))
        if default:
            raise ValueError("模型仍是题型默认模型，请先更换默认模型")
        item.enabled = False
        item.archived = True
        await self.db.commit()
        return True

    async def delete_model(self, user_id: UUID, model_id: UUID) -> bool:
        return await self.remove_model(user_id, model_id)

    async def test_model(self, user_id: UUID, model_id: UUID) -> None:
        item = await self.db.scalar(select(UserModel).where(
            UserModel.id == model_id,
            UserModel.user_id == user_id,
            UserModel.archived.is_(False),
        ))
        if not item:
            raise ValueError("模型不存在")
        connection = await self.db.scalar(select(ProviderConnection).where(
            ProviderConnection.id == item.connection_id,
            ProviderConnection.user_id == user_id,
        ))
        if not connection:
            raise ValueError("模型连接不存在")
        await probe_model(
            connection.base_url,
            decrypt_secret(connection.api_key_encrypted),
            item.name,
        )

    async def set_default(
        self, user_id: UUID, mode: str, request: ModelDefaultUpdate,
    ) -> QuestionModelDefault:
        if mode not in MODES:
            raise ValueError("不支持的题型")
        model = await self.db.scalar(select(UserModel).where(
            UserModel.id == request.model_id, UserModel.user_id == user_id,
            UserModel.enabled.is_(True), UserModel.supports_vision.is_(True),
            UserModel.archived.is_(False),
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
