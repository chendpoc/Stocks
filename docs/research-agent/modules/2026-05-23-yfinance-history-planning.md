# YFinance History Planning

## Purpose

Make `yfinance_history` useful in the local deterministic research console without relying on a model to discover the tool. When the user explicitly asks for historical validation, trend, drawdown, volatility, or volume expansion, the local provider should add a bounded history snapshot for the first explicit ticker or admin watchlist symbol.

This keeps the workbench systematic: local summary first, scoring second, current quote when requested, and historical metrics when the question requires them.

## Boundaries

- Trigger only on explicit market-history intent. Generic opportunity explanation should remain local-only.
- Reuse the same policy gate: execution still requires `RESEARCH_ENABLE_EXTERNAL_TOOLS=1`.
- Do not add a tool call on later conversation rounds; multi-round provider behavior stays bounded.
- Do not emit trading instructions. Historical metrics are supporting evidence.

## Files

- `apps/research-console/lib/agent-provider.ts`
- `docs/research-agent/tooling.md`
- `docs/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`
- `test/daily-summary-assets.test.mjs`

## Tests

RED first:

```powershell
node --test --test-name-pattern "yfinance history planning" test\daily-summary-assets.test.mjs
```

Expected red state:

- Local provider does not yet plan `yfinance_history` for trend/drawdown/history requests.

GREEN verification:

```powershell
node --test --test-name-pattern "yfinance history planning|yfinance history|market data source" test\daily-summary-assets.test.mjs
npm run test:summary
npm run console:build
npm run pages:build
git diff --check
```

## Risks

- Over-triggering external tools from generic words like "机会" would make the console slower and less auditable.
- Under-triggering leaves the history tool available only to model-backed mode, weakening the local-first fallback.
- Quote and history are different evidence types; the provider should add history only when the request actually asks for historical structure.
