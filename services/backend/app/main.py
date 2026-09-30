import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.modules.identity.router import router as identity_router
from app.modules.identity.router import session_router as identity_session_router
from app.modules.models.router import router as models_router
from app.modules.settings.router import router as settings_router
from app.modules.files.router import router as files_router
from app.modules.tasks.router import router as tasks_router
from app.modules.admin.router import router as admin_router
from app.modules.devices.router import router as devices_router
from app.modules.byok.router import router as byok_router
from app.infrastructure.health import router as health_router
from app.infrastructure.bootstrap import bootstrap_initial_admin
from app.infrastructure.socketio import sio, retire_stale_sessions


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
    application.include_router(files_router)
    application.include_router(tasks_router)
    application.include_router(admin_router)
    application.include_router(devices_router)
    application.include_router(byok_router)
    application.include_router(health_router)

    @application.on_event("startup")
    async def bootstrap() -> None:
        await bootstrap_initial_admin()
        await retire_stale_sessions()

    @application.get("/health", tags=["system"])
    async def health() -> dict[str, str]:
        return {"status": "ok", "service": "aivora-api"}

    return application


app = socketio.ASGIApp(sio, create_app(), socketio_path="socket.io")
