"""Password hashing, random-secret hashing, and JWT helpers.

Nothing homegrown: passwords use argon2 (argon2-cffi), high-entropy random
secrets (enrollment tokens + device API keys) are stored as SHA-256 digests,
and sessions use standard HS256 JWTs (PyJWT).
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from .config import settings

_ph = PasswordHasher()


# --- Passwords -------------------------------------------------------------


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError, ValueError):
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _ph.check_needs_rehash(password_hash)
    except (InvalidHashError, ValueError):
        return False


# --- Random secrets (enrollment tokens, device API keys) -------------------


def generate_secret(nbytes: int = 32) -> str:
    """Return a URL-safe high-entropy secret to hand to a client."""
    return secrets.token_urlsafe(nbytes)


def hash_secret(secret: str) -> str:
    """SHA-256 digest for storage/lookup of a high-entropy random secret."""
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def secrets_match(secret: str, stored_hash: str) -> bool:
    return secrets.compare_digest(hash_secret(secret), stored_hash)


# --- JWT session tokens ----------------------------------------------------


def create_access_token(subject: str | int, expires_minutes: int | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes or settings.access_token_expire_minutes
    )
    payload = {"sub": str(subject), "exp": expire, "iat": datetime.now(timezone.utc)}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    """Decode/verify a JWT. Raises jwt.PyJWTError on failure."""
    return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
