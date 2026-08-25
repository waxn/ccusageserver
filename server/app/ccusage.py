"""Parsing for ccusage's ``daily --json`` output.

The agent stays a thin wrapper: it runs ccusage and posts the JSON verbatim.
This module normalizes that JSON into flat per-(model, date) rows matching the
``usage_reports`` unique constraint. It is intentionally tolerant of missing
fields and of minor key-name drift across ccusage versions.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class UsageRow:
    date: str
    model_name: str
    input_tokens: int
    output_tokens: int
    cache_creation_tokens: int
    cache_read_tokens: int
    cost_notional_usd: float


def _to_int(value) -> int:
    try:
        if value is None:
            return 0
        return int(value)
    except (TypeError, ValueError):
        return 0


def _to_float(value) -> float:
    try:
        if value is None:
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _first(d: dict, *keys, default=None):
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return default


def _row_from_breakdown(date: str, model: str, b: dict) -> UsageRow:
    return UsageRow(
        date=date,
        model_name=model,
        input_tokens=_to_int(_first(b, "inputTokens", "input_tokens")),
        output_tokens=_to_int(_first(b, "outputTokens", "output_tokens")),
        cache_creation_tokens=_to_int(
            _first(b, "cacheCreationTokens", "cache_creation_tokens", "cacheCreationInputTokens")
        ),
        cache_read_tokens=_to_int(
            _first(b, "cacheReadTokens", "cache_read_tokens", "cacheReadInputTokens")
        ),
        cost_notional_usd=_to_float(_first(b, "cost", "totalCost", "costUSD", default=0.0)),
    )


def parse_ccusage_daily(payload: dict) -> list[UsageRow]:
    """Flatten ccusage ``daily --json`` output into per-model, per-date rows.

    Expected shape::

        {
          "daily": [
            {
              "date": "2025-01-01",
              "inputTokens": ..., "outputTokens": ...,
              "cacheCreationTokens": ..., "cacheReadTokens": ...,
              "totalCost": ...,
              "modelsUsed": ["claude-...", ...],
              "modelBreakdowns": [
                {"modelName": "claude-...", "inputTokens": ..., ...}
              ]
            }
          ],
          "totals": { ... }
        }

    Rows are keyed by (date, model). When a day has no per-model breakdown we
    fall back to a single synthetic row so no usage is silently dropped.
    """
    if not isinstance(payload, dict):
        raise ValueError("ccusage payload must be a JSON object")

    daily = payload.get("daily")
    if daily is None:
        # Some ccusage subcommands wrap data differently; be forgiving.
        daily = payload.get("data") or []
    if not isinstance(daily, list):
        raise ValueError("ccusage payload 'daily' must be a list")

    entries = [e for e in daily if isinstance(e, dict)]

    # ccusage >= 20 emits a multi-agent breakdown: potentially one row per
    # (day, agent) plus an aggregate row tagged agent == "all". When aggregate
    # rows are present, use only those so we don't double-count; otherwise use
    # every row. Older ccusage (< 20) has no "agent" field, so this is a no-op.
    def _agent(e: dict) -> str:
        return str(e.get("agent", "")).strip().lower()

    has_aggregate = any(_agent(e) in ("all", "combined", "total") for e in entries)

    # Accumulate, summing duplicate (date, model) pairs defensively.
    acc: dict[tuple[str, str], UsageRow] = {}

    for entry in entries:
        if has_aggregate and _agent(entry) not in ("all", "combined", "total"):
            continue
        # ccusage <20 uses "date"; ccusage >=20 renamed it to "period".
        date = _first(entry, "date", "day", "period")
        if not date:
            continue
        date = str(date)[:10]

        breakdowns = _first(entry, "modelBreakdowns", "model_breakdowns", default=None)
        if isinstance(breakdowns, list) and breakdowns:
            for b in breakdowns:
                if not isinstance(b, dict):
                    continue
                model = str(_first(b, "modelName", "model", "model_name", default="unknown"))
                row = _row_from_breakdown(date, model, b)
                _merge(acc, row)
        else:
            # No per-model breakdown: emit a single day-level row.
            models = _first(entry, "modelsUsed", "models_used", default=None)
            model = "unknown"
            if isinstance(models, list) and len(models) == 1:
                model = str(models[0])
            elif isinstance(models, list) and models:
                model = "mixed"
            row = _row_from_breakdown(date, model, entry)
            _merge(acc, row)

    return list(acc.values())


def _merge(acc: dict[tuple[str, str], UsageRow], row: UsageRow) -> None:
    key = (row.date, row.model_name)
    existing = acc.get(key)
    if existing is None:
        acc[key] = row
        return
    existing.input_tokens += row.input_tokens
    existing.output_tokens += row.output_tokens
    existing.cache_creation_tokens += row.cache_creation_tokens
    existing.cache_read_tokens += row.cache_read_tokens
    existing.cost_notional_usd += row.cost_notional_usd
