"""Usage ingestion (idempotent), raw-archive upload, and summary queries."""

from __future__ import annotations

import hashlib
import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Body,
    Depends,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from sqlalchemy import String, cast, func, select
from sqlalchemy.orm import Session

from ..ccusage import parse_ccusage_daily
from ..config import settings
from ..database import get_db
from ..deps import get_current_device, get_current_user
from ..models import Device, RawArchive, UsageReport, User
from ..schemas import (
    ArchiveResponse,
    ReportIngestResponse,
    SummaryBucket,
    SummaryResponse,
    SummaryTotals,
    TrendPoint,
)

router = APIRouter(prefix="/api/usage", tags=["usage"])

_SAFE_TOOL = re.compile(r"^[a-z0-9_\-]{1,40}$")


# --- Ingestion -------------------------------------------------------------


@router.post("/report", response_model=ReportIngestResponse)
def ingest_report(
    payload: dict = Body(..., description="ccusage `daily --json` output, verbatim"),
    source_tool: str = Query("claude", description="Tool that produced this report"),
    device: Device = Depends(get_current_device),
    db: Session = Depends(get_db),
) -> ReportIngestResponse:
    source_tool = source_tool.lower().strip()
    if not _SAFE_TOOL.match(source_tool):
        raise HTTPException(status_code=422, detail="Invalid source_tool")

    try:
        rows = parse_ccusage_daily(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Unparseable ccusage payload: {exc}") from exc

    inserted = 0
    updated = 0
    for row in rows:
        existing = db.execute(
            select(UsageReport).where(
                UsageReport.device_id == device.id,
                UsageReport.source_tool == source_tool,
                UsageReport.model_name == row.model_name,
                UsageReport.date == row.date,
            )
        ).scalar_one_or_none()

        if existing is None:
            db.add(
                UsageReport(
                    device_id=device.id,
                    source_tool=source_tool,
                    model_name=row.model_name,
                    date=row.date,
                    input_tokens=row.input_tokens,
                    output_tokens=row.output_tokens,
                    cache_creation_tokens=row.cache_creation_tokens,
                    cache_read_tokens=row.cache_read_tokens,
                    cost_notional_usd=row.cost_notional_usd,
                )
            )
            inserted += 1
        else:
            # Idempotent upsert: latest report for a day is authoritative.
            existing.input_tokens = row.input_tokens
            existing.output_tokens = row.output_tokens
            existing.cache_creation_tokens = row.cache_creation_tokens
            existing.cache_read_tokens = row.cache_read_tokens
            existing.cost_notional_usd = row.cost_notional_usd
            existing.updated_at = datetime.now(timezone.utc)
            db.add(existing)
            updated += 1

    db.commit()
    return ReportIngestResponse(inserted=inserted, updated=updated, rows=len(rows))


# --- Raw archive upload ----------------------------------------------------


@router.post("/archive", response_model=ArchiveResponse, status_code=status.HTTP_201_CREATED)
async def upload_archive(
    request: Request,
    file: UploadFile,
    source_tool: str = Query("claude"),
    device: Device = Depends(get_current_device),
    db: Session = Depends(get_db),
) -> ArchiveResponse:
    source_tool = source_tool.lower().strip()
    if not _SAFE_TOOL.match(source_tool):
        raise HTTPException(status_code=422, detail="Invalid source_tool")

    now = datetime.now(timezone.utc)
    # Layout: <archive_dir>/<device_id>/<tool>/<ts>-<uuid>.tar.gz
    dest_dir = os.path.join(settings.archive_dir, str(device.id), source_tool)
    os.makedirs(dest_dir, exist_ok=True)
    fname = f"{now:%Y%m%dT%H%M%SZ}-{uuid.uuid4().hex[:8]}.tar.gz"
    dest_path = os.path.join(dest_dir, fname)

    hasher = hashlib.sha256()
    size = 0
    try:
        with open(dest_path, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > settings.max_archive_bytes:
                    out.close()
                    os.remove(dest_path)
                    raise HTTPException(status_code=413, detail="Archive too large")
                hasher.update(chunk)
                out.write(chunk)
    finally:
        await file.close()

    archive = RawArchive(
        device_id=device.id,
        source_tool=source_tool,
        file_path=dest_path,
        sha256=hasher.hexdigest(),
        size_bytes=size,
        uploaded_at=now,
    )
    db.add(archive)
    db.commit()
    db.refresh(archive)
    return ArchiveResponse(id=archive.id, size_bytes=archive.size_bytes, uploaded_at=archive.uploaded_at)


# --- Summary ---------------------------------------------------------------

_TOTAL_TOKENS = (
    UsageReport.input_tokens
    + UsageReport.output_tokens
    + UsageReport.cache_creation_tokens
    + UsageReport.cache_read_tokens
)


def _base_filters(user_id: int, start: str | None, end: str | None, device_id: int | None, tool: str | None):
    conds = [Device.user_id == user_id]
    if start:
        conds.append(UsageReport.date >= start)
    if end:
        conds.append(UsageReport.date <= end)
    if device_id is not None:
        conds.append(UsageReport.device_id == device_id)
    if tool:
        conds.append(UsageReport.source_tool == tool.lower())
    return conds


def _sum_columns():
    return (
        func.coalesce(func.sum(UsageReport.input_tokens), 0),
        func.coalesce(func.sum(UsageReport.output_tokens), 0),
        func.coalesce(func.sum(UsageReport.cache_creation_tokens), 0),
        func.coalesce(func.sum(UsageReport.cache_read_tokens), 0),
        func.coalesce(func.sum(_TOTAL_TOKENS), 0),
        func.coalesce(func.sum(UsageReport.cost_notional_usd), 0),
    )


@router.get("/summary", response_model=SummaryResponse)
def summary(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    start_date: str | None = Query(None, description="Inclusive YYYY-MM-DD"),
    end_date: str | None = Query(None, description="Inclusive YYYY-MM-DD"),
    device_id: int | None = Query(None),
    source_tool: str | None = Query(None),
) -> SummaryResponse:
    conds = _base_filters(user.id, start_date, end_date, device_id, source_tool)
    cols = _sum_columns()

    # Totals
    totals_row = db.execute(
        select(*cols).join(Device, Device.id == UsageReport.device_id).where(*conds)
    ).one()
    totals = SummaryTotals(
        input_tokens=int(totals_row[0]),
        output_tokens=int(totals_row[1]),
        cache_creation_tokens=int(totals_row[2]),
        cache_read_tokens=int(totals_row[3]),
        total_tokens=int(totals_row[4]),
        cost_notional_usd=float(totals_row[5]),
    )

    # Daily trend
    trend_rows = db.execute(
        select(UsageReport.date, *cols)
        .join(Device, Device.id == UsageReport.device_id)
        .where(*conds)
        .group_by(UsageReport.date)
        .order_by(UsageReport.date.asc())
    ).all()
    trend = [
        TrendPoint(
            date=r[0],
            input_tokens=int(r[1]),
            output_tokens=int(r[2]),
            cache_creation_tokens=int(r[3]),
            cache_read_tokens=int(r[4]),
            total_tokens=int(r[5]),
            cost_notional_usd=float(r[6]),
        )
        for r in trend_rows
    ]

    by_model = _grouped(db, conds, cols, UsageReport.model_name)
    by_device = _grouped(db, conds, cols, cast(Device.hostname, String))
    by_source_tool = _grouped(db, conds, cols, UsageReport.source_tool)

    return SummaryResponse(
        start_date=start_date,
        end_date=end_date,
        totals=totals,
        trend=trend,
        by_model=by_model,
        by_device=by_device,
        by_source_tool=by_source_tool,
    )


def _grouped(db: Session, conds, cols, key_column) -> list[SummaryBucket]:
    rows = db.execute(
        select(key_column.label("key"), *cols)
        .join(Device, Device.id == UsageReport.device_id)
        .where(*conds)
        .group_by(key_column)
        .order_by(func.sum(_TOTAL_TOKENS).desc())
    ).all()
    return [
        SummaryBucket(
            key=str(r[0]),
            input_tokens=int(r[1]),
            output_tokens=int(r[2]),
            cache_creation_tokens=int(r[3]),
            cache_read_tokens=int(r[4]),
            total_tokens=int(r[5]),
            cost_notional_usd=float(r[6]),
        )
        for r in rows
    ]
