from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.settings.models import UserConfig
from app.modules.settings.schemas import UserConfigUpdate

DEFAULT_CONFIG = {
    "aiModel": "gpt-6-sol",
    "programmingModel": "gpt-6-sol",
    "multipleChoiceModel": "gpt-6-sol",
    "universalModel": "gpt-6-sol",
    "language": "python",
    "theme": "system",
    "selectedProvider": "openai-compatible",
    "shortcuts": {},
    "display": {},
    "processing": {},
}


class SettingsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_config(self, user_id: UUID) -> dict:
        result = await self.db.execute(select(UserConfig).where(UserConfig.user_id == user_id))
        config = result.scalar_one_or_none()
        if not config:
            return DEFAULT_CONFIG.copy()
        return {
            "aiModel": config.ai_model,
            "programmingModel": config.programming_model,
            "multipleChoiceModel": config.multiple_choice_model,
            "universalModel": config.universal_model,
            "language": config.language,
            "theme": config.theme,
            "selectedProvider": config.selected_provider,
            "shortcuts": config.shortcuts or {},
            "display": config.display or {},
            "processing": config.processing or {},
        }

    async def update_config(self, user_id: UUID, request: UserConfigUpdate) -> dict:
        values = request.model_dump(exclude_none=True)
        result = await self.db.execute(select(UserConfig).where(UserConfig.user_id == user_id))
        config = result.scalar_one_or_none()
        if not config:
            defaults = DEFAULT_CONFIG.copy()
            defaults.update(values)
            config = UserConfig(
                user_id=user_id,
                ai_model=defaults["aiModel"],
                programming_model=defaults["programmingModel"],
                multiple_choice_model=defaults["multipleChoiceModel"],
                universal_model=defaults["universalModel"],
                language=defaults["language"],
                theme=defaults["theme"],
                selected_provider=defaults["selectedProvider"],
                shortcuts=defaults["shortcuts"],
                display=defaults["display"],
                processing=defaults["processing"],
            )
            self.db.add(config)
        else:
            fields = {
                "aiModel": "ai_model",
                "programmingModel": "programming_model",
                "multipleChoiceModel": "multiple_choice_model",
                "universalModel": "universal_model",
                "language": "language",
                "theme": "theme",
                "selectedProvider": "selected_provider",
                "shortcuts": "shortcuts",
                "display": "display",
                "processing": "processing",
            }
            for key, value in values.items():
                setattr(config, fields[key], value)
        await self.db.commit()
        return await self.get_config(user_id)

