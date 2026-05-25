from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import select

from app.core.config import Settings
from app.core.events import record_agent_event
from app.core.time import utc_now_iso
from app.db.models import event_outcomes, playbooks, trader_semantic_events
from app.db.session import create_sqlite_engine
from app.modules._json import dumps


@dataclass(frozen=True)
class PlaybookAggregationSummary:
    created_count: int
    skipped_count: int


def aggregate_playbooks(
    settings: Settings,
    *,
    min_confidence: float = 0.65,
) -> PlaybookAggregationSummary:
    engine = create_sqlite_engine(settings)
    created_count = 0
    skipped_count = 0

    with engine.begin() as conn:
        rows = (
            conn.execute(
                select(
                    trader_semantic_events.c.id,
                    trader_semantic_events.c.symbol,
                    trader_semantic_events.c.setup_hint,
                    trader_semantic_events.c.entry_condition,
                    trader_semantic_events.c.invalidation,
                    trader_semantic_events.c.timeframe,
                    trader_semantic_events.c.instrument,
                    trader_semantic_events.c.confidence,
                    event_outcomes.c.return_1d,
                    event_outcomes.c.mfe,
                    event_outcomes.c.mae,
                    event_outcomes.c.final_label,
                ).join(
                    event_outcomes,
                    event_outcomes.c.event_id == trader_semantic_events.c.id,
                    isouter=True,
                )
            )
            .mappings()
            .all()
        )

        groups: dict[str, list[dict[str, object]]] = defaultdict(list)
        for row in rows:
            confidence = float(row["confidence"] or 0)
            setup_hint = row["setup_hint"]
            if not setup_hint or confidence < min_confidence:
                skipped_count += 1
                continue
            groups[str(setup_hint)].append(dict(row))

        for setup_hint, examples in groups.items():
            symbols = sorted({str(row["symbol"]) for row in examples if row["symbol"]})
            required_conditions = sorted(
                {str(row["entry_condition"]) for row in examples if row["entry_condition"]}
            )
            invalidation_conditions = sorted(
                {str(row["invalidation"]) for row in examples if row["invalidation"]}
            )
            outcome_examples = [row for row in examples if row["final_label"]]
            win_rate = _win_rate(outcome_examples)
            values = {
                "name": setup_hint.replace("_", " ").title(),
                "description": f"Aggregated deterministic playbook for {setup_hint}.",
                "symbols": dumps(symbols),
                "setup_type": setup_hint,
                "required_market_regime": dumps({"evidence": "fixture_or_missing_context"}),
                "required_conditions": dumps(required_conditions),
                "invalidation_conditions": dumps(invalidation_conditions),
                "preferred_timeframe": examples[0]["timeframe"],
                "preferred_instrument": dumps({"instrument": examples[0]["instrument"]}),
                "historical_win_rate": win_rate,
                "avg_return": _avg([row["return_1d"] for row in outcome_examples]),
                "avg_mfe": _avg([row["mfe"] for row in outcome_examples]),
                "avg_mae": _avg([row["mae"] for row in outcome_examples]),
                "sample_size": len(examples),
                "confidence": min(0.95, _avg([row["confidence"] for row in examples]) or 0.0),
                "version": "0.1.0",
                "status": "candidate",
                "updated_at": utc_now_iso(),
            }
            existing = conn.execute(
                select(playbooks.c.id).where(
                    playbooks.c.setup_type == setup_hint,
                    playbooks.c.version == "0.1.0",
                )
            ).scalar_one_or_none()
            if existing is not None:
                conn.execute(playbooks.update().where(playbooks.c.id == existing).values(**values))
                continue

            conn.execute(
                playbooks.insert().values(
                    id=str(uuid4()),
                    created_at=utc_now_iso(),
                    **values,
                )
            )
            created_count += 1

    record_agent_event(
        settings,
        event_type="playbook.aggregation.completed",
        status="completed",
        output_summary={"created_count": created_count, "skipped_count": skipped_count},
    )
    return PlaybookAggregationSummary(created_count=created_count, skipped_count=skipped_count)


def _avg(values: list[object]) -> float | None:
    numbers = [float(value) for value in values if isinstance(value, int | float | Decimal)]
    if not numbers:
        return None
    return sum(numbers) / len(numbers)


def _win_rate(rows: list[dict[str, object]]) -> float | None:
    if not rows:
        return None
    wins = sum(1 for row in rows if row["final_label"] == "worked")
    return wins / len(rows)
