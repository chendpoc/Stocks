# YFinance History Tool

## Purpose

Add `yfinance_history` as an explicit opt-in evidence tool for the React research console. The tool computes a bounded historical snapshot for one symbol so the opportunity agent can reason from trend, volatility, volume expansion, and drawdown rather than only the latest quote.

This module moves the workbench closer to systematic opportunity observation: local summary theory first, then market evidence, then invalidation checks. It is not a trading signal generator.

## Boundaries

- Read: selected symbol, selected day, optional fixture payload, and local `.cache/research-tools/yfinance_history/`.
- Write: sanitized metric cache under `.cache/research-tools/yfinance_history/YYYY-MM-DD/SYMBOL-PERIOD.json`.
- Browser exposure: only bounded tool trace summaries and readiness status.
- External calls: allowed only when `RESEARCH_ENABLE_EXTERNAL_TOOLS=1`.
- Python role: bottom-layer data/calculation helper only. Node remains the orchestration/runtime policy layer.
- Trading boundary: return descriptive metrics only. Do not output buy, sell, long, short, position sizing, or order instructions.

## Files

- `scripts/research/yfinance_history_snapshot.py`
- `apps/research-console/lib/tool-policy.ts`
- `apps/research-console/lib/agent-tools.ts`
- `apps/research-console/lib/agent-provider.ts`
- `apps/research-console/lib/market-data-sources.ts`
- `test/daily-summary-assets.test.mjs`
- `requirements.txt`
- `project-docs/research-agent/tooling.md`
- `project-docs/plans/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`

## Tests

RED first:

```powershell
node --test --test-name-pattern "yfinance history" test\daily-summary-assets.test.mjs
```

Expected red state:

- `yfinance_history` is not registered as executable.
- No executor creates metrics or cache.
- No Python helper exists for fixture-driven history snapshots.

GREEN verification:

```powershell
node --test --test-name-pattern "yfinance history|market data source" test\daily-summary-assets.test.mjs
npm run console:lint
npm run test:summary
npm run console:build
npm run pages:build
git diff --check
```

## Agent Split

- Main agent owns implementation because this module touches policy, executor, Python helper, tests, and docs.
- One review agent may audit after GREEN for policy bypass, secret leakage, and trading-instruction creep.
- No parallel worker is needed; write scopes are coupled.

## Risks

- External-data risk: yfinance queries Yahoo Finance when fixture/cache is absent.
- Determinism risk: tests must use fixture JSON and must not call real Yahoo Finance.
- Policy risk: direct executor calls must still require `RESEARCH_ENABLE_EXTERNAL_TOOLS=1` before reading cache or running Python.
- Math risk: metrics must be simple, inspectable, and bounded: close change, range, max drawdown, realized volatility, average volume, and latest volume ratio.
- Product risk: metrics can support opportunity triage but must not become automated trading advice.
