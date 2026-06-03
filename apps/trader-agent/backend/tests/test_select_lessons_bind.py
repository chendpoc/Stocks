"""select_lessons SQL bind keys must tolerate dotted symbols (e.g. TSLL.US)."""

from __future__ import annotations

from unittest.mock import MagicMock

from app.intel.context.selector import select_lessons


def test_select_lessons_dotted_symbol_bind_keys() -> None:
    conn = MagicMock()
    conn.execute.return_value.mappings.return_value.all.return_value = []
    engine = MagicMock()
    engine.connect.return_value.__enter__.return_value = conn

    row = {
        "lesson_id": "les-1",
        "ts": "2026-06-01T00:00:00+00:00",
        "symbol": "TSLL.US",
        "symbols_json": '["TSLL.US"]',
        "pattern_id": None,
        "explanation_type": None,
        "market_regime": None,
        "lesson_text": "test",
        "summary": "summary",
        "rule_text": "rule",
        "tags_json": "[]",
        "confidence": 0.8,
        "source_type": "manual",
        "when_to_apply": None,
        "when_not_to_apply": None,
        "weight_update": None,
        "verdict": None,
        "created_at": "2026-06-01T00:00:00+00:00",
    }
    conn.execute.return_value.mappings.return_value.all.return_value = [row]

    select_lessons(engine, symbols=["TSLL.US"])

    assert conn.execute.call_count == 1
    (stmt, params), _kwargs = conn.execute.call_args_list[0]
    sql = str(stmt)
    assert "symbol = :sym_0" in sql
    assert "symbols_json LIKE :pat_0" in sql
    assert params["sym_0"] == "TSLL.US"
    assert params["pat_0"] == '%"TSLL.US"%'
    assert "sym_TSLL" not in params
