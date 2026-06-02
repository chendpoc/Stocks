# Summary-To-Opportunity Board

## Purpose

Phase 1 turns selected-day summary context into the first stable workbench object: a local opportunity observation list.

The goal is not to make the agent smarter yet. The goal is to make `apps/research-console` start from the same selected-day summary context every time and show a useful, bounded opportunity board before model calls or external tools enter the flow.

This module is the first implementation step under `project-docs/research-agent/trading-workbench-master-plan.md`.

## Boundaries

- Runtime surface: `apps/research-console`.
- Shared type surface: `packages/summary-core`.
- Source of truth: selected-day structured summary and local opportunity observation files.
- Browser payload: bounded opportunity rows, selected day, symbols, source basis, motivation, risk, score, and relative source paths.
- Server-only data: raw Markdown, raw structured JSON, absolute local paths, model prompts, headers, environment variables, and credentials.
- Tool boundary: no external market-data or news calls are required for the board.
- External tool policy remains unchanged: anything requiring market data still needs `RESEARCH_ENABLE_EXTERNAL_TOOLS=1` and policy authorization.
- Trading boundary: output is research-only. It must not produce buy/sell, long/short, position sizing, or order-style instructions.
- Daily pipeline boundary: do not modify daily summary generation, WeCom notification, Cloudflare publish, or VitePress public routing.

## Files

Expected implementation surfaces:

- `packages/summary-core/src/index.ts`
- `apps/research-console/lib/opportunity-board.ts`
- `apps/research-console/app/api/research/opportunities/route.ts`
- `apps/research-console/app/page.tsx`
- `apps/research-console/components/OpportunityBoard.tsx` if extraction becomes useful
- `apps/research-console/app/globals.css`
- `test/daily-summary-assets.test.mjs`

Expected documentation surfaces:

- `project-docs/research-agent/trading-workbench-master-plan.md`
- `project-docs/research-agent/tooling.md`
- This module development document.

## Expected Behavior

- The workbench lets the user choose or view the selected day used by the board.
- `/api/research/opportunities?day=YYYY-MM-DD` returns local opportunity rows without calling a model or external data provider.
- Rows are built from selected-day summary context and existing local scoring logic such as `score_opportunities`.
- Each row includes enough information to decide whether to open the detail view later: symbol, source day, motivation, local score, risk or invalidation hint, and source basis.
- Empty or missing selected-day data returns an explicit empty state instead of a failed page.
- Browser payloads stay bounded and do not leak raw local files.

## Tests

RED tests should be added before implementation:

```powershell
node --test --test-name-pattern "opportunity board selected day|local opportunity board" test\daily-summary-assets.test.mjs
```

Required green checks after implementation:

```powershell
npm run console:lint
npm run console:build
npm run test:summary
```

Recommended local UI check:

```powershell
npm run console:dev
```

Then open the workbench and verify the selected-day board displays meaningful opportunity rows or an explicit empty state.

## Agent Split

Low-decision tasks suitable for an implementation agent:

- Add or adjust pure data-shape tests for opportunity rows.
- Build bounded fixture data for selected-day opportunity rows.
- Review CSS copy and layout density after behavior is implemented.

Main-agent responsibilities:

- Decide the final row contract.
- Keep browser payloads bounded.
- Review every API and UI boundary for raw Markdown, raw JSON, absolute path, prompt, and secret leakage.
- Verify that `score_opportunities` remains research-only and does not become a trading instruction.
- Keep the active-agent count at 0-2 active agents and close completed agents before starting more work.

## Risks

- Overloading Phase 1 with model calls would blur the board with the agent flow. Keep it local first.
- Returning too much source context can leak raw Markdown or local audit data into the browser.
- Score rows can be misunderstood as recommendations. Copy must keep the research-only boundary visible.
- Duplicating context-loading logic can create drift between the Opportunity Board and AgentPanel.
- Letting this module touch daily publishing would re-open a stable production surface unnecessarily.
