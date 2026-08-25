"""Enrollment-token lifecycle (create / list / revoke)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import EnrollmentToken, User
from ..schemas import (
    EnrollmentCreateRequest,
    EnrollmentTokenInfo,
    EnrollmentTokenResponse,
)
from ..security import generate_secret, hash_secret

router = APIRouter(prefix="/api/enrollment", tags=["enrollment"])


def _base_url(request: Request) -> str:
    if settings.public_base_url:
        return settings.public_base_url.rstrip("/")
    return str(request.base_url).rstrip("/")


@router.post("/create", response_model=EnrollmentTokenResponse, status_code=status.HTTP_201_CREATED)
def create_enrollment_token(
    payload: EnrollmentCreateRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EnrollmentTokenResponse:
    secret = generate_secret()
    expires_at = None
    if settings.enrollment_token_expire_hours > 0:
        expires_at = datetime.now(timezone.utc) + timedelta(
            hours=settings.enrollment_token_expire_hours
        )

    token = EnrollmentToken(
        user_id=user.id,
        token_hash=hash_secret(secret),
        label=payload.label,
        expires_at=expires_at,
    )
    db.add(token)
    db.commit()
    db.refresh(token)

    base = _base_url(request)
    install_command = f"curl -fsSL {base}/install.sh | sh -s -- {secret}"
    return EnrollmentTokenResponse(
        id=token.id,
        token=secret,
        label=token.label,
        expires_at=token.expires_at,
        install_command=install_command,
    )


@router.get("", response_model=list[EnrollmentTokenInfo])
def list_enrollment_tokens(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[EnrollmentToken]:
    rows = db.execute(
        select(EnrollmentToken)
        .where(EnrollmentToken.user_id == user.id)
        .order_by(EnrollmentToken.created_at.desc())
    ).scalars()
    return list(rows)


@router.post("/{token_id}/revoke", response_model=EnrollmentTokenInfo)
def revoke_enrollment_token(
    token_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EnrollmentToken:
    token = db.get(EnrollmentToken, token_id)
    if token is None or token.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
    if token.revoked_at is None:
        token.revoked_at = datetime.now(timezone.utc)
        db.add(token)
        db.commit()
        db.refresh(token)
    return token


@router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_enrollment_token(
    token_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Remove an enrollment token from the list. Devices already enrolled with
    it keep working — their API key is independent of the token."""
    token = db.get(EnrollmentToken, token_id)
    if token is None or token.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
    db.delete(token)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
