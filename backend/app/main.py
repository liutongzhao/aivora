from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.modules.identity.router import router as identity_router
from app.modules.identity.router import session_router as identity_session_router
from app.modules.models.router import router as models_router
from app.modules.settings.router import router as settings_router


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(identity_router)
    application.include_router(identity_session_router)
    application.include_router(settings_router)
    application.include_router(models_router)

    @application.get("/health", tags=["system"])
    async def health() -> dict[str, str]:
        return {"status": "ok", "service": "aivora-api"}

    return application


app = create_app()
