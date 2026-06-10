from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import text

from app.intel.market_agent.patterns import FailureMemoryService, PatternMemoryService
from app.intel.market_agent.repositories import create_session_context_pack, list_setup_events
from app.intel.market_agent.schemas import SessionContextPack
from app.modules._json import loads


DEFAULT_CONTEXT_MAX_CHARS = 2400


@dataclass(frozen=True)
class SessionContextPackSummary:
    session_context_pack_id: str
    session_id: str
    symbol: str | None
    markdown: str
    created_at: str | None
    promoted_count: int
    degrading_count: int
    active_warning_count: int
    recent_fact_count: int


def _truncate(text_value: str, max_chars: int) -> str:
    text_value = text_value or ""
    if max_chars <= 0:
        return ""
    return text_value[:max_chars]


def _normalize_symbol(value: str | None) -> str | None:
    return value.upper() if value else None


def _section_lines(title: str, lines: list[str]) -> str:
    body = "\n".join(lines) if lines else "- (none)"
    return f"## {title}\n{body}"


def _recent_model_decisions_rows(
    engine,
    *,
    symbol: str | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    clauses = []
    params: dict[str, Any] = {"limit": limit}
    if symbol:
        clauses.append("symbol = :symbol")
        params["symbol"] = symbol
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with engine.connect() as conn:
        rows = (
            conn.execute(
                text(
                    f"""
                    SELECT decision_id, symbol, action, decision_json, created_at
                    FROM model_decisions
                    {where}
                    ORDER BY created_at DESC
                    LIMIT :limit
                    """
                ),
                params,
            )
            .mappings()
            .all()
        )
    return [dict(row) for row in rows]


class SessionContextBootstrap:
    def __init__(self, engine) -> None:
        self.engine = engine
        self.pattern_service = PatternMemoryService(engine)
        self.failure_service = FailureMemoryService(engine)

    def bootstrap(
        self,
        session_id: str,
        symbol: str | None = None,
        *,
        max_chars: int = DEFAULT_CONTEXT_MAX_CHARS,
        max_fact_items: int = 10,
    ) -> SessionContextPackSummary:
        normalized_session = str(session_id).strip()
        normalized_symbol = _normalize_symbol(symbol)

        promoted_patterns = self.pattern_service.list(
            symbol=normalized_symbol,
            status="promoted",
            limit=100,
        )
        degrading_patterns = self.pattern_service.list(
            symbol=normalized_symbol,
            status="degrading",
            limit=100,
        )
        active_warnings = self.failure_service.list_active_warnings(
            symbol=normalized_symbol,
            limit=100,
        )
        setup_rows = list_setup_events(self.engine, symbol=normalized_symbol, limit=max_fact_items)
        decision_rows = _recent_model_decisions_rows(
            self.engine,
            symbol=normalized_symbol,
            limit=max_fact_items,
        )

        promoted_lines = [
            (
                f"- {item.symbol} | {item.pattern_id} | status={item.memory_json.get('status', 'active')} | "
                f"confidence={item.confidence if item.confidence is not None else 'n/a'}"
            )
            for item in promoted_patterns
        ]
        degrading_lines = [
            (
                f"- {item.symbol} | {item.pattern_id} | status={item.memory_json.get('status', 'active')} | "
                f"confidence={item.confidence if item.confidence is not None else 'n/a'}"
            )
            for item in degrading_patterns
        ]
        failure_lines = [
            (
                f"- {item.symbol} | {item.failure_type} | status={item.failure_json.get('status', 'active')} | "
                f"setup={item.failure_json.get('setup_name', item.context_json.get('setup_name', ''))}"
            )
            for item in active_warnings
        ]
        fact_lines: list[str] = []
        for item in setup_rows:
            setup_name = item.setup_name or item.event_type
            fact_lines.append(
                f"- setup={setup_name} | symbol={item.symbol} | "
                f"status={item.setup_status or 'n/a'} | event={item.setup_event_id}"
            )
        for item in decision_rows:
            decision_json = item.get("decision_json")
            payload = loads(decision_json, default={}) if isinstance(decision_json, str) else {}
            action = str(payload.get("action", item.get("action", "n/a")))
            thesis = payload.get("thesis", "")
            created_at = item.get("created_at") or "n/a"
            fact_lines.append(
                f"- decision={item.get('decision_id')} | symbol={item.get('symbol')} | action={action} | "
                f"{created_at} | {thesis}"
            )
        fact_lines = fact_lines[:max_fact_items]

        markdown = _truncate(
            "\n\n".join(
                [
                    "# Session Context Pack",
                    f"session_id: {normalized_session}",
                    f"symbol: {normalized_symbol or '-'}",
                    _section_lines("Promoted Patterns", promoted_lines),
                    _section_lines("Degrading Patterns", degrading_lines),
                    _section_lines("Active Warnings", failure_lines),
                    _section_lines("Recent Context Facts", fact_lines),
                ]
            ),
            max_chars=max_chars,
        )

        summary = {
            "summary": {
                "promoted_pattern_count": len(promoted_patterns),
                "degrading_pattern_count": len(degrading_patterns),
                "active_warning_failure_count": len(active_warnings),
                "recent_context_fact_count": len(fact_lines),
                "max_chars": max_chars,
            },
        }

        created = create_session_context_pack(
            self.engine,
            SessionContextPack(
                session_context_pack_id=str(uuid.uuid4()),
                session_id=normalized_session,
                symbol=normalized_symbol,
                context_pack_json={"markdown": markdown},
                metadata_json=summary,
                created_at=None,
            ),
        )

        return SessionContextPackSummary(
            session_context_pack_id=created.session_context_pack_id,
            session_id=created.session_id,
            symbol=created.symbol,
            markdown=markdown,
            created_at=created.created_at,
            promoted_count=len(promoted_patterns),
            degrading_count=len(degrading_patterns),
            active_warning_count=len(active_warnings),
            recent_fact_count=len(fact_lines),
        )

    def latest(
        self,
        *,
        session_id: str | None = None,
        symbol: str | None = None,
    ) -> SessionContextPackSummary | None:
        clauses: list[str] = []
        params: dict[str, Any] = {"limit": 1}
        if session_id is not None:
            clauses.append("session_id = :session_id")
            params["session_id"] = str(session_id)
        if symbol is not None:
            clauses.append("symbol = :symbol")
            params["symbol"] = _normalize_symbol(symbol)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self.engine.connect() as conn:
            row = (
                conn.execute(
                    text(
                        f"""
                        SELECT * FROM session_context_packs
                        {where}
                        ORDER BY created_at DESC
                        LIMIT :limit
                        """
                    ),
                    params,
                )
                .mappings()
                .fetchone()
            )
        if row is None:
            return None
        row_dict = dict(row)
        context_pack_json = row_dict.get("context_pack_json")
        metadata_json = row_dict.get("metadata_json")
        if isinstance(context_pack_json, str):
            row_dict["context_pack_json"] = loads(context_pack_json, default={})
        if isinstance(metadata_json, str):
            row_dict["metadata_json"] = loads(metadata_json, default={})
        summary = row_dict.get("metadata_json", {}).get("summary", {})
        markdown = (row_dict.get("context_pack_json") or {}).get("markdown", "")
        return SessionContextPackSummary(
            session_context_pack_id=row_dict["session_context_pack_id"],
            session_id=row_dict["session_id"],
            symbol=row_dict.get("symbol"),
            markdown=markdown,
            created_at=row_dict.get("created_at"),
            promoted_count=int(summary.get("promoted_pattern_count", 0)),
            degrading_count=int(summary.get("degrading_pattern_count", 0)),
            active_warning_count=int(summary.get("active_warning_failure_count", 0)),
            recent_fact_count=int(summary.get("recent_context_fact_count", 0)),
        )
