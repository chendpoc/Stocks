from __future__ import annotations

from pathlib import Path

from sqlalchemy import select

from app.core.config import Settings
from app.db.migrations import bootstrap_database
from app.db.models import agent_events
from app.db.session import create_sqlite_engine
from app.tools.alpha_vantage_adapter import ALPHA_VANTAGE_MARKET_DATA
from app.tools.local_adapter import (
    FILING_EVENTS_FIXTURE,
    MARKET_BARS_FIXTURE,
    NEWS_EVENTS_FIXTURE,
)
from app.tools.longbridge_adapter import LONGBRIDGE_MARKET_DATA
from app.tools.news_archive_adapter import NEWS_ARCHIVE_LOCAL
from app.tools.sec_adapter import SEC_EDGAR
from app.tools.tool_registry import (
    ToolCallAudit,
    ToolPermissionPolicy,
    ToolRegistry,
)
from app.tools.yfinance_adapter import YFINANCE_MARKET_DATA


def _settings(tmp_path: Path, capabilities: set[str] | None = None) -> Settings:
    repo_root = Path(__file__).resolve().parents[4]
    return Settings(
        repo_root=repo_root,
        data_dir=tmp_path / "trader-agent-data",
        rulepack_path=repo_root / "apps" / "trader-agent" / "shared" / "rulepacks" / "v0_1_0.yaml",
        enabled_tool_capabilities=frozenset(capabilities or set()),
    )


def test_registry_marks_phase_2a_read_only_tools_as_mcp_candidates() -> None:
    registry = ToolRegistry()

    tools = {metadata.name: metadata for metadata in registry.list()}

    expected = {
        "local.file_search",
        "local.knowledge_search",
        "fixture.market_data_lookup",
        "sec.filing_lookup",
        "local.news_archive_lookup",
    }
    assert expected <= set(tools)
    for name in expected:
        metadata = tools[name]
        assert metadata.read_only is True
        assert metadata.mcp_candidate is True
        assert metadata.permission_level == "read_only"
        assert metadata.required_capability
        assert metadata.allowed_input_scope
        assert metadata.output_source_type


def test_registry_contains_remote_read_only_market_tools_but_no_broker_or_write_tools() -> None:
    registry = ToolRegistry()

    tools = {metadata.name: metadata for metadata in registry.list()}

    assert {
        "yfinance.market_data_lookup",
        "longbridge.market_data_lookup",
        "alpha_vantage.market_data_lookup",
    } <= set(tools)
    assert all(metadata.read_only for metadata in tools.values())
    assert all("broker" not in metadata.category for metadata in tools.values())
    assert all("order" not in metadata.name for metadata in tools.values())
    assert tools["longbridge.market_data_lookup"].provider == "longbridge.market_data"
    assert tools["longbridge.market_data_lookup"].required_capability == LONGBRIDGE_MARKET_DATA


def test_disabled_capability_denies_provider_tool_without_calling_provider(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path, capabilities=set())
    decision = ToolPermissionPolicy().evaluate(
        settings,
        "yfinance.market_data_lookup",
        input_scope={
            "approved_remote_market_data_read",
            "market_data_read",
            "symbol_read",
        },
    )

    assert decision.allowed is False
    assert decision.status == "denied"
    assert decision.reason_code == "capability_disabled"
    assert decision.required_capability == YFINANCE_MARKET_DATA
    assert "missing capability: market_data.yfinance" in decision.denial_reasons
    assert decision.requested_input_scope == (
        "approved_remote_market_data_read",
        "market_data_read",
        "symbol_read",
    )


def test_remote_market_tools_require_explicit_approved_remote_scope(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path, capabilities={YFINANCE_MARKET_DATA})
    policy = ToolPermissionPolicy()

    denied = policy.evaluate(
        settings,
        "yfinance.market_data_lookup",
        input_scope={"market_data_read", "symbol_read"},
    )
    allowed = policy.evaluate(
        settings,
        "yfinance.market_data_lookup",
        input_scope={
            "approved_remote_market_data_read",
            "market_data_read",
            "symbol_read",
        },
    )

    assert denied.allowed is False
    assert denied.reason_code == "required_input_scope_missing"
    assert (
        "required input scope is missing for yfinance.market_data_lookup: "
        "approved_remote_market_data_read"
    ) in denied.denial_reasons
    assert allowed.allowed is True
    assert allowed.requested_input_scope == (
        "approved_remote_market_data_read",
        "market_data_read",
        "symbol_read",
    )


def test_enabled_capability_allows_read_only_scope_and_exposes_metadata(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path, capabilities={SEC_EDGAR})
    decision = ToolPermissionPolicy().evaluate(
        settings,
        "sec.filing_lookup",
        input_scope={"filing_read", "symbol_read", "date_range_read"},
    )

    assert decision.allowed is True
    assert decision.status == "allowed"
    assert decision.reason_code == "allowed"
    assert decision.provider == "sec.edgar"
    assert decision.cost_policy == "free_manual"
    assert decision.output_source_type == "filing"
    assert decision.mcp_candidate is True
    assert "filing_read" in decision.allowed_input_scope


def test_unknown_tool_is_denied_explicitly(tmp_path: Path) -> None:
    decision = ToolPermissionPolicy().evaluate(
        _settings(tmp_path),
        "broker.place_order",
        input_scope={"symbol_read"},
    )

    assert decision.allowed is False
    assert decision.reason_code == "unknown_tool"
    assert decision.denial_reasons == ["unknown tool: broker.place_order"]
    assert decision.requested_input_scope == ("symbol_read",)


def test_forbidden_input_scopes_are_denied_even_when_capability_is_enabled(
    tmp_path: Path,
) -> None:
    settings = _settings(
        tmp_path,
        capabilities={
            MARKET_BARS_FIXTURE,
            YFINANCE_MARKET_DATA,
            LONGBRIDGE_MARKET_DATA,
            ALPHA_VANTAGE_MARKET_DATA,
            SEC_EDGAR,
            NEWS_ARCHIVE_LOCAL,
        },
    )
    policy = ToolPermissionPolicy()

    forbidden_cases = {
        "rulepack_active_state_mutation": "rulepack active state mutation is not allowed",
        "active_universe_expand": "active universe expansion is not allowed",
        "unapproved_remote_service": "unapproved remote service invocation is not allowed",
        "broker_execution": "broker execution is not allowed",
        "broker_order": "broker order access is not allowed",
        "broker_account": "broker account access is not allowed",
        "simulation_account": "simulation account access is not allowed",
    }
    for forbidden_scope, reason in forbidden_cases.items():
        decision = policy.evaluate(
            settings,
            "fixture.market_data_lookup",
            input_scope={"market_data_read", forbidden_scope},
        )

        assert decision.allowed is False
        assert decision.reason_code == "forbidden_input_scope"
        assert reason in decision.denial_reasons


def test_forbidden_input_scope_is_denied_even_for_unknown_tool(tmp_path: Path) -> None:
    decision = ToolPermissionPolicy().evaluate(
        _settings(tmp_path),
        "broker.place_order",
        input_scope={"broker_execution"},
    )

    assert decision.allowed is False
    assert decision.reason_code == "forbidden_input_scope"
    assert decision.denial_reasons == ["broker execution is not allowed"]
    assert decision.required_capability is None
    assert decision.requested_input_scope == ("broker_execution",)


def test_unallowed_input_scope_is_denied_with_clear_reason(tmp_path: Path) -> None:
    settings = _settings(tmp_path, capabilities={NEWS_ARCHIVE_LOCAL})

    decision = ToolPermissionPolicy().evaluate(
        settings,
        "local.news_archive_lookup",
        input_scope={"news_archive_read", "filing_read"},
    )

    assert decision.allowed is False
    assert decision.reason_code == "input_scope_not_allowed"
    assert "input scope is not allowed for local.news_archive_lookup: filing_read" in (
        decision.denial_reasons
    )


def test_tool_call_audit_records_allowed_denied_completed_and_failed_events(
    tmp_path: Path,
) -> None:
    settings = _settings(
        tmp_path,
        capabilities={MARKET_BARS_FIXTURE, FILING_EVENTS_FIXTURE, NEWS_EVENTS_FIXTURE},
    )
    bootstrap_database(settings)
    audit = ToolCallAudit(settings)
    allowed = ToolPermissionPolicy().evaluate(
        settings,
        "fixture.market_data_lookup",
        input_scope={"market_data_read", "symbol_read"},
    )
    denied = ToolPermissionPolicy().evaluate(
        settings,
        "fixture.market_data_lookup",
        input_scope={"market_data_read", "broker_execution"},
    )

    audit.record_allowed(allowed, evidence_ids=["evidence:market:1"])
    audit.record_denied(denied)
    audit.record_completed(
        allowed,
        evidence_ids=["evidence:market:1", "evidence:market:2"],
        duration_ms=12,
    )
    audit.record_failed(allowed, error="provider timeout", duration_ms=34)

    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        rows = conn.execute(
            select(agent_events).order_by(agent_events.c.timestamp, agent_events.c.id)
        ).mappings().all()

    assert [row["event_type"] for row in rows] == [
        "tool_registry.call_allowed",
        "tool_registry.call_denied",
        "tool_registry.call_completed",
        "tool_registry.call_failed",
    ]
    assert {row["tool_name"] for row in rows} == {"fixture.market_data_lookup"}
    assert rows[0]["input_summary"]
    assert '"required_capability":"market_bars.fixture"' in rows[0]["input_summary"]
    assert '"requested_input_scope":["market_data_read","symbol_read"]' in rows[0][
        "input_summary"
    ]
    assert '"evidence_ids":["evidence:market:1","evidence:market:2"]' in rows[2][
        "output_summary"
    ]
    assert rows[3]["error"] == "provider timeout"
    assert "api_key" not in " ".join(str(row) for row in rows).lower()


def test_tool_call_audit_rejects_contradictory_decision_status(tmp_path: Path) -> None:
    settings = _settings(tmp_path, capabilities={MARKET_BARS_FIXTURE})
    bootstrap_database(settings)
    audit = ToolCallAudit(settings)
    allowed = ToolPermissionPolicy().evaluate(
        settings,
        "fixture.market_data_lookup",
        input_scope={"market_data_read", "symbol_read"},
    )
    denied = ToolPermissionPolicy().evaluate(
        settings,
        "fixture.market_data_lookup",
        input_scope={"broker_execution"},
    )

    assert allowed.allowed is True
    assert denied.allowed is False
    try:
        audit.record_allowed(denied)
    except ValueError as exc:
        assert str(exc) == "record_allowed requires an allowed decision"
    else:
        raise AssertionError("record_allowed accepted a denied decision")

    try:
        audit.record_denied(allowed)
    except ValueError as exc:
        assert str(exc) == "record_denied requires a denied decision"
    else:
        raise AssertionError("record_denied accepted an allowed decision")

    try:
        audit.record_completed(denied)
    except ValueError as exc:
        assert str(exc) == "record_completed requires an allowed decision"
    else:
        raise AssertionError("record_completed accepted a denied decision")

    try:
        audit.record_failed(denied, error="provider timeout")
    except ValueError as exc:
        assert str(exc) == "record_failed requires an allowed decision"
    else:
        raise AssertionError("record_failed accepted a denied decision")
