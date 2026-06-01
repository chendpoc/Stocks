from __future__ import annotations

from pathlib import Path

from sqlalchemy import text

from app.core.config import Settings
from app.core.time import utc_now_iso
from app.intel.db.connection import get_intel_engine, set_intel_db_path
from app.intel.db.schema import init_intel_db
from app.intel.ingestion.market_data import get_mvp_market_status


def _settings(tmp_repo: Path) -> Settings:
    return Settings(
        repo_root=tmp_repo,
        data_dir=tmp_repo / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
    )


def test_get_mvp_market_status_read_only(tmp_path: Path) -> None:
    tmp_repo = tmp_path
    settings = _settings(tmp_repo)
    db_path = tmp_repo / "data" / "market_intel.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    set_intel_db_path(db_path)
    engine = get_intel_engine(settings)
    init_intel_db(settings, engine)

    ingested = utc_now_iso()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT OR REPLACE INTO market_bars
                (symbol, timeframe, ts, open, high, low, close, volume, source, ingested_at)
                VALUES ('TSLA', '1d', '2026-05-30T00:00:00', 1, 1, 1, 250, 1, 'test', :ingested_at)
                """
            ),
            {"ingested_at": ingested},
        )

    payload = get_mvp_market_status(engine)
    assert "symbols" in payload
    tsla = next(s for s in payload["symbols"] if s["symbol"] == "TSLA")
    assert tsla["latest_bar_ts"] == "2026-05-30T00:00:00"
    assert tsla["ingested_at"] == ingested

    nvda = next(s for s in payload["symbols"] if s["symbol"] == "NVDA")
    assert nvda["latest_bar_ts"] is None
    assert nvda["ingested_at"] is None
