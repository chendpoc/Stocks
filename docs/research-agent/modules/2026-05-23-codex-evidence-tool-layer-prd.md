# PRD | Codex Agent | Evidence Tool Layer | v1.0

Date: 2026-05-23

## Summary

This PRD defines the Phase 3 evidence-tool layer for the trading research workbench.

The goal is to make external evidence tools usable, auditable, cached, and policy-gated before the agent relies on them. This is a Codex-agent task, not a Cursor task, because it touches server-side tool policy, cache contracts, provider boundaries, and leak prevention.

## Product Context

Authoritative planning docs:

- `docs/research-agent/trading-workbench-master-plan.md`
- `docs/research-agent/tooling.md`
- `docs/research-agent/opportunity-reasoning.md`
- `docs/research-agent/modules/2026-05-23-summary-to-opportunity-board.md`

Existing local tools already support the base research chain:

- `load_structured_summary`
- `load_opportunity_observation`
- `extract_watchlist`
- `score_opportunities`

The evidence-tool layer expands beyond local context only when the user explicitly asks for validation or refresh, and only when policy allows it.

## User Value

The workbench should help answer: "What evidence is still missing before this opportunity observation deserves further attention?"

It should not answer: "What should I trade?"

## Global Constraints

- Runtime surface: `apps/research-console`.
- Shared type surface: `packages/summary-core`.
- Test surface: `test/daily-summary-assets.test.mjs`, `test/market-data-sources.test.mjs`, and targeted tests added by the agent.
- External tools remain disabled unless `RESEARCH_ENABLE_EXTERNAL_TOOLS=1`.
- Browser payloads must not include raw Markdown, raw structured JSON, provider raw payloads, absolute local paths, prompts, request headers, environment variables, credentials, or model scratchpads.
- Evidence is source material, not a direct trading instruction.
- Do not modify daily summary generation, `daily:publish`, WeCom delivery, VitePress routing, Cloudflare public deployment, GitHub Actions publishing, or notification scripts.

## In Scope

- Audit and harden existing evidence tools:
  - `yfinance_quote`
  - `yfinance_history`
  - `longbridge_quote`
  - `alpha_vantage_quote`
  - `news_search`
- Normalize evidence result contracts.
- Ensure every external tool result is cached as sanitized evidence only.
- Add source attribution and cache metadata that the agent can cite.
- Tighten policy and readiness reporting.
- Add tests proving provider raw payloads and secrets cannot reach browser-facing output.

## Out Of Scope

- New trading strategy generation.
- Automatic all-symbol scanning.
- Background scheduled evidence refresh.
- Public deployment.
- New paid data providers.
- Full news crawling.
- Raw chain-of-thought exposure.

## Functional Requirements

### FR1: Evidence Tool Contract Audit

Every executable evidence tool must return a bounded contract:

- `tool`
- `symbol` or `query`
- `source`
- `timestamp`
- `summary`
- `metrics` or `items`
- `cache_path`
- `provider_status`
- `warnings`

Acceptance criteria:

- Tool outputs are small enough to render in `AgentPanel`.
- Tool outputs can be stored in local evidence logs without leaking secrets.
- Tool outputs do not include raw provider responses.

### FR2: Sanitized Cache Contract

External evidence cache files must store only normalized evidence.

Acceptance criteria:

- Cache paths remain under `.cache/research-tools/`.
- Cache files do not contain `Authorization`, `Bearer`, `api_key`, `secret`, `access_token`, raw request headers, or provider debug fields.
- Historical price tools cache metrics, not raw row dumps.
- News search caches filtered snippets and source URLs only after hostname policy passes.

### FR3: Policy Gate Consistency

Tool execution must always pass through `authorizeResearchTool(...)`.

Acceptance criteria:

- UI actions cannot call tools directly.
- Agent provider planning cannot bypass policy.
- Disabled tools produce policy decisions that are visible to the user.
- `RESEARCH_ENABLE_EXTERNAL_TOOLS=1` is required for every external tool.

### FR4: Evidence Result Attribution

Agent-visible evidence must explain where it came from.

Acceptance criteria:

- Quote/history evidence names provider and timestamp.
- News evidence includes source host and URL, not provider raw metadata.
- Evidence summaries include enough context for review without sending users to raw cache files.

### FR5: Boundary Tests

Tests must lock the evidence boundary before more agent features depend on it.

Acceptance criteria:

- Tests prove raw provider payloads are not rendered by `AgentPanel`.
- Tests prove cache sanitization removes secret-shaped strings.
- Tests prove policy blocks external tools by default.
- Tests prove enabled external tools still write sanitized cache only.

## Target Files

Expected implementation surfaces:

- `apps/research-console/lib/agent-tools.ts`
- `apps/research-console/lib/tool-policy.ts`
- `apps/research-console/lib/market-data-sources.ts`
- `apps/research-console/lib/agent-evidence.ts`
- `apps/research-console/app/api/research/tools/route.ts`
- `apps/research-console/app/api/research/data-sources/route.ts`
- `packages/summary-core/src/index.ts`
- `test/daily-summary-assets.test.mjs`
- `test/market-data-sources.test.mjs`

Expected documentation surfaces:

- `docs/research-agent/tooling.md`
- This PRD.

## Suggested Codex-Agent Task Split

### Task 1: Evidence Contract Inventory

Read the target files and list each tool output shape. Add tests that fail if an external tool can return raw provider payload fields.

#### Evidence Contract Inventory

Current external evidence tools use `AgentToolTrace` as the browser-facing result boundary. Every tool returns:

- `name`
- `reason`
- `input`
- `result_summary`

The raw provider response must stop before this boundary. Cache files must also use normalized, provider-specific evidence shapes instead of full provider payloads.

| Tool | Input shape | Cache shape | Browser trace shape | Raw provider fields that must not survive |
| --- | --- | --- | --- | --- |
| `alpha_vantage_quote` | `{ symbol }` | `{ symbol, price, change, changePercent, latestTradingDay }` | `AgentToolTrace` with formatted quote summary | `Global Quote`, `Information`, `Note`, provider debug metadata, API key echoes |
| `longbridge_quote` | `{ symbol }` | `{ symbol, price, change, changePercent, volume, currency, marketStatus, timestamp }` | `AgentToolTrace` with formatted quote summary | Authorization echoes, app key/secret/token echoes, unknown provider metadata |
| `yfinance_quote` | `{ symbol }` | `{ symbol, regularMarketPrice, regularMarketChange, regularMarketChangePercent, regularMarketVolume, currency, exchange, shortName }` | `AgentToolTrace` with formatted quote summary | raw SDK objects, rows, errors containing secret-shaped text, arbitrary metadata |
| `yfinance_history` | `{ symbol, period }` | metric-only snapshot: observations, date span, close change, drawdown, volatility, average/latest volume, volume ratio | `AgentToolTrace` with formatted metric summary | historical rows, provider raw frames, fixture env names |
| `news_search` | `{ query }` | `{ results: [{ title, url, source, published_at, snippet }] }` after host allowlist filtering | `AgentToolTrace` with allowed-source snippets and URLs | request metadata, authorization echoes, disallowed hosts, raw provider article payloads |

Task 1 acceptance evidence:

- Tests must fail if `alpha_vantage_quote` caches the raw Alpha Vantage response object.
- Tests must fail if `yfinance_quote` caches arbitrary raw SDK fields.
- Existing tests must continue proving Longbridge, yfinance history, and news search remove provider-only or secret-shaped fields.

### Task 2: Sanitized Cache Hardening

Implement or tighten sanitizer helpers and cache write paths. Keep one sanitizer path shared by tool execution and run evidence logging.

### Task 3: Readiness And Policy Audit

Verify `data-sources` and `tools` routes expose readiness and policy summaries only. Add tests for disabled-by-default behavior.

### Task 4: Agent Evidence Display Compatibility

Confirm `AgentEvidenceDetail` can render evidence summaries without raw payload access. Add or adjust tests only for existing UI boundaries.

## Codex Agent Prompt

```text
Implement the next task from docs/research-agent/modules/2026-05-23-codex-evidence-tool-layer-prd.md.

Start by reading the PRD, docs/research-agent/tooling.md, apps/research-console/lib/agent-tools.ts, apps/research-console/lib/tool-policy.ts, apps/research-console/lib/agent-evidence.ts, and packages/summary-core/src/index.ts.

Hard boundaries:
- Do not modify daily summary generation, daily:publish, WeCom delivery, Cloudflare public deployment, VitePress routing, GitHub Actions publishing, or notification scripts.
- Do not add automatic external calls. External tools must remain opt-in through RESEARCH_ENABLE_EXTERNAL_TOOLS=1 and authorizeResearchTool(...).
- Do not expose raw Markdown, raw JSON, raw provider payloads, absolute local paths, prompts, headers, environment variables, credentials, or model scratchpads to browser-facing code.
- Keep all output research-only. Do not add buy/sell, long/short, entry/exit, target price, stop loss, position sizing, or order language.

Required verification:
- npm run console:lint
- npm run console:build
- npm run test:summary
- node --test test\market-data-sources.test.mjs

Return changed files, commands run, failed command output if any, and a boundary-risk note.
```

## Review Checklist For Main Agent

- Did the patch add or bypass a network call?
- Did every external tool path pass through policy?
- Did cache files remain sanitized and bounded?
- Did any browser route expose raw local data, absolute paths, prompts, headers, or secrets?
- Did visible copy remain research-only?
- Did verification commands actually run and pass?

## Risks

- A provider SDK can return much more than the UI needs. Store normalized evidence only.
- `news_search` can become an unbounded crawler if source policy is weak. Keep a source allowlist.
- Tool readiness can accidentally reveal whether secrets exist. Report capability status without exposing values.
- External evidence can look authoritative. The UI must keep it framed as support or contradiction evidence, not a decision.
