"""Raw data export (audit log) for the current authenticated user only.

This endpoint returns ALL usage data ever recorded by this user across all devices,
plus account metadata, encryption params, and archive metadata. Nothing is sent to
the browser except what's needed to decrypt/inspect locally on that device. Other
users' data never leaves their device path in any query or join.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_account
from ..models import Device, EncryptedUsage, RawArchive, UsageReport, User
from ..schemas import CryptoParamsResponse

router = APIRouter(prefix="/api/export", tags=["export"])


@router.get("/data")
def export_all_data(
    account: User = Depends(get_account),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return the complete raw data for this user only.

    This is designed for local inspection (e.g., "raw data viewer" in a browser).
    The response contains:
      - Account metadata (email, created_at)
      - Crypto params (KDF salt/iterations + verifier CT/nonce — needed for decryption)
      - Devices: hostname, label, OS, enrollment info, api_key_hash, last_seen_at, created_at
      - Usage reports: device_id, date, source_tool, model_name, all token counts, cost, timestamps
      - Encrypted blobs: nonce, ciphertext (base64), updated_at — per-device
      - Raw archives: tool, file_path, sha256, size_bytes, uploaded_at

    IMPORTANT SECURITY: This endpoint is protected by JWT. The query filters on
    `Device.user_id == account.id`. Other users' data cannot be returned because
    their devices never appear in the JOIN for this user's ID. If a device was
    deleted or revoked, it won't show up unless there are orphaned UsageReport
    rows (which shouldn't happen due to foreign key cascades).

    DO NOT include plaintext passwords, enrollment token secrets, or api_keys here.
    """

    # --- Account metadata ----------------------------------------------------
    account_data = {
        "email": account.email,
        "created_at": account.created_at.isoformat(),
        # Encryption params needed to decrypt blobs locally. These are deliberately
        # non-secret: any client that knows the user's password can derive the same key.
        "crypto_configured": bool(account.crypto_salt),
    }

    if account.crypto_salt is not None:
        account_data["crypto_salt"] = account.crypto_salt
        account_data["crypto_iterations"] = account.crypto_iterations
        account_data["crypto_verifier_nonce"] = account.crypto_verifier_nonce
        account_data["crypto_verifier_ct"] = account.crypto_verifier_ct

    # --- Devices -------------------------------------------------------------
    devices_query = (
        select(Device)
        .join(Device.usage_reports, isouter=True)  # include devices with no reports
        .where(Device.user_id == account.id)
        .order_by(Device.created_at.desc())
    )
    devices_rows = db.execute(devices_query).all()

    devices: list[dict[str, Any]] = []
    for d in devices_rows:
        device_info: dict[str, Any] = {
            "id": d.id,
            "hostname": d.hostname,
            "label": d.label,
            "display_name": (d.label or d.hostname),
            "os": d.os,
            "last_seen_at": d.last_seen_at.isoformat() if d.last_seen_at else None,
            "revoked_at": d.revoked_at.isoformat() if d.revoked_at else None,
            "created_at": d.created_at.isoformat(),
        }

        # Enrollment info (optional)
        if d.enrollment_token_used:
            device_info["enrollment_token_used"] = d.enrollment_token_used

        devices.append(device_info)

    # --- Usage reports -------------------------------------------------------
    # One row per day/tool/model/device. Everything is user-scoped.
    usage_query = (
        select(
            UsageReport.device_id,
            UsageReport.date,
            UsageReport.source_tool,
            UsageReport.model_name,
            UsageReport.input_tokens,
            UsageReport.output_tokens,
            UsageReport.cache_creation_tokens,
            UsageReport.cache_read_tokens,
            UsageReport.cost_notional_usd,
            UsageReport.created_at,
            UsageReport.updated_at,
        )
        .join(Device, Device.id == UsageReport.device_id)
        .where(Device.user_id == account.id)
        .order_by(UsageReport.date.desc(), UsageReport.source_tool, UsageReport.model_name)
    )

    usage_rows = db.execute(usage_query).all()
    usage: list[dict[str, Any]] = []
    for r in usage_rows:
        usage.append({
            "device_id": r.device_id,
            "date": r.date,
            "source_tool": r.source_tool,
            "model_name": r.model_name,
            "input_tokens": int(r.input_tokens) if r.input_tokens else 0,
            "output_tokens": int(r.output_tokens) if r.output_tokens else 0,
            "cache_creation_tokens": int(r.cache_creation_tokens) if r.cache_creation_tokens else 0,
            "cache_read_tokens": int(r.cache_read_tokens) if r.cache_read_tokens else 0,
            "cost_notional_usd": float(r.cost_notional_usd) if r.cost_notional_usd else 0.0,
            "created_at": r.created_at.isoformat(),
            "updated_at": r.updated_at.isoformat(),
        })

    # --- Encrypted blobs ------------------------------------------------------
    # One latest blob per device (zero-knowledge: server can't read it).
    blobs_query = (
        select(EncryptedUsage.device_id, EncryptedUsage.nonce, EncryptedUsage.ciphertext, EncryptedUsage.updated_at)
        .join(Device, Device.id == EncryptedUsage.device_id)
        .where(Device.user_id == account.id)
        .order_by(EncryptedUsage.device_id)
    )

    blobs_rows = db.execute(blobs_query).all()
    encrypted_blobs: list[dict[str, Any]] = []
    for b in blobs_rows:
        encrypted_blobs.append({
            "device_id": int(b.device_id),
            "nonce": b.nonce,
            "ciphertext": b.ciphertext,
            "updated_at": b.updated_at.isoformat(),
        })

    # --- Raw archives ---------------------------------------------------------
    archives_query = (
        select(RawArchive)
        .join(Device, Device.id == RawArchive.device_id)
        .where(Device.user_id == account.id)
        .order_by(RawArchive.uploaded_at.desc())
    )

    archives_rows = db.execute(archives_query).all()
    raw_archives: list[dict[str, Any]] = []
    for a in archives_rows:
        raw_archives.append({
            "id": a.id,
            "device_id": int(a.device_id),
            "source_tool": a.source_tool,
            "file_path": a.file_path,
            "sha256": a.sha256,
            "size_bytes": int(a.size_bytes) if a.size_bytes else 0,
            "uploaded_at": a.uploaded_at.isoformat(),
        })

    # --- Assemble the export --------------------------------------------------
    return {
        "metadata": {
            "account": account_data,
            "exported_at": datetime.now(timezone.utc).isoformat(),
        },
        "devices": devices,
        "usage_reports": usage,
        "encrypted_blobs": encrypted_blobs,
        "raw_archives": raw_archives,
    }
