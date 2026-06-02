# 15 - Tool Registry / MCP Adapter

Source module: `01-agent-core-backend-prd.md` module 15.  
Phase: Phase 2 platform dependency, with minimal registry possible in Phase 1.  
Domain: Tool and ticket chain.

## Module Goal

Provide a single governed interface for market data, news, deep research, options, flow, trader memory, risk, learning, execution-disabled, and MCP-compatible tools.

Phase 0/1 uses `LocalToolAdapter` as the minimal implementation of the same contract. Phase 2 Tool Gateway replaces the adapter implementation, not the caller contract.

## Non-Goals

- Does not let modules call external APIs directly.
- Does not expose secrets to frontend.
- Does not enable execution tools by default.
- Does not skip audit logging for failed calls.

## Inputs And Outputs

Inputs:

- Tool name and typed input.
- Agent capability policy.
- Approval state.
- Rate-limit and cost policy.

Outputs:

- Tool output validated against output schema.
- Tool call log.
- Approval requirement when policy demands it.
- Error object with retryability classification.

## Core Tables And Schema

Reads:

- `agent_capabilities`.
- `approval_requests`.
- Secrets Management.

Writes:

- Tool call audit records, either in dedicated ToolCallLog storage or `agent_events`.
- `approval_requests` for gated tools.

Related:

- `agent_events` for tool-call lifecycle.

## API Contract

```text
GET  /api/tools
POST /api/tools/call
GET  /api/tools/calls
```

Call response:

```json
{
  "tool_call_id": "uuid",
  "status": "succeeded",
  "tool_name": "yfinance_historical_bars",
  "output": {},
  "approval_request_id": null,
  "duration_ms": 240
}
```

Local adapter interface:

```python
class LocalToolAdapter:
    def get_historical_bars(self, symbol: str, timeframe: str, start: str, end: str) -> dict: ...
    def get_market_snapshot(self, symbols: list[str]) -> dict: ...
    def get_news_events(self, symbols: list[str], start: str, end: str) -> dict: ...
    def get_filing_events(self, symbols: list[str], start: str, end: str) -> dict: ...
    def get_market_calendar(self, start: str, end: str) -> dict: ...
```

Adapter outputs must include:

```json
{
  "provider": "local_fixture",
  "as_of": "iso-8601",
  "data": {},
  "evidence_refs": [],
  "quality_flags": []
}
```

## Dependencies

- Requires Auth & Permission Service, Configuration Service, Secrets Management, Error Handling & Retry, and Audit Logging.
- Used by Market Context Builder, Market Snapshot Service, Market Brain, Opportunity Brain, Reflection Engine, and Runtime Orchestrator.
- Can trigger approval.
- Must respect Risk Engine for execution-class tools.

## Implementation Steps

1. Define tool registry entries with name, category, input schema, output schema, cost policy, permission level, and retry policy.
2. Implement `LocalToolAdapter` for historical bars, market snapshot fixtures, news or filing fixtures, and market calendar.
3. Route every call through permission, rate-limit, and approval checks.
4. Load secrets server-side only.
5. Validate tool output before returning to caller.
6. Write success, failure, skip, and approval-required logs.
7. Keep execution-class tools disabled unless future policy explicitly enables simulation-only behavior.

## Failure Modes

- Unknown tool: reject request.
- Input schema mismatch: reject before provider call.
- Permission denied: return approval or denied status.
- Rate limit exceeded: return retry-after metadata.
- Provider failure: classify as retryable or final and log.

## Acceptance Criteria

- Every tool has input and output schema.
- Tool failure does not crash the agent runtime.
- Tool calls have rate limits.
- High-risk or high-cost tools trigger approval.
- Secrets never appear in frontend payloads or ordinary logs.

## Test Scenarios

- List registered tools.
- Call low-cost historical bars tool successfully.
- Call the same historical bars contract through LocalToolAdapter.
- Call deep research tool and receive approval-required response.
- Send invalid input and verify provider is not called.
- Simulate provider timeout and verify retry classification.
