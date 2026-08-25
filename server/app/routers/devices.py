"""Device enrollment, listing, renaming, revocation, and deletion."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
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
    DeviceRenameRequest,
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


def _to_info(device: Device, now: datetime | None = None) -> DeviceInfo:
    now = now or datetime.now(timezone.utc)
    info = DeviceInfo.model_validate(device)
    info.display_name = (device.label or "").strip() or device.hostname
    info.stale = _is_stale(device, now)
    return info


def _get_owned_device(device_id: int, user: User, db: Session) -> Device:
    device = db.get(Device, device_id)
    if device is None or device.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    return device


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
        # Seed the display name from the token's label so a machine can be named
        # at enrollment time (important when hostnames collide).
        label=(token.label or "").strip() or None,
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
    return [_to_info(d, now) for d in rows]


@router.patch("/{device_id}", response_model=DeviceInfo)
def rename_device(
    device_id: int,
    payload: DeviceRenameRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DeviceInfo:
    device = _get_owned_device(device_id, user, db)
    device.label = (payload.label or "").strip() or None
    db.add(device)
    db.commit()
    db.refresh(device)
    return _to_info(device)


@router.post("/{device_id}/revoke", response_model=DeviceInfo)
def revoke_device(
    device_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DeviceInfo:
    device = _get_owned_device(device_id, user, db)
    if device.revoked_at is None:
        device.revoked_at = datetime.now(timezone.utc)
        db.add(device)
        db.commit()
        db.refresh(device)
    return _to_info(device)


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(
    device_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Permanently delete a device and its usage rows + archive metadata.

    This cascades (see the ORM relationships), so it removes that device's
    historical usage from the dashboard. Intended for pruning dead/duplicate
    enrollments.
    """
    device = _get_owned_device(device_id, user, db)
    db.delete(device)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
