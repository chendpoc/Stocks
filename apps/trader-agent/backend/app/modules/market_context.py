from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.core.config import Settings
from app.core.events import record_agent_event
from app.core.time import utc_now_iso
from app.db.models import market_context_snapshots, trader_raw_messages, trader_semantic_events
from app.db.session import create_sqlite_engine
from app.modules.json_row_codec import coerce_json_value, serialize_json_field

CONTEXT_BUILDER_VERSION = "market-context-v0.1"


@dataclass(frozen=True)
class ContextBuildSummary:
    created_count: int
    evidence_gap_count: int


def build_context_snapshots_for_events(settings: Settings) -> ContextBuildSummary:
    engine = create_sqlite_engine(settings)
    created_count = 0
    evidence_gap_count = 0

    with engine.begin() as conn:
        rows = (
            conn.execute(
                select(trader_semantic_events, trader_raw_messages.c.attachments)
                .join(
                    trader_raw_messages,
                    trader_raw_messages.c.id == trader_semantic_events.c.raw_message_id,
                )
            )
            .mappings()
            .all()
        )
        for row in rows:
            sidecar = coerce_json_value(row["attachments"], default={}) or {}
            context = sidecar.get("context") or {}
            evidence_gap = not bool(context)
            if evidence_gap:
                evidence_gap_count += 1
            symbol = row["symbol"] or _symbol_from_aliases(row["aliases"]) or "MARKET"
            existing = conn.execute(
                select(market_context_snapshots.c.id).where(
                    market_context_snapshots.c.event_id == row["id"],
                    market_context_snapshots.c.context_builder_version == CONTEXT_BUILDER_VERSION,
                )
            ).scalar_one_or_none()
            if existing is not None:
                continue

            conn.execute(
                market_context_snapshots.insert().values(
                    id=str(uuid4()),
                    event_id=row["id"],
                    timestamp=row["timestamp"],
                    symbol=symbol,
                    symbol_price=context.get("symbol_price"),
                    symbol_vwap=context.get("symbol_vwap"),
                    symbol_above_vwap=context.get("symbol_above_vwap"),
                    symbol_relative_strength_vs_qqq=context.get("symbol_relative_strength_vs_qqq"),
                    symbol_relative_volume=context.get("symbol_relative_volume"),
                    spy_state=serialize_json_field(context.get("spy_state") or {"evidence_gap": evidence_gap}),
                    qqq_state=serialize_json_field(context.get("qqq_state") or {"evidence_gap": evidence_gap}),
                    vix_state=serialize_json_field(context.get("vix_state") or {"evidence_gap": evidence_gap}),
                    btc_state=serialize_json_field(context.get("btc_state") or {"evidence_gap": evidence_gap}),
                    eth_state=serialize_json_field(context.get("eth_state") or {"evidence_gap": evidence_gap}),
                    news_summary=serialize_json_field(
                        context.get("news_summary") or {"evidence_gap": evidence_gap}
                    ),
                    options_summary=serialize_json_field(
                        context.get("options_summary") or {"evidence_gap": evidence_gap}
                    ),
                    context_builder_version=CONTEXT_BUILDER_VERSION,
                    created_at=utc_now_iso(),
                )
            )
            created_count += 1

    record_agent_event(
        settings,
        event_type="market_context.completed",
        status="completed",
        output_summary={"created_count": created_count, "evidence_gap_count": evidence_gap_count},
    )
    return ContextBuildSummary(created_count=created_count, evidence_gap_count=evidence_gap_count)


def _symbol_from_aliases(aliases: str | None) -> str | None:
    payload: dict[str, Any] = coerce_json_value(aliases, default={}) or {}
    for candidate in payload.get("ticker_context", []):
        if candidate.get("status") in {"context_asset", "candidate"}:
            return candidate.get("symbol")
    return None
