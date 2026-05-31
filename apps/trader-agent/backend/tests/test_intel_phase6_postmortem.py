from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from sqlalchemy import text

from app.core.config import Settings
from app.core.time import utc_now_iso
from app.intel.db.connection import set_intel_db_path
from app.intel.db.schema import init_intel_db
from app.intel.ingestion.market_data import Bar, _insert_bars
from app.intel.postmortem.evaluator import evaluate_due_predictions


def _settings(tmp_repo: Path) -> Settings:
    return Settings(
        repo_root=tmp_repo,
        data_dir=tmp_repo / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
    )


def test_evaluate_due_predictions_uses_reference_price(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    tmp_repo.mkdir()
    set_intel_db_path(tmp_repo / "data" / "market_intel.db")
    settings = _settings(tmp_repo)
    engine = init_intel_db(settings)

    bars = [
        Bar(
            symbol="TSLA",
            timeframe="1d",
            ts=f"2026-05-{idx + 1:02d}T00:00:00",
            open=100 + idx,
            high=101 + idx,
            low=99 + idx,
            close=100 + idx,
            volume=1_000_000,
            vwap=100 + idx,
            source="test",
        )
        for idx in range(10)
    ]
    _insert_bars(engine, bars)

    hypothesis_id = str(uuid4())
    prediction_id = str(uuid4())
    now = utc_now_iso()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO hypotheses
                (hypothesis_id, signal_id, ts, symbol, claim, professional_explanation,
                 plain_language_explanation, invalidation_condition, confidence, status)
                VALUES (:hid, 'sig_test', :ts, 'TSLA', 'test claim', 'pro view', 'plain', 'break low', 0.6, 'pending')
                """
            ),
            {"hid": hypothesis_id, "ts": now},
        )
        conn.execute(
            text(
                """
                INSERT INTO predictions
                (prediction_id, hypothesis_id, window, expected_outcome, invalid_if,
                 due_at, reference_price, status)
                VALUES (:pid, :hid, '3D', 'Hold above support', '跌 below support',
                        :due_at, 100.0, 'pending')
                """
            ),
            {"pid": prediction_id, "hid": hypothesis_id, "due_at": now},
        )

    counts = evaluate_due_predictions(settings, engine)
    assert counts["supported"] + counts["mixed"] + counts["rejected"] + counts["inconclusive"] >= 1

    with engine.connect() as conn:
        outcome = conn.execute(
            text(
                "SELECT return_pct, verdict FROM outcomes WHERE prediction_id = :pid"
            ),
            {"pid": prediction_id},
        ).mappings().one()
        lesson = conn.execute(
            text(
                "SELECT source_type, symbols_json FROM lessons WHERE source_type = 'postmortem' LIMIT 1"
            )
        ).mappings().one()

    assert outcome["return_pct"] is not None
    assert float(outcome["return_pct"]) > 0
    assert lesson["source_type"] == "postmortem"
    assert "TSLA" in (lesson["symbols_json"] or "")
