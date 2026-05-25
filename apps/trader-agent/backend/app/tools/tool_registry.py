from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import asdict, dataclass
from typing import Any

from app.core.config import Settings
from app.core.events import record_agent_event
from app.tools.alpha_vantage_adapter import ALPHA_VANTAGE_MARKET_DATA
from app.tools.local_adapter import (
    FILING_EVENTS_FIXTURE,
    MARKET_BARS_FIXTURE,
    NEWS_EVENTS_FIXTURE,
)
from app.tools.longbridge_adapter import LONGBRIDGE_MARKET_DATA
from app.tools.news_archive_adapter import NEWS_ARCHIVE_LOCAL
from app.tools.sec_adapter import SEC_EDGAR
from app.tools.yfinance_adapter import YFINANCE_MARKET_DATA

LOCAL_FILE_SEARCH = "local.file_search"
LOCAL_KNOWLEDGE_SEARCH = "local.knowledge_search"

EVENT_CALL_ALLOWED = "tool_registry.call_allowed"
EVENT_CALL_DENIED = "tool_registry.call_denied"
EVENT_CALL_COMPLETED = "tool_registry.call_completed"
EVENT_CALL_FAILED = "tool_registry.call_failed"

STATUS_ALLOWED = "allowed"
STATUS_DENIED = "denied"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"

FORBIDDEN_INPUT_SCOPE_REASONS = {
    "rulepack_active_state_mutation": "rulepack active state mutation is not allowed",
    "rulepack_mutation": "rulepack active state mutation is not allowed",
    "active_universe_expand": "active universe expansion is not allowed",
    "universe_expansion": "active universe expansion is not allowed",
    "unapproved_remote_service": "unapproved remote service invocation is not allowed",
    "remote_service_unapproved": "unapproved remote service invocation is not allowed",
    "broker_execution": "broker execution is not allowed",
    "broker_order": "broker order access is not allowed",
    "order": "broker order access is not allowed",
    "broker_account": "broker account access is not allowed",
    "account": "broker account access is not allowed",
    "simulation_account": "simulation account access is not allowed",
    "simulation": "simulation account access is not allowed",
}

SECRET_PATTERN = re.compile(
    r"(?i)(api[_-]?key|token|secret|password)\s*[:=]\s*[^,\s}\]]+"
)


@dataclass(frozen=True)
class ToolMetadata:
    name: str
    category: str
    provider: str
    required_capability: str
    cost_policy: str
    allowed_input_scope: tuple[str, ...]
    read_only: bool
    mcp_candidate: bool
    output_source_type: str
    permission_level: str
    required_input_scope: tuple[str, ...] = ()

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ToolPermissionDecision:
    allowed: bool
    status: str
    reason_code: str
    denial_reasons: list[str]
    tool_name: str
    required_capability: str | None
    provider: str | None
    cost_policy: str | None
    requested_input_scope: tuple[str, ...]
    allowed_input_scope: tuple[str, ...]
    required_input_scope: tuple[str, ...]
    read_only: bool | None
    mcp_candidate: bool | None
    output_source_type: str | None
    permission_level: str | None

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


class ToolRegistry:
    def __init__(self, tools: Iterable[ToolMetadata] | None = None) -> None:
        metadata = tuple(tools) if tools is not None else BUILTIN_TOOLS
        self._tools = {tool.name: tool for tool in metadata}

    def list(self) -> list[ToolMetadata]:
        return sorted(self._tools.values(), key=lambda tool: tool.name)

    def get(self, name: str) -> ToolMetadata | None:
        return self._tools.get(name)

    def require(self, name: str) -> ToolMetadata:
        metadata = self.get(name)
        if metadata is None:
            raise KeyError(f"Unknown tool: {name}")
        return metadata


class ToolPermissionPolicy:
    def __init__(self, registry: ToolRegistry | None = None) -> None:
        self.registry = registry or ToolRegistry()

    def evaluate(
        self,
        settings: Settings,
        tool_name: str,
        input_scope: str | Iterable[str] | None = None,
    ) -> ToolPermissionDecision:
        metadata = self.registry.get(tool_name)
        requested_scope = _normalize_scope(input_scope)
        forbidden_reasons = _forbidden_scope_reasons(requested_scope)
        if forbidden_reasons:
            return _denied_forbidden_scope(
                metadata,
                tool_name,
                requested_scope,
                forbidden_reasons,
            )

        if metadata is None:
            return _denied_unknown(tool_name, requested_scope)

        disallowed_scope = sorted(set(requested_scope) - set(metadata.allowed_input_scope))
        if disallowed_scope:
            return _decision(
                metadata,
                requested_scope=requested_scope,
                allowed=False,
                reason_code="input_scope_not_allowed",
                denial_reasons=[
                    f"input scope is not allowed for {tool_name}: {scope}"
                    for scope in disallowed_scope
                ],
            )

        missing_required_scope = sorted(set(metadata.required_input_scope) - set(requested_scope))
        if missing_required_scope:
            return _decision(
                metadata,
                requested_scope=requested_scope,
                allowed=False,
                reason_code="required_input_scope_missing",
                denial_reasons=[
                    f"required input scope is missing for {tool_name}: {scope}"
                    for scope in missing_required_scope
                ],
            )

        if not metadata.read_only:
            return _decision(
                metadata,
                requested_scope=requested_scope,
                allowed=False,
                reason_code="tool_not_read_only",
                denial_reasons=[f"tool is not read-only: {tool_name}"],
            )

        if metadata.required_capability not in settings.enabled_tool_capabilities:
            return _decision(
                metadata,
                requested_scope=requested_scope,
                allowed=False,
                reason_code="capability_disabled",
                denial_reasons=[f"missing capability: {metadata.required_capability}"],
            )

        return _decision(
            metadata,
            requested_scope=requested_scope,
            allowed=True,
            reason_code="allowed",
            denial_reasons=[],
        )


class ToolCallAudit:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def record_allowed(
        self,
        decision: ToolPermissionDecision,
        *,
        evidence_ids: Iterable[str] | None = None,
        run_id: str | None = None,
        task_id: str | None = None,
        symbol: str | None = None,
    ) -> str:
        if not decision.allowed:
            raise ValueError("record_allowed requires an allowed decision")
        return self._record(
            event_type=EVENT_CALL_ALLOWED,
            status=STATUS_ALLOWED,
            decision=decision,
            evidence_ids=evidence_ids,
            run_id=run_id,
            task_id=task_id,
            symbol=symbol,
        )

    def record_denied(
        self,
        decision: ToolPermissionDecision,
        *,
        evidence_ids: Iterable[str] | None = None,
        run_id: str | None = None,
        task_id: str | None = None,
        symbol: str | None = None,
    ) -> str:
        if decision.allowed:
            raise ValueError("record_denied requires a denied decision")
        return self._record(
            event_type=EVENT_CALL_DENIED,
            status=STATUS_DENIED,
            decision=decision,
            evidence_ids=evidence_ids,
            run_id=run_id,
            task_id=task_id,
            symbol=symbol,
        )

    def record_completed(
        self,
        decision: ToolPermissionDecision,
        *,
        evidence_ids: Iterable[str] | None = None,
        duration_ms: int | None = None,
        run_id: str | None = None,
        task_id: str | None = None,
        symbol: str | None = None,
    ) -> str:
        if not decision.allowed:
            raise ValueError("record_completed requires an allowed decision")
        return self._record(
            event_type=EVENT_CALL_COMPLETED,
            status=STATUS_COMPLETED,
            decision=decision,
            evidence_ids=evidence_ids,
            duration_ms=duration_ms,
            run_id=run_id,
            task_id=task_id,
            symbol=symbol,
        )

    def record_failed(
        self,
        decision: ToolPermissionDecision,
        *,
        error: str,
        evidence_ids: Iterable[str] | None = None,
        duration_ms: int | None = None,
        run_id: str | None = None,
        task_id: str | None = None,
        symbol: str | None = None,
    ) -> str:
        if not decision.allowed:
            raise ValueError("record_failed requires an allowed decision")
        return self._record(
            event_type=EVENT_CALL_FAILED,
            status=STATUS_FAILED,
            decision=decision,
            evidence_ids=evidence_ids,
            duration_ms=duration_ms,
            run_id=run_id,
            task_id=task_id,
            symbol=symbol,
            error=_redact_text(error),
        )

    def _record(
        self,
        *,
        event_type: str,
        status: str,
        decision: ToolPermissionDecision,
        evidence_ids: Iterable[str] | None,
        run_id: str | None = None,
        task_id: str | None = None,
        symbol: str | None = None,
        duration_ms: int | None = None,
        error: str | None = None,
    ) -> str:
        output_summary: dict[str, Any] = {
            "permission": decision.as_dict(),
            "evidence_ids": sorted(str(evidence_id) for evidence_id in (evidence_ids or [])),
        }
        return record_agent_event(
            self.settings,
            event_type=event_type,
            status=status,
            title=f"Tool call {status}: {decision.tool_name}",
            summary=_summary_text(decision),
            input_summary=decision.as_dict(),
            output_summary=output_summary,
            run_id=run_id,
            task_id=task_id,
            symbol=symbol,
            tool_name=decision.tool_name,
            duration_ms=duration_ms,
            error=error,
        )


def _decision(
    metadata: ToolMetadata,
    *,
    requested_scope: tuple[str, ...],
    allowed: bool,
    reason_code: str,
    denial_reasons: list[str],
) -> ToolPermissionDecision:
    return ToolPermissionDecision(
        allowed=allowed,
        status=STATUS_ALLOWED if allowed else STATUS_DENIED,
        reason_code=reason_code,
        denial_reasons=denial_reasons,
        tool_name=metadata.name,
        required_capability=metadata.required_capability,
        provider=metadata.provider,
        cost_policy=metadata.cost_policy,
        requested_input_scope=requested_scope,
        allowed_input_scope=metadata.allowed_input_scope,
        required_input_scope=metadata.required_input_scope,
        read_only=metadata.read_only,
        mcp_candidate=metadata.mcp_candidate,
        output_source_type=metadata.output_source_type,
        permission_level=metadata.permission_level,
    )


def _denied_unknown(
    tool_name: str,
    requested_scope: tuple[str, ...],
) -> ToolPermissionDecision:
    return ToolPermissionDecision(
        allowed=False,
        status=STATUS_DENIED,
        reason_code="unknown_tool",
        denial_reasons=[f"unknown tool: {tool_name}"],
        tool_name=tool_name,
        required_capability=None,
        provider=None,
        cost_policy=None,
        requested_input_scope=requested_scope,
        allowed_input_scope=(),
        required_input_scope=(),
        read_only=None,
        mcp_candidate=None,
        output_source_type=None,
        permission_level=None,
    )


def _denied_forbidden_scope(
    metadata: ToolMetadata | None,
    tool_name: str,
    requested_scope: tuple[str, ...],
    forbidden_reasons: list[str],
) -> ToolPermissionDecision:
    if metadata is not None:
        return _decision(
            metadata,
            requested_scope=requested_scope,
            allowed=False,
            reason_code="forbidden_input_scope",
            denial_reasons=forbidden_reasons,
        )
    return ToolPermissionDecision(
        allowed=False,
        status=STATUS_DENIED,
        reason_code="forbidden_input_scope",
        denial_reasons=forbidden_reasons,
        tool_name=tool_name,
        required_capability=None,
        provider=None,
        cost_policy=None,
        requested_input_scope=requested_scope,
        allowed_input_scope=(),
        required_input_scope=(),
        read_only=None,
        mcp_candidate=None,
        output_source_type=None,
        permission_level=None,
    )


def _normalize_scope(input_scope: str | Iterable[str] | None) -> tuple[str, ...]:
    if input_scope is None:
        return ()
    if isinstance(input_scope, str):
        raw_items = [input_scope]
    else:
        raw_items = list(input_scope)
    return tuple(sorted({str(item).strip().lower() for item in raw_items if str(item).strip()}))


def _forbidden_scope_reasons(scope: tuple[str, ...]) -> list[str]:
    reasons: list[str] = []
    for item in scope:
        reason = FORBIDDEN_INPUT_SCOPE_REASONS.get(item)
        if reason is not None and reason not in reasons:
            reasons.append(reason)
    return reasons


def _summary_text(decision: ToolPermissionDecision) -> str:
    if decision.allowed:
        return (
            f"{decision.tool_name} allowed by capability "
            f"{decision.required_capability} for provider {decision.provider}."
        )
    return f"{decision.tool_name} denied: {'; '.join(decision.denial_reasons)}"


def _redact_text(text: str) -> str:
    return SECRET_PATTERN.sub(r"\1=<redacted>", text)


BUILTIN_TOOLS = (
    ToolMetadata(
        name="local.file_search",
        category="local_search",
        provider="local.filesystem",
        required_capability=LOCAL_FILE_SEARCH,
        cost_policy="free_local",
        allowed_input_scope=(
            "documentation_read",
            "local_file_read",
            "path_filter_read",
            "repo_read",
        ),
        read_only=True,
        mcp_candidate=True,
        output_source_type="file",
        permission_level="read_only",
    ),
    ToolMetadata(
        name="local.knowledge_search",
        category="local_search",
        provider="local.knowledge_index",
        required_capability=LOCAL_KNOWLEDGE_SEARCH,
        cost_policy="free_local",
        allowed_input_scope=(
            "date_range_read",
            "evidence_read",
            "local_knowledge_read",
            "symbol_read",
        ),
        read_only=True,
        mcp_candidate=True,
        output_source_type="knowledge",
        permission_level="read_only",
    ),
    ToolMetadata(
        name="fixture.market_data_lookup",
        category="market_data",
        provider="fixture.market_bars",
        required_capability=MARKET_BARS_FIXTURE,
        cost_policy="free_fixture",
        allowed_input_scope=("date_range_read", "market_data_read", "symbol_read"),
        read_only=True,
        mcp_candidate=True,
        output_source_type="market_bar",
        permission_level="read_only",
    ),
    ToolMetadata(
        name="fixture.filing_lookup",
        category="filing",
        provider="fixture.filing_events",
        required_capability=FILING_EVENTS_FIXTURE,
        cost_policy="free_fixture",
        allowed_input_scope=("date_range_read", "filing_read", "symbol_read"),
        read_only=True,
        mcp_candidate=True,
        output_source_type="filing",
        permission_level="read_only",
    ),
    ToolMetadata(
        name="fixture.news_events_lookup",
        category="news",
        provider="fixture.news_events",
        required_capability=NEWS_EVENTS_FIXTURE,
        cost_policy="free_fixture",
        allowed_input_scope=("date_range_read", "news_archive_read", "symbol_read"),
        read_only=True,
        mcp_candidate=True,
        output_source_type="news",
        permission_level="read_only",
    ),
    ToolMetadata(
        name="sec.filing_lookup",
        category="filing",
        provider="sec.edgar",
        required_capability=SEC_EDGAR,
        cost_policy="free_manual",
        allowed_input_scope=("date_range_read", "filing_read", "symbol_read"),
        read_only=True,
        mcp_candidate=True,
        output_source_type="filing",
        permission_level="read_only",
    ),
    ToolMetadata(
        name="local.news_archive_lookup",
        category="news",
        provider="local.news_archive",
        required_capability=NEWS_ARCHIVE_LOCAL,
        cost_policy="free_local",
        allowed_input_scope=("date_range_read", "news_archive_read", "symbol_read"),
        read_only=True,
        mcp_candidate=True,
        output_source_type="news",
        permission_level="read_only",
    ),
    ToolMetadata(
        name="yfinance.market_data_lookup",
        category="market_data",
        provider="yfinance",
        required_capability=YFINANCE_MARKET_DATA,
        cost_policy="free_manual",
        allowed_input_scope=(
            "approved_remote_market_data_read",
            "date_range_read",
            "market_data_read",
            "symbol_read",
        ),
        read_only=True,
        mcp_candidate=True,
        output_source_type="market_bar",
        permission_level="read_only",
        required_input_scope=("approved_remote_market_data_read",),
    ),
    ToolMetadata(
        name="longbridge.market_data_lookup",
        category="market_data",
        provider="longbridge.market_data",
        required_capability=LONGBRIDGE_MARKET_DATA,
        cost_policy="manual_entitlement",
        allowed_input_scope=(
            "approved_remote_market_data_read",
            "market_data_read",
            "symbol_read",
        ),
        read_only=True,
        mcp_candidate=True,
        output_source_type="market_bar",
        permission_level="read_only",
        required_input_scope=("approved_remote_market_data_read",),
    ),
    ToolMetadata(
        name="alpha_vantage.market_data_lookup",
        category="market_data",
        provider="alpha_vantage",
        required_capability=ALPHA_VANTAGE_MARKET_DATA,
        cost_policy="free_manual_key",
        allowed_input_scope=(
            "approved_remote_market_data_read",
            "date_range_read",
            "market_data_read",
            "symbol_read",
        ),
        read_only=True,
        mcp_candidate=True,
        output_source_type="market_bar",
        permission_level="read_only",
        required_input_scope=("approved_remote_market_data_read",),
    ),
)
