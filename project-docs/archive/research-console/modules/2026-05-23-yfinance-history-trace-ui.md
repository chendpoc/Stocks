# YFinance History Trace UI

## Purpose

Render `yfinance_history` tool traces as a compact metrics card in the React agent panel. The history tool now returns structured evidence in a stable summary string, but the UI still shows it as plain text. A dedicated renderer makes the evidence readable: period, observations, close change, max drawdown, realized volatility, latest volume ratio, and average volume.

This is a display-only module. It does not change agent planning, tool policy, external calls, or cached evidence.

## Boundaries

- Input: existing `tool.result_summary` from `AgentReply.tool_trace`.
- Output: browser-only structured metric card.
- No new API fields.
- No raw history rows.
- No buy/sell/long/short wording.
- Preserve the plain-text fallback for unknown or malformed traces.

## Files

- `apps/research-console/components/AgentPanel.tsx`
- `apps/research-console/app/globals.css`
- `test/daily-summary-assets.test.mjs`
- `project-docs/plans/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`

## Tests

RED first:

```powershell
node --test --test-name-pattern "yfinance history traces as metric cards" test\daily-summary-assets.test.mjs
```

Expected red state:

- `AgentPanel` does not parse `yfinance_history`.
- No `.history-trace` styles exist.

GREEN verification:

```powershell
node --test --test-name-pattern "yfinance history traces as metric cards|score_opportunities traces" test\daily-summary-assets.test.mjs
npm run test:summary
npm run console:build
```

## Risks

- Over-parsing arbitrary trace text could make the UI brittle. Keep parsing scoped to the exact `key value` format emitted by the executor.
- The card should clarify evidence, not imply a trading signal.
