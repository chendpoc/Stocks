from app.intel.ingestion.market_data import CHART_SPECS, fetch_chart_bars


def test_chart_specs_cover_dashboard_intervals() -> None:
    for key in ("1m", "2m", "5m", "30m", "1h", "2h", "4h", "30d"):
        assert key in CHART_SPECS


def test_fetch_chart_bars_30d_from_db_or_live(monkeypatch) -> None:
    class _Engine:
        def connect(self):
            raise AssertionError("DB should not be required when yfinance returns data")

    monkeypatch.setattr(
        "app.intel.ingestion.market_data.get_intel_engine",
        lambda _settings: _Engine(),
    )
    monkeypatch.setattr(
        "app.intel.ingestion.market_data.get_bars_from_db",
        lambda *args, **kwargs: [],
    )
    monkeypatch.setattr(
        "app.intel.ingestion.market_data.fetch_daily_bars",
        lambda sym, **kwargs: [
            type(
                "Bar",
                (),
                {
                    "symbol": sym,
                    "timeframe": "1d",
                    "ts": "2026-05-01T00:00:00",
                    "open": 1.0,
                    "high": 2.0,
                    "low": 0.5,
                    "close": 1.5,
                    "volume": 100.0,
                    "vwap": 1.2,
                    "source": "yfinance",
                },
            )()
            for _ in range(12)
        ],
    )
    bars, tf = fetch_chart_bars("TSLA", "30d", limit=12, settings=None)
    assert tf == "1d"
    assert len(bars) == 12
    assert bars[0]["close"] == 1.5
