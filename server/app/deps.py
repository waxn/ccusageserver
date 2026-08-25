"""Shared FastAPI dependencies for authenticating users and devices."""

from __future__ import annotations

from datetime import datetime, timezone

import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import Device, User
from .security import decode_access_token, hash_secret

_bearer = HTTPBearer(auto_error=True, description="JWT session token")

_credentials_error = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        payload = decode_access_token(token)
    except jwt.PyJWTError as exc:  # noqa: BLE001 - normalize to 401
        raise _credentials_error from exc

    sub = payload.get("sub")
    if sub is None:
        raise _credentials_error
    try:
        user_id = int(sub)
    except (TypeError, ValueError) as exc:
        raise _credentials_error from exc

    user = db.get(User, user_id)
    if user is None:
        raise _credentials_error
    return user


def get_current_device(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> Device:
    """Authenticate an agent via its device API key.

    Accepts either ``Authorization: Bearer <api_key>`` or ``X-API-Key``.
    """
    api_key = x_api_key
    if api_key is None and authorization:
        scheme, _, value = authorization.partition(" ")
        if scheme.lower() == "bearer" and value:
            api_key = value

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing device API key",
            headers={"WWW-Authenticate": "Bearer"},
        )

    key_hash = hash_secret(api_key)
    device = db.execute(
        select(Device).where(Device.api_key_hash == key_hash)
    ).scalar_one_or_none()
    if device is None or device.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked device API key"
        )

    device.last_seen_at = datetime.now(timezone.utc)
    db.add(device)
    db.commit()
    return device


def get_account(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> User:
    """Resolve the owning user from EITHER a dashboard JWT or a device API key.

    Used by endpoints both the browser and the agent need (e.g. crypto params).
    """
    bearer: str | None = None
    if authorization:
        scheme, _, value = authorization.partition(" ")
        if scheme.lower() == "bearer" and value:
            bearer = value

    # Try JWT first.
    if bearer:
        try:
            payload = decode_access_token(bearer)
            user = db.get(User, int(payload.get("sub")))
            if user is not None:
                return user
        except (jwt.PyJWTError, TypeError, ValueError):
            pass

    # Fall back to a device API key.
    api_key = x_api_key or bearer
    if api_key:
        device = db.execute(
            select(Device).where(Device.api_key_hash == hash_secret(api_key))
        ).scalar_one_or_none()
        if device is not None and device.revoked_at is None:
            return device.user

    raise _credentials_error
