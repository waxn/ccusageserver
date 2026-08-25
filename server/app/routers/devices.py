"""Device enrollment, listing, and revocation."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import Device, EnrollmentToken, User
from ..schemas import (
    DeviceEnrollRequest,
    DeviceEnrollResponse,
    DeviceInfo,
)
from ..security import generate_secret, hash_secret

router = APIRouter(prefix="/api/devices", tags=["devices"])


def _is_stale(device: Device, now: datetime) -> bool:
    if device.last_seen_at is None:
        return True
    last_seen = device.last_seen_at
    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)
    return (now - last_seen) > timedelta(hours=settings.device_stale_after_hours)


@router.post("/enroll", response_model=DeviceEnrollResponse, status_code=status.HTTP_201_CREATED)
def enroll_device(payload: DeviceEnrollRequest, db: Session = Depends(get_db)) -> DeviceEnrollResponse:
    """Public but token-gated: exchange an enrollment token for a device API key."""
    now = datetime.now(timezone.utc)
    token_hash = hash_secret(payload.enrollment_token)
    token = db.execute(
        select(EnrollmentToken).where(EnrollmentToken.token_hash == token_hash)
    ).scalar_one_or_none()

    if token is None or not token.is_active(now, single_use=settings.enrollment_token_single_use):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid, expired, or already-used enrollment token",
        )

    api_key = generate_secret()
    device = Device(
        user_id=token.user_id,
        hostname=payload.hostname,
        os=payload.os,
        enrollment_token_used=token_hash,
        api_key_hash=hash_secret(api_key),
        last_seen_at=now,
    )
    db.add(device)

    if settings.enrollment_token_single_use:
        token.used_at = now
        db.add(token)

    db.commit()
    db.refresh(device)

    return DeviceEnrollResponse(
        device_id=device.id,
        api_key=api_key,
        ccusage_version=settings.ccusage_version,
    )


@router.get("", response_model=list[DeviceInfo])
def list_devices(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[DeviceInfo]:
    now = datetime.now(timezone.utc)
    rows = db.execute(
        select(Device).where(Device.user_id == user.id).order_by(Device.created_at.asc())
    ).scalars()
    result: list[DeviceInfo] = []
    for d in rows:
        info = DeviceInfo.model_validate(d)
        info.stale = _is_stale(d, now)
        result.append(info)
    return result


@router.post("/{device_id}/revoke", response_model=DeviceInfo)
def revoke_device(
    device_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DeviceInfo:
    device = db.get(Device, device_id)
    if device is None or device.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    if device.revoked_at is None:
        device.revoked_at = datetime.now(timezone.utc)
        db.add(device)
        db.commit()
        db.refresh(device)
    info = DeviceInfo.model_validate(device)
    info.stale = _is_stale(device, datetime.now(timezone.utc))
    return info
