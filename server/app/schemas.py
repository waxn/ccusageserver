"""Pydantic request/response schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# --- Auth ------------------------------------------------------------------


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    created_at: datetime


# --- Enrollment ------------------------------------------------------------


class EnrollmentCreateRequest(BaseModel):
    label: str | None = Field(default=None, max_length=120)


class EnrollmentTokenResponse(BaseModel):
    """Returned once, at creation — the plaintext token is not recoverable."""

    id: int
    token: str
    label: str | None
    expires_at: datetime | None
    install_command: str


class EnrollmentTokenInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str | None
    created_at: datetime
    expires_at: datetime | None
    used_at: datetime | None
    revoked_at: datetime | None


# --- Device enrollment & health -------------------------------------------


class DeviceEnrollRequest(BaseModel):
    enrollment_token: str
    hostname: str = Field(min_length=1, max_length=255)
    os: str | None = Field(default=None, max_length=120)


class DeviceEnrollResponse(BaseModel):
    device_id: int
    api_key: str
    ccusage_version: str


class DeviceInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    hostname: str
    label: str | None = None
    display_name: str = ""
    os: str | None
    last_seen_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime
    stale: bool = False


class DeviceRenameRequest(BaseModel):
    label: str | None = Field(default=None, max_length=120)


# --- Usage summary ---------------------------------------------------------


class SummaryTotals(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_tokens: int = 0
    cache_read_tokens: int = 0
    total_tokens: int = 0
    cost_notional_usd: float = 0.0


class SummaryBucket(SummaryTotals):
    key: str


class TrendPoint(BaseModel):
    date: str
    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_tokens: int = 0
    cache_read_tokens: int = 0
    total_tokens: int = 0
    cost_notional_usd: float = 0.0


class SummaryResponse(BaseModel):
    start_date: str | None
    end_date: str | None
    totals: SummaryTotals
    trend: list[TrendPoint]
    by_model: list[SummaryBucket]
    by_device: list[SummaryBucket]
    by_source_tool: list[SummaryBucket]


class ReportIngestResponse(BaseModel):
    inserted: int
    updated: int
    rows: int


class ArchiveResponse(BaseModel):
    id: int
    size_bytes: int
    uploaded_at: datetime


# --- End-to-end encryption -------------------------------------------------


class CryptoSetupRequest(BaseModel):
    salt: str = Field(min_length=8, max_length=64)  # base64
    iterations: int = Field(ge=100_000, le=2_000_000)
    verifier_nonce: str = Field(min_length=8, max_length=64)
    verifier_ct: str = Field(min_length=8, max_length=255)


class CryptoParamsResponse(BaseModel):
    configured: bool
    salt: str | None = None
    iterations: int | None = None
    verifier_nonce: str | None = None
    verifier_ct: str | None = None


class EncryptedBlobUpload(BaseModel):
    nonce: str = Field(min_length=8, max_length=64)
    ciphertext: str = Field(min_length=1)


class EncryptedBlob(BaseModel):
    device_id: int
    nonce: str
    ciphertext: str
    updated_at: datetime
