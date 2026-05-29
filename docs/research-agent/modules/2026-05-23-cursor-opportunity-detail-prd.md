# PRD | Research Console | Cursor Research Inspector Modules | v1.0

Date: 2026-05-23

## Summary

This PRD splits Phase 2 Research Inspector work into measurable Cursor tasks.

The goal is to let Cursor add a bounded Research Inspector experience in `apps/research-console` after the Phase 1 opportunity board is readable. The detail view must make one selected opportunity explainable without exposing raw local records, calling external market tools, or turning research observations into trading instructions.

## Product Context

Authoritative planning docs:

- `docs/research-agent/trading-workbench-master-plan.md`
- `docs/research-agent/modules/2026-05-23-summary-to-opportunity-board.md`
- `docs/research-agent/modules/2026-05-23-cursor-opportunity-board-prd.md`

Phase 2 expands the board from "ranked local opportunity rows" to "one inspectable research object." The user should be able to select a row and see why it exists, what source summary motivated it, which evidence is still missing, and what would invalidate the idea.

## Global Constraints

- Runtime surface: `apps/research-console`.
- Shared type surface: `packages/summary-core`.
- Test surface: `test/daily-summary-assets.test.mjs`.
- Do not modify daily summary generation, `daily:publish`, WeCom delivery, Cloudflare deployment, VitePress routing, or GitHub Actions publishing.
- Do not call Longbridge, Alpha Vantage, yfinance, news search, Whop, model providers, or web search.
- Do not expose raw Markdown, raw structured JSON, absolute local paths, prompts, headers, environment variables, credentials, or provider raw payloads to the browser.
- All visible copy must remain research-only.
- Do not include buy, sell, long, short, entry, exit, stop loss, target price, position sizing, or order language.

## Task 1: Add ResearchInspector Component Shell

### Goal

Create a dedicated component for viewing one selected opportunity score.

### In Scope

- New component: `apps/research-console/components/research/ResearchInspector.tsx`
- Small CSS additions in `apps/research-console/app/globals.css`
- Type import from `@stock-summary/summary-core` if needed

### Out Of Scope

- Changing API route payloads.
- Adding route navigation.
- Adding persistent state.
- Adding external evidence tools.

### Acceptance Criteria

- Component accepts a bounded `InspectorView | null` produced from the selected opportunity row.
- Empty state says no opportunity is selected and tells the user to choose a row.
- Selected state displays symbol, rank, score, confidence, reason, source refs, and score components.
- Component shows a visible research-only boundary.
- Component contains no transaction instruction copy.
- Component source contains no references to `process.env`, raw Markdown, raw JSON, absolute paths, headers, or credentials.

### Verification

```powershell
node --test --test-name-pattern "ResearchInspector component|opportunity board selected" test\daily-summary-assets.test.mjs
npm run console:lint
npm run console:build
```

## Task 2: Wire Selection From ScoreRows To ResearchInspector

### Goal

Allow the user to select a score row and inspect it in the detail panel.

### In Scope

- `apps/research-console/components/OpportunityBoard.tsx`
- `apps/research-console/components/ScoreRows.tsx`
- `apps/research-console/components/research/ResearchInspector.tsx`
- Small CSS additions only if needed

### Out Of Scope

- New API route.
- URL query-state persistence.
- Browser local storage.
- Agent chat integration.
- External tool calls.

### Acceptance Criteria

- `ScoreRows` supports an optional `selectedSymbol` and `onSelect` callback.
- Clicking a row selects the opportunity.
- Keyboard activation on a focused row also selects it.
- Selected row has an accessible selected state.
- Changing the selected day clears stale selected opportunity state unless the same symbol still exists in the new board.
- The detail panel updates when a new row is selected.

### Verification

```powershell
node --test --test-name-pattern "OpportunityBoard selected detail|ScoreRows selection" test\daily-summary-assets.test.mjs
npm run console:lint
npm run console:build
```

## Task 3: Expose Evidence Needs In Detail View

### Goal

Show what evidence is needed before the opportunity can be studied further.

### In Scope

- Existing `board.reasoning.evidenceNeeds`
- Existing `board.reasoning.candidateOpportunities`
- `ResearchInspector` display logic
- Tests that prove evidence needs are summarized, not raw provider payloads

### Out Of Scope

- Running tools.
- Adding tool buttons.
- Fetching external data.
- Adding model calls.

### Acceptance Criteria

- Detail view shows matching evidence needs for the selected symbol when available.
- Evidence needs include kind, question, preferred tools, and required flag.
- If no symbol-specific evidence needs exist, show a compact "no explicit evidence need recorded" state.
- Candidate invalidation lines are shown when available for the selected symbol.
- The display remains bounded to a maximum of five evidence needs and five invalidation lines.
- No provider raw payloads or secret-shaped values are rendered.

### Verification

```powershell
node --test --test-name-pattern "ResearchInspector evidence needs|candidate invalidation" test\daily-summary-assets.test.mjs
npm run console:build
npm run test:summary
```

## Task 4: Add Detail Boundary Tests

### Goal

Lock the detail-view boundary before future evidence-tool and agent integrations.

### In Scope

- `test/daily-summary-assets.test.mjs`
- Existing component code only if tests expose a real boundary gap

### Out Of Scope

- UI redesign.
- Tool execution.
- Model provider integration.

### Acceptance Criteria

Tests prove:

- `ResearchInspector` exists and uses shared opportunity score types.
- `OpportunityBoard` owns local selected opportunity state.
- `ScoreRows` does not mutate data or call network APIs.
- Detail UI does not import daily summary publishing code.
- Detail UI does not include raw Markdown, raw JSON, absolute local paths, environment-variable reads, or credential-shaped fields.
- Detail UI keeps research-only language visible.

### Verification

```powershell
npm run test:summary
npm run console:build
```

## Recommended Cursor Execution Order

1. Task 1: Add `ResearchInspector` shell.
2. Task 2: Wire row selection into the detail panel.
3. Stop for main-agent review.
4. Task 3: Add evidence-needs and invalidation display.
5. Task 4: Add or tighten boundary tests.

Reason: Task 1 is isolated and type-oriented. Task 2 changes interaction state. Task 3 depends on the selected-symbol path being stable. Task 4 should lock the boundary after the UI shape is known.

## Copy-Paste Cursor Prompts

Use one prompt at a time.

### Cursor Prompt 1

```text
Implement Task 1 only from docs/research-agent/modules/2026-05-23-cursor-opportunity-detail-prd.md.

Goal: add apps/research-console/components/research/ResearchInspector.tsx as a bounded detail component for one selected InspectorView.

Hard boundaries:
- Do not modify daily summary generation, daily:publish, WeCom delivery, Cloudflare deployment, VitePress routing, or GitHub Actions publishing.
- Do not change API payloads or scoring logic.
- Do not call Longbridge, Alpha Vantage, yfinance, news search, Whop, model providers, or web search.
- Do not expose raw Markdown, raw JSON, absolute local paths, prompts, headers, environment variables, credentials, or provider raw payloads.
- Keep visible copy research-only. No buy/sell, long/short, entry/exit, stop loss, target price, position sizing, or order language.

Required verification:
- node --test --test-name-pattern "ResearchInspector component|opportunity board selected" test\daily-summary-assets.test.mjs
- npm run console:lint
- npm run console:build

Return the changed files, the commands you ran, and any failed command output.
```

### Cursor Prompt 2

```text
Implement Task 2 only from docs/research-agent/modules/2026-05-23-cursor-opportunity-detail-prd.md.

Goal: wire selection from ScoreRows to ResearchInspector in OpportunityBoard.

Hard boundaries:
- Work only in apps/research-console/components/OpportunityBoard.tsx, apps/research-console/components/ScoreRows.tsx, apps/research-console/components/research/ResearchInspector.tsx, tests, and small CSS if needed.
- Do not create a new API route.
- Do not add URL persistence or browser local storage.
- Do not call external market-data tools or model providers.
- Do not expose raw Markdown, raw JSON, absolute local paths, prompts, headers, environment variables, credentials, or provider raw payloads.

Required verification:
- node --test --test-name-pattern "OpportunityBoard selected detail|ScoreRows selection" test\daily-summary-assets.test.mjs
- npm run console:lint
- npm run console:build

Return the changed files, the commands you ran, and any failed command output.
```

### Cursor Prompt 3

```text
Implement Task 3 only from docs/research-agent/modules/2026-05-23-cursor-opportunity-detail-prd.md.

Goal: show matching evidence needs and invalidation lines in ResearchInspector for the selected symbol.

Hard boundaries:
- Use existing board.reasoning.evidenceNeeds and board.reasoning.candidateOpportunities only.
- Do not run tools, add tool buttons, fetch external data, or call a model.
- Bound the UI to at most five evidence needs and five invalidation lines.
- Do not render provider raw payloads or secret-shaped values.
- Keep visible copy research-only.

Required verification:
- node --test --test-name-pattern "ResearchInspector evidence needs|candidate invalidation" test\daily-summary-assets.test.mjs
- npm run console:build
- npm run test:summary

Return the changed files, the commands you ran, and any failed command output.
```

## Review Checklist For Main Agent

- Confirm Cursor did not touch daily summary production surfaces.
- Confirm no external tool or model call was introduced.
- Confirm browser-facing detail data remains bounded and sanitized.
- Confirm selected-day changes cannot leave stale detail content.
- Confirm all copy is research-only and avoids transaction instruction language.
- Run the stated verification commands before accepting the Cursor patch.

## Dependencies

- Existing `OpportunityBoard` selected-day state.
- Existing `ScoreRows` score display.
- Existing `OpportunityBoardScore`, `InspectorView`, `EvidenceNeed`, and `OpportunityReasoningResult` contracts/view models.
- Existing `/api/research/opportunities` response shape.

## Non-Goals

- No public deployment work.
- No VitePress changes.
- No WeCom or daily report changes.
- No tool execution.
- No model provider changes.
- No trading recommendations.
