"""Unit tests for the ccusage parser."""

from app.ccusage import parse_ccusage_daily


SAMPLE = {
    "daily": [
        {
            "date": "2025-01-01",
            "inputTokens": 100,
            "outputTokens": 50,
            "cacheCreationTokens": 10,
            "cacheReadTokens": 5,
            "totalCost": 1.5,
            "modelsUsed": ["claude-sonnet-4", "claude-opus-4"],
            "modelBreakdowns": [
                {
                    "modelName": "claude-sonnet-4",
                    "inputTokens": 60,
                    "outputTokens": 30,
                    "cacheCreationTokens": 6,
                    "cacheReadTokens": 3,
                    "cost": 0.9,
                },
                {
                    "modelName": "claude-opus-4",
                    "inputTokens": 40,
                    "outputTokens": 20,
                    "cacheCreationTokens": 4,
                    "cacheReadTokens": 2,
                    "cost": 0.6,
                },
            ],
        }
    ],
    "totals": {"inputTokens": 100},
}


def test_parses_per_model_rows():
    rows = parse_ccusage_daily(SAMPLE)
    assert len(rows) == 2
    by_model = {r.model_name: r for r in rows}
    assert by_model["claude-sonnet-4"].input_tokens == 60
    assert by_model["claude-opus-4"].output_tokens == 20
    assert abs(by_model["claude-sonnet-4"].cost_notional_usd - 0.9) < 1e-9
    assert all(r.date == "2025-01-01" for r in rows)


def test_falls_back_to_day_level_when_no_breakdown():
    payload = {
        "daily": [
            {
                "date": "2025-02-02",
                "inputTokens": 10,
                "outputTokens": 5,
                "totalCost": 0.1,
                "modelsUsed": ["claude-sonnet-4"],
            }
        ]
    }
    rows = parse_ccusage_daily(payload)
    assert len(rows) == 1
    assert rows[0].model_name == "claude-sonnet-4"
    assert rows[0].input_tokens == 10


def test_tolerates_snake_case_and_missing_fields():
    payload = {
        "daily": [
            {"date": "2025-03-03", "model_breakdowns": [{"model": "x", "input_tokens": 7}]}
        ]
    }
    rows = parse_ccusage_daily(payload)
    assert rows[0].input_tokens == 7
    assert rows[0].output_tokens == 0


def test_merges_duplicate_model_dates():
    payload = {
        "daily": [
            {
                "date": "2025-04-04",
                "modelBreakdowns": [
                    {"modelName": "x", "inputTokens": 1},
                    {"modelName": "x", "inputTokens": 2},
                ],
            }
        ]
    }
    rows = parse_ccusage_daily(payload)
    assert len(rows) == 1
    assert rows[0].input_tokens == 3


def test_parses_ccusage_20_period_key():
    """ccusage >= 20 renamed the day key from 'date' to 'period'."""
    payload = {
        "daily": [
            {
                "agent": "all",
                "period": "2026-08-14",
                "inputTokens": 1918,
                "outputTokens": 375362,
                "modelBreakdowns": [
                    {"modelName": "claude-sonnet-5", "inputTokens": 1918, "outputTokens": 375362, "cost": 26.3},
                ],
            }
        ]
    }
    rows = parse_ccusage_daily(payload)
    assert len(rows) == 1
    assert rows[0].date == "2026-08-14"
    assert rows[0].model_name == "claude-sonnet-5"
    assert rows[0].input_tokens == 1918


def test_multi_agent_uses_aggregate_row_only():
    """When per-agent rows and an 'all' aggregate coexist, don't double-count."""
    payload = {
        "daily": [
            {"agent": "claude", "period": "2026-08-14", "modelBreakdowns": [{"modelName": "m", "inputTokens": 100}]},
            {"agent": "codex", "period": "2026-08-14", "modelBreakdowns": [{"modelName": "m", "inputTokens": 50}]},
            {"agent": "all", "period": "2026-08-14", "modelBreakdowns": [{"modelName": "m", "inputTokens": 150}]},
        ]
    }
    rows = parse_ccusage_daily(payload)
    assert len(rows) == 1
    assert rows[0].input_tokens == 150  # the aggregate, not 100+50+150


def test_per_agent_only_when_no_aggregate():
    """If there's no 'all' row, sum the per-agent rows."""
    payload = {
        "daily": [
            {"agent": "claude", "period": "2026-08-14", "modelBreakdowns": [{"modelName": "m", "inputTokens": 100}]},
            {"agent": "codex", "period": "2026-08-14", "modelBreakdowns": [{"modelName": "m", "inputTokens": 50}]},
        ]
    }
    rows = parse_ccusage_daily(payload)
    assert len(rows) == 1
    assert rows[0].input_tokens == 150


def test_by_agent_splits_source_tool():
    """ccusage --by-agent nests per-tool rows under 'agents'; split by tool."""
    payload = {
        "daily": [
            {
                "agent": "all",
                "period": "2026-08-13",
                "modelBreakdowns": [{"modelName": "combined", "inputTokens": 999}],
                "agents": [
                    {
                        "agent": "claude",
                        "modelBreakdowns": [
                            {"modelName": "claude-sonnet-5", "inputTokens": 1176, "cost": 8.76}
                        ],
                    },
                    {
                        "agent": "opencode",
                        "modelBreakdowns": [
                            {"modelName": "deepseek", "inputTokens": 196288, "cost": 0.67}
                        ],
                    },
                ],
            }
        ]
    }
    rows = parse_ccusage_daily(payload)
    # Two rows, one per tool — and NOT the aggregate "combined" row.
    assert len(rows) == 2
    tools = {r.source_tool: r for r in rows}
    assert tools["claude"].input_tokens == 1176
    assert tools["opencode"].model_name == "deepseek"
    assert "combined" not in {r.model_name for r in rows}


def test_rejects_non_object():
    import pytest

    with pytest.raises(ValueError):
        parse_ccusage_daily([])  # type: ignore[arg-type]
