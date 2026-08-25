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


def test_rejects_non_object():
    import pytest

    with pytest.raises(ValueError):
        parse_ccusage_daily([])  # type: ignore[arg-type]
