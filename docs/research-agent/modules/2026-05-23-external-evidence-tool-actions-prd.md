# PRD | External Evidence Tool Actions | v1.0

Date: 2026-05-23

## Summary

This module turns the existing external evidence executors into usable research-console actions.

The current code already has executor-level support for Longbridge quotes, Alpha Vantage quotes, yfinance quote/history, and source-filtered news search. The missing product layer is a bounded UI/API path that lets the user request evidence for a selected opportunity without exposing raw provider payloads, credentials, local paths, or trading instructions.

## Product Goal

From the selected Research Inspector, the user can request supporting evidence:

- latest quote evidence through `yfinance_quote`, `alpha_vantage_quote`, or `longbridge_quote`;
- trend/history evidence through `yfinance_history`;
- news/fundamental evidence through `news_search`.

Every action remains opt-in, policy-gated, cached, sanitized, and research-only.

## User Value

The workbench should answer: "What external evidence can I attach to this observation before I trust it more?"

It must not answer: "What should I buy or sell?"

## Scope

In scope:

- A guarded research evidence API route.
- Research Inspector controls for evidence tools already suggested by `evidenceNeeds`.
- Tool execution through `authorizeResearchTool(...)` and `executeResearchTool(...)`.
- Bounded display of `AgentToolTrace` results in the UI.
- Readiness wording that treats "configured key" as insufficient without `RESEARCH_ENABLE_EXTERNAL_TOOLS=1`.
- Tests for route boundary, direct executor policy guard, readiness state, and UI wiring.

Out of scope:

- New providers.
- Automatic background scans.
- Brokerage integration.
- Public VitePress or Cloudflare deployment.
- Raw provider payload viewing.
- Any buy/sell/long/short/order language.

## Functional Requirements

### FR1: Evidence Action API

Add a local-only API route under `apps/research-console/app/api/research/evidence/route.ts`.

Behavior:

- Requires `isAuthorizedResearchConsoleRequest(...)`.
- Accepts JSON: `{ day, tool, symbol?, query?, period? }`.
- Rejects unregistered tools.
- Calls `authorizeResearchTool(tool)` before execution.
- Returns a blocked `AgentToolTrace` when policy blocks execution.
- Calls `executeResearchTool(...)` only for allowed registered tools.
- Returns only `AgentToolTrace` plus optional policy status; never raw provider payloads, env values, or filesystem paths.

### FR2: Research Inspector Tool Actions

`ResearchInspector` should render action buttons from matching `EvidenceNeed.preferredTools`.

Behavior:

- Quote needs can trigger quote tools for the selected symbol.
- History needs can trigger history tools for the selected symbol and default period.
- News/fundamental needs can trigger `news_search` with bounded query text.
- Results render as bounded cards below the selected Research Inspector.
- Blocked results stay visible so the user understands what env/policy is missing.

### FR3: Policy And Readiness Consistency

All external tools require `RESEARCH_ENABLE_EXTERNAL_TOOLS=1`.

Behavior:

- `listMarketDataSources(...)` reports `enabled=true` only when opt-in and provider requirements are present.
- `executeResearchTool(...)` has its own policy guard so direct calls cannot bypass `agent-kernel.ts`.
- Unknown tools return a blocked trace and do not fallback to `extract_watchlist`.

### FR4: Research-Only Boundary

Visible copy must frame outputs as evidence, not instructions.

Forbidden:

- buy, sell, long, short, entry, exit, stop loss, target price, position sizing, order.
- raw Markdown, raw structured JSON, raw provider payloads, absolute local paths, prompts, headers, env values, credentials.

## Target Files

- `apps/research-console/app/api/research/evidence/route.ts`
- `apps/research-console/components/research/ResearchInspector.tsx`
- `apps/research-console/components/OpportunityBoard.tsx`
- `apps/research-console/lib/agent-tools.ts`
- `apps/research-console/lib/market-data-sources.ts`
- `apps/research-console/app/globals.css`
- `test/daily-summary-assets.test.mjs`
- `test/market-data-sources.test.mjs`

## Test Plan

- `node --test --test-name-pattern "external evidence|alpha vantage|news search|yfinance quote|data sources" test\daily-summary-assets.test.mjs test\market-data-sources.test.mjs`
- `node --test test\market-data-sources.test.mjs`
- `npm run console:lint`
- `npm run console:build`
- `npm run test:summary`
- `git diff --check`

## Acceptance Criteria

- The selected Research Inspector exposes evidence actions for preferred tools.
- Evidence actions call a guarded API route, not provider endpoints directly.
- External tools are blocked without `RESEARCH_ENABLE_EXTERNAL_TOOLS=1`.
- Alpha Vantage and News Search are not marked ready merely because endpoint/key env exists.
- Direct `executeResearchTool(...)` calls cannot bypass policy.
- Results display as sanitized `AgentToolTrace` summaries only.
- Daily summary, notification, VitePress, Cloudflare, and GitHub Actions files are untouched.
