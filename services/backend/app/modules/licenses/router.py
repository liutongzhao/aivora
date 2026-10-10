from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database import get_db_session
from app.modules.identity.dependencies import get_current_user
from app.modules.identity.models import User
from app.modules.licenses.service import LicenseCodeService, LicenseError

router = APIRouter(prefix="/api", tags=["licenses"])


class RedeemRequest(BaseModel):
    code: str = Field(min_length=10, max_length=64)


@router.get("/account/entitlements")
async def account_entitlements(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    entitlement = await LicenseCodeService().latest(db, user.id)
    now = datetime.now(timezone.utc)
    active = bool(entitlement and entitlement.status == "active" and entitlement.starts_at <= now < entitlement.expires_at)
    return {
        "active": active,
        "status": entitlement.status if entitlement else None,
        "startsAt": entitlement.starts_at if entitlement else None,
        "expiresAt": entitlement.expires_at if entitlement else None,
    }


@router.post("/licenses/redeem")
async def redeem_license(
    request: RedeemRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    try:
        entitlement = await LicenseCodeService().redeem(db, user.id, request.code)
        return {
            "success": True,
            "startsAt": entitlement.starts_at,
            "expiresAt": entitlement.expires_at,
        }
    except LicenseError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail={"code": error.code, "message": error.message},
        )
