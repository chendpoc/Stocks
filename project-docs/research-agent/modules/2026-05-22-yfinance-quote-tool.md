# yfinance Quote Tool Module

## Purpose

Add the first no-secret market quote evidence tool for `research-console`.

The tool gives the agent a bounded way to answer user requests such as "check latest price", "validate volume", or "look at market context" without turning the daily-summary pipeline into a live trading system. It is an evidence tool only.

## Boundaries

- Runtime surface: `apps/research-console`.
- External behavior: local Python `yfinance` can query Yahoo Finance only after `RESEARCH_ENABLE_EXTERNAL_TOOLS=1`.
- Secret behavior: no API key is required and no provider metadata should be cached.
- Cache behavior: write sanitized JSON to `.cache/research-tools/yfinance_quote/YYYY-MM-DD/SYMBOL.json`.
- Browser behavior: tool traces may show compact quote summaries, but raw provider payloads stay server-side.
- Trading boundary: output must remain research observation. It must not produce buy, sell, long, short, or position-sizing instructions.

## Files

Implementation and tests:

- `apps/research-console/lib/agent-tools.ts`
- `apps/research-console/lib/tool-policy.ts`
- `apps/research-console/lib/agent-provider.ts`
- `apps/research-console/lib/market-data-sources.ts`
- `test/daily-summary-assets.test.mjs`
- `test/market-data-sources.test.mjs`

Documentation:

- `project-docs/research-agent/tooling.md`
- `project-docs/plans/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`

## Tests

Focused commands:

```powershell
node --test --test-name-pattern "yfinance quote" test\daily-summary-assets.test.mjs
node --test --test-name-pattern "yfinance becomes" test\market-data-sources.test.mjs
```

Integration gates:

```powershell
npm run console:lint
npm run console:build
npm run test:summary
npm run pages:build
```

## Completed Behavior

- `authorizeResearchTool("yfinance_quote")` blocks unless `RESEARCH_ENABLE_EXTERNAL_TOOLS=1`.
- `executeResearchTool({ name: "yfinance_quote" })` normalizes ticker input, executes local Python or fixture input, formats a compact quote summary, and caches sanitized values.
- `/api/research/data-sources` reports yfinance as planned or configured without leaking secrets.
- `/api/research/tools` reports yfinance readiness through the existing tool policy surface.

## Next Slice: Agent Market Validation Flow

Status: completed on 2026-05-22.

The default local provider plans `yfinance_quote` when the user explicitly asks for market validation.

Implemented behavior:

- If the message asks for price, quote, volume, market validation, latest行情, 价格, 成交量, or 验证, the default provider should add `yfinance_quote` for the first explicit ticker or admin watchlist symbol.
- If the message is only a generic explanation request, the default provider keeps the existing local-only tool plan.
- If external tools are not opted in, the kernel records `yfinance_quote:blocked` and skips execution. Planning expresses the evidence need; policy decides whether the evidence tool can run.

Agent task split:

- Explorer reviewed the integration boundary and confirmed the key gap was default provider intent-aware planning.
- Main agent added focused tests, implemented minimal provider helper functions in `agent-provider.ts`, and verified the targeted behavior.

## Risks

- Symbol extraction must prefer admin watchlist context, not random prose tokens.
- External-tool opt-in must remain explicit.
- Cached quote summaries must not be used as trading instructions.
- Deterministic local-provider behavior should stay simple enough to test without network access.
