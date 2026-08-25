"""Application configuration, loaded from environment variables."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="LEDGER_", env_file=".env", extra="ignore")

    # Core secrets / storage
    secret_key: str = "CHANGE_ME_INSECURE_DEFAULT_DO_NOT_USE_IN_PROD"
    database_url: str = "sqlite:////data/ledger.db"
    archive_dir: str = "/data/archives"

    # JWT / session
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # Enrollment tokens
    enrollment_token_expire_hours: int = 24 * 7  # 7 days
    enrollment_token_single_use: bool = True

    # Device health: how many hours without a check-in before a device is "stale"
    device_stale_after_hours: int = 24

    # Upload limits
    max_archive_bytes: int = 512 * 1024 * 1024  # 512 MiB

    # Pinned ccusage version the install script/agent should use. Surfaced to the
    # install endpoint so every enrolled machine reports comparably.
    ccusage_version: str = "17.1.3"

    # Public base URL of this server (used to render the install one-liner). If
    # empty, the dashboard falls back to the browser's current origin.
    public_base_url: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
