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
- `project-docs/research-agent/tooling.md`
- `project-docs/plans/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`
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

## Follow-up Fix 2026-05-23

Found a Chinese-intent regression in `apps/research-console/lib/agent-provider.ts`:

- The Chinese history keywords in `HISTORY_VALIDATION_PATTERN` were mojibake, so requests such as "趋势、回撤、波动、量能" did not plan `yfinance_history`.
- The Chinese market validation pattern included a broad standalone "验证", causing historical-validation questions to plan `yfinance_quote` instead.

Fix:

- Restore the Chinese history keywords: `历史`、`趋势`、`回撤`、`波动`、`量能`、`放量`、`承接`.
- Keep quote planning tied to quote/price/volume wording instead of generic "验证".
- Add a regression case for Chinese historical validation.
- Review fix: remove standalone `承接` as a trigger. Only market-specific phrases such as `量能承接`、`成交量承接`、`资金承接` should plan `yfinance_history`; connective wording such as "这个回答是否承接管理员意图" must stay local-only.

Verification:

```powershell
node --test --test-name-pattern "mojibake|yfinance history for explicit historical validation" test\daily-summary-assets.test.mjs
node --test --test-name-pattern "local provider plans yfinance only|local provider plans yfinance history" test\daily-summary-assets.test.mjs
```
