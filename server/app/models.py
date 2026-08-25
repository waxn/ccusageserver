"""SQLAlchemy ORM models.

The schema is deliberately normalized so that "sum across devices" and "sum
across tools" are both cheap aggregate queries. Random secrets (enrollment
tokens, device API keys) are never stored in plaintext — only their SHA-256
digests are persisted.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now(), nullable=False
    )

    devices: Mapped[list["Device"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    enrollment_tokens: Mapped[list["EnrollmentToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class EnrollmentToken(Base):
    """A short-lived, revocable token handed to the install script.

    Exchanged exactly once (when single-use) for a permanent device API key.
    """

    __tablename__ = "enrollment_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="enrollment_tokens")

    def is_active(self, now: datetime | None = None, single_use: bool = True) -> bool:
        now = now or _utcnow()
        if self.revoked_at is not None:
            return False
        if single_use and self.used_at is not None:
            return False
        if self.expires_at is not None:
            # SQLite drops tzinfo on round-trip; treat naive values as UTC.
            expires_at = self.expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at < now:
                return False
        return True


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    hostname: Mapped[str] = mapped_column(String(255), nullable=False)
    # Human-friendly name, seeded from the enrollment token's label and editable
    # from the dashboard. Distinguishes machines that share a hostname.
    label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    os: Mapped[str | None] = mapped_column(String(120), nullable=True)
    enrollment_token_used: Mapped[str | None] = mapped_column(String(64), nullable=True)
    api_key_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="devices")
    usage_reports: Mapped[list["UsageReport"]] = relationship(
        back_populates="device", cascade="all, delete-orphan"
    )
    raw_archives: Mapped[list["RawArchive"]] = relationship(
        back_populates="device", cascade="all, delete-orphan"
    )


class UsageReport(Base):
    """One row per (device, tool, model, day). Upserted idempotently."""

    __tablename__ = "usage_reports"
    __table_args__ = (
        UniqueConstraint(
            "device_id",
            "source_tool",
            "model_name",
            "date",
            name="uq_usage_device_tool_model_date",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Stored as an ISO date string (YYYY-MM-DD) in the report's pinned timezone.
    date: Mapped[str] = mapped_column(String(10), index=True, nullable=False)
    source_tool: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    model_name: Mapped[str] = mapped_column(String(120), nullable=False)

    input_tokens: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    output_tokens: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    cache_creation_tokens: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    cache_read_tokens: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    cost_notional_usd: Mapped[float] = mapped_column(Numeric(14, 6), default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        server_default=func.now(),
        nullable=False,
    )

    device: Mapped["Device"] = relationship(back_populates="usage_reports")


class RawArchive(Base):
    """Metadata pointing at a raw tarball on the archive volume.

    The tarball itself lives on disk (the insurance copy of source data); only
    its metadata is stored in the database.
    """

    __tablename__ = "raw_archives"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), index=True, nullable=False
    )
    source_tool: Mapped[str] = mapped_column(String(40), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now(), nullable=False
    )

    device: Mapped["Device"] = relationship(back_populates="raw_archives")
