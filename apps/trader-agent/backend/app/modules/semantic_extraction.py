from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.core.config import Settings
from app.core.events import record_agent_event
from app.core.time import utc_now_iso
from app.db.models import trader_raw_messages, trader_semantic_events
from app.db.session import create_sqlite_engine
from app.modules._json import dumps
from app.modules.ticker_alias import TickerAliasResolver
from app.rulepack.loader import load_rulepack

EXTRACTOR_VERSION = "semantic-extractor-v0.1"


@dataclass(frozen=True)
class ExtractionSummary:
    created_count: int
    skipped_count: int


@dataclass(frozen=True)
class PatternRule:
    needle: str
    setup_hint: str
    action: str
    entry_condition: str
    invalidation: str | None
    timeframe: str
    confidence: float
    risk_notes: list[str]


PATTERN_RULES: tuple[PatternRule, ...] = (
    PatternRule(
        needle="减持后等三天",
        setup_hint="post_reduction_wait_three_days",
        action="wait",
        entry_condition="wait_three_days_after_reduction_then_require_volume_vwap_reclaim",
        invalidation="跌破前低 invalidates the wait setup.",
        timeframe="3d",
        confidence=0.82,
        risk_notes=["Do not chase immediately after reduction."],
    ),
    PatternRule(
        needle="急跌之后量能缩减",
        setup_hint="sharp_drop_volume_contraction",
        action="observe",
        entry_condition="sharp_drop_then_volume_contraction",
        invalidation="selling_volume_expands_again",
        timeframe="intraday",
        confidence=0.76,
        risk_notes=["First bounce can be unstable."],
    ),
    PatternRule(
        needle="二次握手",
        setup_hint="second_handshake",
        action="wait",
        entry_condition="wait_for_second_handshake_confirmation",
        invalidation="second_handshake_fails",
        timeframe="intraday",
        confidence=0.74,
        risk_notes=["Avoid entering on first impulse."],
    ),
    PatternRule(
        needle="回补缺口",
        setup_hint="gap_fill_acceptance",
        action="observe",
        entry_condition="gap_fill_then_acceptance",
        invalidation="gap_fill_rejects_without_support",
        timeframe="intraday",
        confidence=0.72,
        risk_notes=[],
    ),
    PatternRule(
        needle="周五期权日多空双杀",
        setup_hint="friday_options_double_kill",
        action="risk_warning",
        entry_condition="friday_options_expiry_chop_risk",
        invalidation=None,
        timeframe="intraday",
        confidence=0.78,
        risk_notes=["Options expiry can punish both long and short chasers."],
    ),
    PatternRule(
        needle="BTC",
        setup_hint="btc_move_alert",
        action="market_context_alert",
        entry_condition="btc_move_threshold_0_85_to_1_pct",
        invalidation=None,
        timeframe="intraday",
        confidence=0.8,
        risk_notes=["BTC is context for crypto-beta names, not stock-universe expansion."],
    ),
)


def extract_semantic_events_for_all(settings: Settings) -> ExtractionSummary:
    rulepack = load_rulepack(settings.rulepack_path)
    resolver = TickerAliasResolver.from_rulepack(rulepack)
    engine = create_sqlite_engine(settings)
    created_count = 0
    skipped_count = 0

    with engine.begin() as conn:
        messages = conn.execute(select(trader_raw_messages)).mappings().all()
        for message in messages:
            created_for_message = _extract_message(conn, message, resolver)
            if created_for_message:
                created_count += created_for_message
            else:
                skipped_count += 1

    record_agent_event(
        settings,
        event_type="semantic_extraction.completed",
        status="completed",
        output_summary={"created_count": created_count, "skipped_count": skipped_count},
    )
    return ExtractionSummary(created_count=created_count, skipped_count=skipped_count)


def _extract_message(conn: Any, message: Any, resolver: TickerAliasResolver) -> int:
    text = message["raw_text"]
    matched_rules = [rule for rule in PATTERN_RULES if _rule_matches(rule, text)]
    if not matched_rules:
        return 0

    resolution = resolver.resolve_text(text)
    primary_symbol = (
        resolution.active_universe_matches[0].symbol if resolution.active_universe_matches else None
    )
    ticker_context = [
        {
            "symbol": candidate.symbol,
            "alias": candidate.alias,
            "status": candidate.status,
            "asset_class": candidate.asset_class,
            "confidence": candidate.confidence,
        }
        for candidate in resolution.candidates
    ]

    created = 0
    for rule in matched_rules:
        existing = conn.execute(
            select(trader_semantic_events.c.id).where(
                trader_semantic_events.c.raw_message_id == message["id"],
                trader_semantic_events.c.setup_hint == rule.setup_hint,
                trader_semantic_events.c.extractor_version == EXTRACTOR_VERSION,
            )
        ).scalar_one_or_none()
        if existing is not None:
            continue

        conn.execute(
            trader_semantic_events.insert().values(
                id=str(uuid4()),
                raw_message_id=message["id"],
                timestamp=message["timestamp"],
                symbol=primary_symbol,
                aliases=dumps({"ticker_context": ticker_context}),
                asset_class="equity" if primary_symbol else "market_context",
                action=rule.action,
                direction=_direction_from_text(text),
                timeframe=rule.timeframe,
                instrument="equity_or_context",
                setup_hint=rule.setup_hint,
                entry_condition=rule.entry_condition,
                invalidation=_invalidation_from_text(text, rule),
                target=None,
                stop=None,
                thesis=text,
                catalyst=dumps(_catalyst_from_text(text)),
                risk_notes=dumps(rule.risk_notes),
                language_strength="explicit",
                confidence=rule.confidence,
                extractor_version=EXTRACTOR_VERSION,
                created_at=utc_now_iso(),
            )
        )
        created += 1
    return created


def _rule_matches(rule: PatternRule, text: str) -> bool:
    if rule.setup_hint == "btc_move_alert":
        return bool(re.search(r"BTC|比特币", text, re.IGNORECASE)) and bool(
            re.search(r"0\.85%|1%", text)
        )
    return rule.needle in text


def _direction_from_text(text: str) -> str | None:
    if "不要" in text or "别" in text:
        return "cautious"
    if "看承接" in text or "站回" in text:
        return "bullish_if_confirmed"
    return None


def _invalidation_from_text(text: str, rule: PatternRule) -> str | None:
    if "跌破前低" in text:
        return "跌破前低"
    if "QQQ 继续破位" in text:
        return "QQQ 继续破位"
    return rule.invalidation


def _catalyst_from_text(text: str) -> dict[str, str] | None:
    if "减持" in text:
        return {"type": "filing_or_reduction", "phrase": "减持"}
    return None
