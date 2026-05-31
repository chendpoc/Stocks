from __future__ import annotations

from unittest.mock import patch

from app.intel.ingestion.alpha_vantage_data import (
    fetch_daily_bars,
    fetch_minute_bars,
    resolve_api_key,
)


def test_resolve_api_key_from_env(monkeypatch) -> None:
    monkeypatch.setenv("ALPHAVANTAGE_API_KEY", "test-key")
    assert resolve_api_key() == "test-key"


def test_fetch_daily_bars_parses_series() -> None:
    payload = {
        "Time Series (Daily)": {
            "2026-05-22": {
                "1. open": "100.0",
                "2. high": "105.0",
                "3. low": "99.0",
                "4. close": "104.0",
                "5. volume": "1000",
            }
        }
    }

    with patch(
        "app.intel.ingestion.alpha_vantage_data._request",
        return_value=payload,
    ):
        bars = fetch_daily_bars("TSLA", settings=_settings_with_key())

    assert len(bars) == 1
    assert bars[0].symbol == "TSLA"
    assert bars[0].timeframe == "1d"
    assert bars[0].close == 104.0
    assert bars[0].source == "alpha_vantage"


def test_fetch_minute_bars_parses_intraday() -> None:
    payload = {
        "Meta Data": {"4. Interval": "5min"},
        "Time Series (5min)": {
            "2026-05-22 15:30:00": {
                "1. open": "200.0",
                "2. high": "201.0",
                "3. low": "199.0",
                "4. close": "200.5",
                "5. volume": "500",
            }
        },
    }

    with patch(
        "app.intel.ingestion.alpha_vantage_data._request",
        return_value=payload,
    ):
        bars = fetch_minute_bars("TSLA", settings=_settings_with_key())

    assert len(bars) == 1
    assert bars[0].timeframe == "5m"
    assert bars[0].ts == "2026-05-22T15:30:00"


def _settings_with_key():
    from app.core.config import Settings
    from pathlib import Path

    return Settings(repo_root=Path(__file__).resolve().parents[4], alpha_vantage_api_key="k")
