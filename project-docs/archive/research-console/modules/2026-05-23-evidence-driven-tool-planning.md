# Evidence Driven Tool Planning

## Goal

Use `OpportunityReasoningResult.evidenceNeeds` as the local agent's tool-planning source.

The previous slice made missing evidence visible, but the default provider still plans external checks mainly from message keywords. The next layer should translate structured evidence needs into concrete tool calls when the user asks to validate, refresh, or check evidence.

## Contract

- Keep the default local evidence chain:
  - `load_structured_summary`
  - `load_opportunity_observation`
  - `extract_watchlist`
  - `score_opportunities`
- Do not call external tools for a generic explanation request.
- When the user asks for evidence refresh or validation, map evidence needs to tool calls:
  - `quote` -> preferred quote tool, normally `yfinance_quote`
  - `history` -> `yfinance_history`
  - `news` -> `news_search`
  - `fundamental` -> `news_search` with a fundamental-focused query
- Prefer the explicit ticker in the user message; otherwise use the first evidence-need symbol.
- Keep external tool policy unchanged. Planning may request a tool, but `tool-policy.ts` still decides allowed vs blocked.
- Keep output research-only. No buy/sell/long/short language.

## Boundaries

- Planning only; no network calls in the provider.
- No new tool implementation in this module.
- No broad automatic all-symbol scan.
- No subagent. This touches the provider and tests tightly.

## Test Plan

- RED: local provider with `evidenceNeeds` and an evidence-refresh prompt should plan quote, history, news, and fundamental checks.
- RED: local provider with `evidenceNeeds` and a generic explanation prompt should not plan external tools.
- GREEN: implement the minimal mapping helper in `agent-provider.ts`.
- Run focused tests, `npm run console:lint`, `npm run test:summary`, and builds.

## Verification

- RED: `node --test --test-name-pattern "structured evidence needs|evidence needs|plans tools from structured evidence needs|plans yfinance only|plans yfinance history|blocked yfinance" test\daily-summary-assets.test.mjs test\opportunity-reasoning.test.mjs` failed before implementation because the provider returned only the local tool chain.
- GREEN: the same focused command passed after implementation.
- Full checks passed: `npm run console:lint`, `npm run test:summary`, `npm run console:build`, `npm run pages:build`.
- `git diff --check` reported only existing LF/CRLF warnings, with no whitespace errors.
