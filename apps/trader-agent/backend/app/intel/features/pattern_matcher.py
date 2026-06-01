from __future__ import annotations

from sqlalchemy import text

from app.intel import logger


def scan_patterns(engine) -> list[dict]:
    alerts: list[dict] = []
    with engine.connect() as conn:
        patterns = conn.execute(
            text(
                """
                SELECT pattern_id, name, trigger_sql, affected_assets, reliability_score
                FROM patterns
                WHERE trigger_sql IS NOT NULL
                """
            )
        ).mappings().all()
    for p in patterns:
        try:
            with engine.connect() as conn:
                hit = conn.execute(text(p["trigger_sql"])).scalar()
            if hit and int(hit) > 0:
                alerts.append(
                    {
                        "pattern_id": p["pattern_id"],
                        "pattern_name": p["name"],
                        "affected_assets": p["affected_assets"],
                        "match_count": int(hit),
                        "reliability_score": p["reliability_score"],
                    }
                )
        except Exception as exc:
            logger.warning("pattern_matcher %s failed: %s", p["pattern_id"], exc)
    return alerts
