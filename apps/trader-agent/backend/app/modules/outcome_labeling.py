from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

from sqlalchemy import select

from app.core.config import Settings
from app.core.events import record_agent_event
from app.core.time import utc_now_iso
from app.db.models import event_outcomes, trader_raw_messages, trader_semantic_events
from app.db.session import create_sqlite_engine
from app.modules._json import loads


@dataclass(frozen=True)
class OutcomeLabelSummary:
    created_count: int
    skipped_count: int


def label_event_outcomes_from_raw_message_fixtures(settings: Settings) -> OutcomeLabelSummary:
    engine = create_sqlite_engine(settings)
    created_count = 0
    skipped_count = 0

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
            sidecar = loads(row["attachments"], default={}) or {}
            outcome = sidecar.get("outcome")
            if not outcome:
                skipped_count += 1
                continue
            symbol = row["symbol"]
            if not symbol:
                skipped_count += 1
                continue
            existing = conn.execute(
                select(event_outcomes.c.id).where(event_outcomes.c.event_id == row["id"])
            ).scalar_one_or_none()
            if existing is not None:
                skipped_count += 1
                continue

            conn.execute(
                event_outcomes.insert().values(
                    id=str(uuid4()),
                    event_id=row["id"],
                    symbol=symbol,
                    return_30m=outcome.get("return_30m"),
                    return_1h=outcome.get("return_1h"),
                    return_eod=outcome.get("return_eod"),
                    return_1d=outcome.get("return_1d"),
                    return_3d=outcome.get("return_3d"),
                    return_5d=outcome.get("return_5d"),
                    return_10d=outcome.get("return_10d"),
                    mfe=outcome.get("mfe"),
                    mae=outcome.get("mae"),
                    outperformed_qqq=outcome.get("outperformed_qqq"),
                    hit_stop=outcome.get("hit_stop"),
                    hit_target=outcome.get("hit_target"),
                    final_label=outcome.get("final_label", "fixture_labeled"),
                    notes=outcome.get("notes"),
                    calculated_at=utc_now_iso(),
                )
            )
            created_count += 1

    record_agent_event(
        settings,
        event_type="outcome_labeling.completed",
        status="completed",
        output_summary={"created_count": created_count, "skipped_count": skipped_count},
    )
    return OutcomeLabelSummary(created_count=created_count, skipped_count=skipped_count)
