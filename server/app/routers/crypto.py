"""End-to-end encryption parameters.

The server stores only the KDF salt and a verifier (neither secret). The
encryption password and derived key never reach the server, so it cannot
decrypt usage blobs. Clients (browser + agent) fetch these params to derive the
same key from the user's password.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_account, get_current_user
from ..models import User
from ..schemas import CryptoParamsResponse, CryptoSetupRequest

router = APIRouter(prefix="/api/crypto", tags=["crypto"])


@router.get("/params", response_model=CryptoParamsResponse)
def get_params(account: User = Depends(get_account)) -> CryptoParamsResponse:
    """Readable by the browser (JWT) or an agent (device key)."""
    if not account.crypto_salt:
        return CryptoParamsResponse(configured=False)
    return CryptoParamsResponse(
        configured=True,
        salt=account.crypto_salt,
        iterations=account.crypto_iterations,
        verifier_nonce=account.crypto_verifier_nonce,
        verifier_ct=account.crypto_verifier_ct,
    )


@router.post("/setup", response_model=CryptoParamsResponse, status_code=status.HTTP_201_CREATED)
def setup(
    payload: CryptoSetupRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CryptoParamsResponse:
    """Set the encryption parameters once. Immutable afterwards, because
    existing blobs are encrypted under the derived key."""
    if user.crypto_salt:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Encryption is already configured for this account.",
        )
    user.crypto_salt = payload.salt
    user.crypto_iterations = payload.iterations
    user.crypto_verifier_nonce = payload.verifier_nonce
    user.crypto_verifier_ct = payload.verifier_ct
    db.add(user)
    db.commit()
    db.refresh(user)
    return CryptoParamsResponse(
        configured=True,
        salt=user.crypto_salt,
        iterations=user.crypto_iterations,
        verifier_nonce=user.crypto_verifier_nonce,
        verifier_ct=user.crypto_verifier_ct,
    )
