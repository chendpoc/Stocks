# PRD | Research Console | Cursor Opportunity Board Modules | v1.0

Date: 2026-05-23

## Summary

This PRD splits the Phase 1 and early Phase 2 research-console work into measurable Cursor tasks.

The goal is to let Cursor implement low-decision UI and test improvements without changing the daily report pipeline, external market-data policy, or agent architecture. Each task must be independently reviewable, bounded to the React research console, and verifiable with explicit commands.

## Product Context

The current goal is the trading research workbench defined in `docs/research-agent/trading-workbench-master-plan.md`.

The current Phase 1 module is `docs/research-agent/modules/2026-05-23-summary-to-opportunity-board.md`.

Cursor should improve the visible Opportunity Board experience first:

- selected-day summary context;
- local opportunity board rows;
- readable research-only UI;
- better empty states;
- clear score-row information density;
- a first detail view for a selected opportunity.

## Global Constraints

- Runtime surface: `apps/research-console`.
- Shared type surface: `packages/summary-core` only when a task explicitly needs type alignment.
- Test surface: `test/daily-summary-assets.test.mjs`.
- Do not modify daily summary generation, `daily:publish`, WeCom delivery, Cloudflare deployment, VitePress routing, or GitHub Actions publishing.
- Do not call external market-data tools from these tasks.
- Do not add Longbridge, Alpha Vantage, yfinance, or news search behavior in this PRD.
- Do not expose raw Markdown, raw JSON, absolute local paths, model prompts, headers, environment variables, or credentials to the browser.
- No buy/sell, long/short, position sizing, order, or direct trading instruction language.
- All visible opportunity language must keep a research-only boundary.

## Task 1: Fix Garbled Chinese Copy In OpportunityBoard

### Goal

Replace garbled Chinese UI copy in `OpportunityBoard` with readable Chinese while preserving the existing data flow.

### In Scope

- `apps/research-console/components/OpportunityBoard.tsx`
- `apps/research-console/app/globals.css` only if spacing or layout needs a small adjustment.
- Optional test assertions for readable labels.

### Out Of Scope

- API payload changes.
- Scoring changes.
- New components.
- External tools.

### Acceptance Criteria

- The UI no longer contains garbled strings such as `褰撴棩`, `涓婁笅鏂`, or similar mojibake.
- The board title, date label, context status, admin-symbol metric, admin-core metric, risk metric, missing-data note, and research-only note are readable.
- English section labels may remain where they improve scanning.
- The research-only warning remains visible.

### Verification

```powershell
npm run console:lint
npm run console:build
npm run test:summary
```

## Task 2: Improve OpportunityBoard Empty State

### Goal

Make missing or empty selected-day data understandable instead of showing only zero counts or a partial state.

### In Scope

- `apps/research-console/components/OpportunityBoard.tsx`
- `test/daily-summary-assets.test.mjs`
- CSS only if needed for a compact empty-state block.

### Out Of Scope

- Backend context-loading redesign.
- New API route.
- External tool calls.

### Acceptance Criteria

- If `status.missing.length > 0`, show a readable note that the selected day is missing structured summary or opportunity context.
- If `scores.length === 0` and no request error exists, show `暂无可评分机会` or equivalent clear empty state.
- Empty state keeps the selected day visible.
- Empty state does not expose raw Markdown, raw JSON, absolute paths, or local audit content.
- Errors and empty states remain visually distinct.

### Verification

```powershell
node --test --test-name-pattern "OpportunityBoard empty state|local opportunity board" test\daily-summary-assets.test.mjs
npm run console:build
npm run test:summary
```

## Task 3: Improve Score Row Information Density

### Goal

Make each opportunity row useful as a research object, not just a score number.

### In Scope

- `apps/research-console/components/ScoreRows.tsx`
- `apps/research-console/app/globals.css`
- Existing `OpportunityBoardScore` fields only unless tests prove the current contract is insufficient.

### Out Of Scope

- Rebuilding the scoring algorithm.
- Adding a detail panel.
- Calling external market-data tools.

### Acceptance Criteria

Each row displays:

- symbol;
- rank;
- score;
- confidence;
- reason;
- thesis alignment;
- trigger clarity;
- evidence quality;
- invalidation clarity;
- liquidity risk.

The row must also show or preserve a research-only boundary and must not include buy/sell language.

### Verification

```powershell
node --test --test-name-pattern "score row information density|score_opportunities traces" test\daily-summary-assets.test.mjs
npm run console:lint
npm run console:build
```

## Task 4: Add Research Inspector Draft

### Goal

Let the user select one opportunity row and inspect a compact detail panel on the same page.

### In Scope

- `apps/research-console/components/OpportunityBoard.tsx`
- `apps/research-console/components/ScoreRows.tsx`
- Optional new component: `apps/research-console/components/research/ResearchInspector.tsx`
- `apps/research-console/app/globals.css`
- Tests in `test/daily-summary-assets.test.mjs`

### Out Of Scope

- New route.
- Persistent state.
- Agent chat integration.
- External tool calls.
- Data schema expansion unless required by existing fields being inaccessible.

### Acceptance Criteria

- Clicking an opportunity row selects it.
- The detail panel shows symbol, sourceRefs, reason, score components, confidence, and research-only warning.
- Selecting another row updates the detail panel.
- No selected row shows `选择一个机会查看研究详情` or equivalent clear placeholder.
- Detail panel does not expose raw Markdown, raw JSON, absolute paths, prompts, headers, or secrets.

### Verification

```powershell
node --test --test-name-pattern "Research Inspector|opportunity board selected" test\daily-summary-assets.test.mjs
npm run console:lint
npm run console:build
npm run test:summary
```

## Task 5: Add Phase 1 Boundary Tests

### Goal

Lock the Phase 1 boundary so later work does not accidentally mix the local opportunity board with external tools, raw source data, or daily publishing.

### In Scope

- `test/daily-summary-assets.test.mjs`
- Existing product code only if a test exposes a real boundary gap.

### Out Of Scope

- UI redesign.
- New APIs.
- New scoring behavior.

### Acceptance Criteria

Tests prove:

- `OpportunityBoard` includes selected-day input.
- `/api/research/opportunities` uses `loadOpportunityBoard`.
- `loadOpportunityBoard` does not call external tools or market-data providers.
- Browser-facing payload contracts do not include `rawMarkdown`, `rawJson`, `absolutePath`, `process.env`, or credential-shaped fields.
- UI includes a research-only boundary.
- Daily publishing scripts do not import or call research-console code.

### Verification

```powershell
npm run test:summary
npm run console:build
```

## Recommended Cursor Execution Order

1. Task 1: Fix garbled Chinese copy.
2. Task 2: Improve empty state.
3. Task 3: Improve score row information density.
4. Stop for main-agent review.
5. Task 4: Add Research Inspector draft.
6. Task 5: Add Phase 1 boundary tests.

Reason: Tasks 1-3 are low-decision, UI-bound, and easy to review. Task 4 introduces interaction state, so it should happen after the board copy and row density are stable. Task 5 can either be implemented by Cursor or kept for the main agent if it changes architectural test boundaries.

## Copy-Paste Cursor Prompts

Use one prompt at a time. Do not ask Cursor to complete the whole PRD in one run.

### Cursor Prompt 1

```text
Implement Task 1 only from docs/research-agent/modules/2026-05-23-cursor-opportunity-board-prd.md.

Goal: fix garbled Chinese copy in apps/research-console/components/OpportunityBoard.tsx while preserving the existing data flow.

Hard boundaries:
- Do not modify daily summary generation, daily:publish, WeCom delivery, Cloudflare deployment, VitePress routing, or GitHub Actions publishing.
- Do not change API payloads, scoring logic, or external tools.
- Do not expose raw Markdown, raw JSON, absolute paths, prompts, headers, environment variables, or credentials.
- Keep the visible copy research-only. No buy/sell, long/short, position sizing, or order language.

Required verification:
- npm run console:lint
- npm run console:build
- npm run test:summary

Return the changed files, the commands you ran, and any failed command output.
```

### Cursor Prompt 2

```text
Implement Task 2 only from docs/research-agent/modules/2026-05-23-cursor-opportunity-board-prd.md.

Goal: improve OpportunityBoard empty states for missing selected-day context and zero local opportunity rows.

Hard boundaries:
- Work only in apps/research-console/components/OpportunityBoard.tsx, test/daily-summary-assets.test.mjs, and small CSS if needed.
- Do not redesign backend context loading or create a new API route.
- Do not call external market-data tools.
- Do not expose raw Markdown, raw JSON, absolute paths, prompts, headers, environment variables, or credentials.
- Keep the selected day visible in every empty state.

Required verification:
- node --test --test-name-pattern "OpportunityBoard empty state|local opportunity board" test\daily-summary-assets.test.mjs
- npm run console:build
- npm run test:summary

Return the changed files, the commands you ran, and any failed command output.
```

### Cursor Prompt 3

```text
Implement Task 3 only from docs/research-agent/modules/2026-05-23-cursor-opportunity-board-prd.md.

Goal: improve ScoreRows information density using existing OpportunityBoardScore fields.

Hard boundaries:
- Work only in apps/research-console/components/ScoreRows.tsx, apps/research-console/app/globals.css, and tests if needed.
- Do not rebuild the scoring algorithm.
- Do not add Research Inspector behavior in this task.
- Do not call external market-data tools.
- Keep row copy research-only. No buy/sell, long/short, position sizing, or order language.

Required verification:
- node --test --test-name-pattern "score row information density|score_opportunities traces" test\daily-summary-assets.test.mjs
- npm run console:lint
- npm run console:build

Return the changed files, the commands you ran, and any failed command output.
```

## Review Checklist For Main Agent

- Confirm Cursor did not touch daily summary production surfaces.
- Confirm no external market-data calls were introduced.
- Confirm no raw local source data is exposed to browser payloads.
- Confirm copy remains research-only and avoids transaction language.
- Run the stated verification commands before accepting the Cursor patch.

## Dependencies

- Existing `OpportunityBoard`, `ScoreRows`, and `loadOpportunityBoard`.
- Existing `OpportunityBoardScore` and `OpportunityBoardSummary` contracts in `packages/summary-core`.
- Existing selected-day state in `ResearchWorkspace`.
- Existing local scoring behavior through `score_opportunities` and `buildOpportunityBoardScores`.

## Non-Goals

- No public deployment work.
- No VitePress changes.
- No WeCom or daily report changes.
- No model provider changes.
- No Longbridge, Alpha Vantage, yfinance, or news search expansion.
