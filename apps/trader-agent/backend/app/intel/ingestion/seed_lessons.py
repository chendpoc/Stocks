from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from sqlalchemy import text

from app.core.config import Settings
from app.core.time import utc_now_iso
from app.intel import logger
from app.intel.db.connection import get_intel_engine
from app.modules._json import dumps

SEED_LESSONS = [
    {
        "symbols_json": ["TSLA", "TSLL"],
        "summary": "TSLL 回踩高于前低且缩量，卖压可能衰减；需反弹放量站回关键位确认。",
        "rule_text": "回踩低点高于前低 + 下跌成交量低于前次 → 观察；确认需反弹放量站回关键位。",
        "tags_json": ["seed", "technical", "higher_low"],
        "confidence": 0.7,
        "source_type": "seed",
        "lesson_text": "更高低点+缩量回踩是潜在吸筹结构，不能单独作为入场依据。",
    },
    {
        "symbols_json": ["TSLA", "QQQ"],
        "summary": "个股相对 QQQ 抗跌时，区分真实强势与滞后补跌；需配合大盘方向验证。",
        "rule_text": "QQQ 下跌而个股跌幅明显更小 → 关注相对强势；补跌放量跌破前低则失效。",
        "tags_json": ["seed", "relative_strength", "benchmark"],
        "confidence": 0.65,
        "source_type": "seed",
        "lesson_text": "相对强势需对照基准指数，避免把滞后补跌误判为独立买盘。",
    },
    {
        "symbols_json": ["ARKK", "TSLA"],
        "summary": "ARK 相关持仓变动有披露延迟，不能当作实时 Smart Money 信号。",
        "rule_text": "引用 13F/ARK 变动时必须标注季度延迟；价格行为优先于持仓叙事。",
        "tags_json": ["seed", "smart_money", "delay"],
        "confidence": 0.6,
        "source_type": "seed",
        "lesson_text": "Smart Money 数据滞后，需与价格确认联动，避免把披露当实时流向。",
    },
]


def _summaries_dir(settings: Settings) -> Path:
    return settings.repo_root / "docs" / "summaries"


def seed_lessons_if_empty(settings: Settings | None = None, engine=None) -> int:
    """Insert built-in seed lessons when the table has no seed rows."""
    eng = engine or get_intel_engine(settings)
    with eng.connect() as conn:
        existing = conn.execute(
            text("SELECT COUNT(*) FROM lessons WHERE source_type = 'seed'")
        ).scalar()
        if existing and int(existing) > 0:
            return 0

    written = 0
    ts = utc_now_iso()
    with eng.begin() as conn:
        for seed in SEED_LESSONS:
            symbols = seed["symbols_json"]
            conn.execute(
                text(
                    """
                    INSERT INTO lessons
                    (lesson_id, ts, symbol, symbols_json, pattern_id, explanation_type,
                     market_regime, lesson_text, summary, rule_text, tags_json, confidence,
                     source_type, when_to_apply, when_not_to_apply, weight_update, verdict)
                    VALUES (:lesson_id, :ts, :symbol, :symbols_json, NULL, 'seed', NULL,
                            :lesson_text, :summary, :rule_text, :tags_json, :confidence,
                            :source_type, :when_to_apply, :when_not_to_apply, NULL, NULL)
                    """
                ),
                {
                    "lesson_id": f"seed_{uuid4().hex[:8]}",
                    "ts": ts,
                    "symbol": symbols[0] if symbols else None,
                    "symbols_json": dumps(symbols),
                    "lesson_text": seed["lesson_text"],
                    "summary": seed["summary"][:200],
                    "rule_text": seed["rule_text"],
                    "tags_json": dumps(seed["tags_json"]),
                    "confidence": seed["confidence"],
                    "source_type": seed["source_type"],
                    "when_to_apply": seed["rule_text"],
                    "when_not_to_apply": None,
                },
            )
            written += 1

    summaries = _summaries_dir(settings) if settings else None
    if summaries and summaries.exists():
        md_count = len(list(summaries.rglob("*.md")))
        logger.info(
            "seed_lessons: %s summary files available for future LLM extraction",
            md_count,
        )

    logger.info("seed_lessons wrote %s rows", written)
    return written
