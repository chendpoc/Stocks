from __future__ import annotations

from uuid import uuid4

from sqlalchemy import text

from app.core.config import Settings
from app.core.time import utc_now_iso
from app.intel import logger
from app.intel.ingestion.market_data import get_bars_from_db, get_latest_close
from app.intel.postmortem.lessons import create_lesson_from_outcome
from app.modules.json_row_codec import serialize_json_field

WINDOW_DAYS = {"1D": 1, "3D": 3, "5D": 5, "1W": 7}


def _parse_window_days(window: str) -> int:
    normalized = window.strip().upper()
    if normalized in WINDOW_DAYS:
        return WINDOW_DAYS[normalized]
    if normalized.endswith("D") and normalized[:-1].isdigit():
        return int(normalized[:-1])
    return 3


def evaluate_due_predictions(settings: Settings, engine) -> dict[str, int]:
    now = utc_now_iso()
    counts = {"supported": 0, "rejected": 0, "mixed": 0, "inconclusive": 0}

    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT p.prediction_id, p.hypothesis_id, p.window, p.expected_outcome,
                       p.invalid_if, p.reference_price, h.symbol
                FROM predictions p
                JOIN hypotheses h ON h.hypothesis_id = p.hypothesis_id
                WHERE p.status = 'pending' AND p.due_at <= :now
                """
            ),
            {"now": now},
        ).mappings().all()

    for row in rows:
        symbol = row["symbol"]
        ref_price = row["reference_price"]
        if not ref_price:
            ref_price = get_latest_close(engine, symbol)
        if not ref_price:
            counts["inconclusive"] += 1
            continue

        bars = get_bars_from_db(engine, symbol, "1d", limit=30)
        if not bars:
            counts["inconclusive"] += 1
            continue

        closes = [b["close"] for b in bars]
        highs = [b["high"] for b in bars]
        lows = [b["low"] for b in bars]
        final_close = closes[-1]
        return_pct = (final_close - ref_price) / ref_price * 100
        mfe = (max(highs) - ref_price) / ref_price * 100
        mae = (min(lows) - ref_price) / ref_price * 100

        qqq_bars = get_bars_from_db(engine, "QQQ", "1d", limit=30)
        rel_return = return_pct
        if qqq_bars and len(qqq_bars) >= 2:
            qqq_ret = (qqq_bars[-1]["close"] - qqq_bars[0]["close"]) / qqq_bars[0]["close"] * 100
            rel_return = return_pct - qqq_ret

        expected = (row["expected_outcome"] or "").lower()
        invalid_if = (row["invalid_if"] or "").lower()
        invalidation_triggered = 0
        if "跌" in invalid_if and return_pct < -2:
            invalidation_triggered = 1
        elif "涨" in invalid_if and return_pct > 2:
            invalidation_triggered = 1

        if invalidation_triggered:
            verdict = "rejected"
        elif ("涨" in expected or "反弹" in expected) and return_pct > 1:
            verdict = "supported"
        elif ("跌" in expected or "回调" in expected) and return_pct < -1:
            verdict = "supported"
        elif abs(return_pct) < 0.5:
            verdict = "inconclusive"
        else:
            verdict = "mixed"

        counts[verdict] += 1
        outcome_id = str(uuid4())
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    INSERT INTO outcomes
                    (outcome_id, prediction_id, symbol, evaluated_at, return_pct,
                     relative_return_vs_benchmark, max_favorable_excursion,
                     max_adverse_excursion, invalidation_triggered, verdict, notes)
                    VALUES (:outcome_id, :prediction_id, :symbol, :evaluated_at, :return_pct,
                            :rel_return, :mfe, :mae, :invalidation_triggered, :verdict, :notes)
                    """
                ),
                {
                    "outcome_id": outcome_id,
                    "prediction_id": row["prediction_id"],
                    "symbol": symbol,
                    "evaluated_at": now,
                    "return_pct": return_pct,
                    "rel_return": rel_return,
                    "mfe": mfe,
                    "mae": mae,
                    "invalidation_triggered": invalidation_triggered,
                    "verdict": verdict,
                    "notes": serialize_json_field({"reference_price": ref_price, "final_close": final_close}),
                },
            )
            conn.execute(
                text("UPDATE predictions SET status = 'evaluated' WHERE prediction_id = :pid"),
                {"pid": row["prediction_id"]},
            )

        with engine.connect() as conn:
            hypo = conn.execute(
                text(
                    """
                    SELECT hypothesis_id, symbol, claim, professional_explanation,
                           invalidation_condition
                    FROM hypotheses WHERE hypothesis_id = :hid
                    """
                ),
                {"hid": row["hypothesis_id"]},
            ).mappings().one_or_none()
        if hypo:
            create_lesson_from_outcome(
                engine,
                {
                    "symbol": symbol,
                    "verdict": verdict,
                    "return_pct": return_pct,
                },
                dict(hypo),
            )

    logger.info("Evaluated predictions: %s", counts)
    return counts
