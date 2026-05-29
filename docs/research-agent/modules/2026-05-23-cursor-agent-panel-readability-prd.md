# PRD | Research Console | Cursor Agent Panel Readability Modules | v1.0

Date: 2026-05-23

## Summary

This PRD splits agent-panel readability and component-boundary work into measurable Cursor tasks.

The goal is to make `AgentPanel` readable and reviewable before adding more agent capabilities. The current agent panel already carries context status, run history, tool policy, evidence detail, reasoning plan, tool traces, and next-watch output. That makes it too large for low-risk iteration unless the visible copy and subcomponent boundaries are cleaned up first.

## Product Context

Authoritative planning docs:

- `docs/research-agent/trading-workbench-master-plan.md`
- `docs/research-agent/modules/2026-05-23-cursor-opportunity-board-prd.md`
- `docs/research-agent/modules/2026-05-23-cursor-opportunity-detail-prd.md`

This module supports Phase 4: Agent Research Flow. It does not add new reasoning behavior. It only makes the existing agent surface readable, bounded, and easier to review.

## Global Constraints

- Runtime surface: `apps/research-console`.
- Primary file: `apps/research-console/components/AgentPanel.tsx`.
- Optional new components may live under `apps/research-console/components/`.
- Test surface: `test/daily-summary-assets.test.mjs`.
- Do not modify daily summary generation, `daily:publish`, WeCom delivery, Cloudflare deployment, VitePress routing, GitHub Actions publishing, or API route behavior.
- Do not call Longbridge, Alpha Vantage, yfinance, news search, Whop, model providers, or web search.
- Do not expose raw Markdown, raw structured JSON, absolute local paths, prompts, headers, environment variables, credentials, or provider raw payloads to the browser.
- Do not include buy, sell, long, short, entry, exit, stop loss, target price, position sizing, or order language.
- All visible copy must keep the research-only boundary.

## Task 1: Fix AgentPanel Visible Copy

### Goal

Replace unreadable or garbled visible copy in `AgentPanel` with clear Chinese or concise English labels.

### In Scope

- `apps/research-console/components/AgentPanel.tsx`
- Tests that check source readability and research-only copy

### Out Of Scope

- Component extraction.
- API changes.
- Agent behavior changes.
- External tool execution changes.

### Acceptance Criteria

- Default user prompt is readable.
- Context status headings, metric labels, history labels, evidence labels, reply labels, reasoning labels, tool trace labels, policy labels, and next-watch labels are readable.
- Role labels for user and agent are readable.
- Evidence-detail empty state is readable.
- Research boundary copy is readable and visible.
- No common mojibake markers remain in `AgentPanel.tsx`.
- The file still compiles without changing runtime behavior.

### Verification

```powershell
node --test --test-name-pattern "AgentPanel readable copy|common mojibake" test\daily-summary-assets.test.mjs
npm run console:lint
npm run console:build
```

## Task 2: Extract AgentPanel Read-Only Subcomponents

### Goal

Reduce the review surface of `AgentPanel` by extracting read-only display sections without changing behavior.

### In Scope

Candidate components:

- `AgentContextStatus`
- `AgentRunHistory`
- `AgentToolPolicy`
- `AgentEvidenceDetail`

Cursor may choose a smaller extraction if it keeps the diff reviewable.

### Out Of Scope

- Changing fetch behavior.
- Changing request payloads.
- Changing agent response parsing.
- Adding state-management libraries.
- Adding new CSS frameworks.

### Acceptance Criteria

- `AgentPanel.tsx` keeps fetch/state orchestration.
- Extracted components are presentational and receive data via props.
- Extracted components do not call `fetch`.
- Extracted components do not read `process.env`.
- Extracted components do not import daily summary publishing scripts.
- Existing behavior and visible sections are preserved.

### Verification

```powershell
node --test --test-name-pattern "AgentPanel subcomponents|agent panel boundary" test\daily-summary-assets.test.mjs
npm run console:lint
npm run console:build
npm run test:summary
```

## Task 3: Improve Tool Trace And Evidence Detail Layout

### Goal

Make executed tools, blocked tools, and evidence details easier to scan without changing tool execution.

### In Scope

- Existing tool trace display.
- Existing blocked policy display.
- Existing evidence detail display.
- CSS in `apps/research-console/app/globals.css` if needed.

### Out Of Scope

- New tool calls.
- Tool retry buttons.
- Evidence refresh behavior.
- Provider prompt changes.

### Acceptance Criteria

- Executed tools show tool name, reason, and bounded result summary.
- Blocked tools are visually distinct from executed tools.
- `score_opportunities` traces still render score rows.
- `yfinance_history` traces still render metric cards.
- Evidence log path is shown only as a bounded local reference and not as an absolute filesystem path if a browser-facing payload offers a safer value.
- The section keeps a visible research-only boundary.

### Verification

```powershell
node --test --test-name-pattern "tool trace layout|evidence detail|blocked tool tags" test\daily-summary-assets.test.mjs
npm run console:build
npm run test:summary
```

## Task 4: Add AgentPanel Boundary Tests

### Goal

Lock agent-panel UI boundaries before future agent UX expansion.

### In Scope

- `test/daily-summary-assets.test.mjs`
- Existing component code only if a test reveals a real boundary gap

### Out Of Scope

- New UI functionality.
- New provider behavior.
- New tools.

### Acceptance Criteria

Tests prove:

- `AgentPanel` remains the state owner for message, reply, context status, run history, and tool readiness.
- Presentational subcomponents do not call network APIs.
- Agent panel source does not import daily publishing scripts.
- Agent panel source does not contain common mojibake markers.
- Agent panel source includes research-only boundary language.
- Agent panel source avoids transaction instruction language.

### Verification

```powershell
npm run test:summary
npm run console:build
```

## Recommended Cursor Execution Order

1. Task 1: Fix visible copy.
2. Stop for main-agent review.
3. Task 2: Extract read-only subcomponents.
4. Stop for main-agent review.
5. Task 3: Improve tool trace and evidence detail layout.
6. Task 4: Add or tighten boundary tests.

Reason: fixing copy first makes later diffs reviewable. Component extraction should happen before layout polish so review can distinguish structural movement from visual changes.

## Copy-Paste Cursor Prompts

Use one prompt at a time.

### Cursor Prompt 1

```text
Implement Task 1 only from docs/research-agent/modules/2026-05-23-cursor-agent-panel-readability-prd.md.

Goal: fix unreadable or garbled visible copy in apps/research-console/components/AgentPanel.tsx without changing runtime behavior.

Hard boundaries:
- Do not modify daily summary generation, daily:publish, WeCom delivery, Cloudflare deployment, VitePress routing, GitHub Actions publishing, or API route behavior.
- Do not extract components in this task.
- Do not change fetch behavior, request payloads, or agent response parsing.
- Do not call Longbridge, Alpha Vantage, yfinance, news search, Whop, model providers, or web search.
- Do not expose raw Markdown, raw JSON, absolute paths, prompts, headers, environment variables, credentials, or provider raw payloads.
- Keep visible copy research-only. No buy/sell, long/short, entry/exit, stop loss, target price, position sizing, or order language.

Required verification:
- node --test --test-name-pattern "AgentPanel readable copy|common mojibake" test\daily-summary-assets.test.mjs
- npm run console:lint
- npm run console:build

Return the changed files, the commands you ran, and any failed command output.
```

### Cursor Prompt 2

```text
Implement Task 2 only from docs/research-agent/modules/2026-05-23-cursor-agent-panel-readability-prd.md.

Goal: extract read-only display sections from AgentPanel into presentational components while preserving behavior.

Hard boundaries:
- AgentPanel must keep fetch/state orchestration.
- Extracted components must receive data via props.
- Extracted components must not call fetch or read process.env.
- Do not change request payloads, response parsing, or API routes.
- Do not modify daily summary, deployment, WeCom, VitePress, or GitHub Actions surfaces.
- Keep visible copy research-only and avoid transaction instruction language.

Required verification:
- node --test --test-name-pattern "AgentPanel subcomponents|agent panel boundary" test\daily-summary-assets.test.mjs
- npm run console:lint
- npm run console:build
- npm run test:summary

Return the changed files, the commands you ran, and any failed command output.
```

### Cursor Prompt 3

```text
Implement Task 3 only from docs/research-agent/modules/2026-05-23-cursor-agent-panel-readability-prd.md.

Goal: improve tool trace and evidence detail layout without changing tool execution.

Hard boundaries:
- Do not add new tool calls, retry buttons, evidence refresh behavior, or provider prompt changes.
- Preserve score_opportunities score-row rendering.
- Preserve yfinance_history metric-card rendering.
- Keep blocked tools visually distinct from executed tools.
- Do not expose raw provider payloads, secrets, prompts, headers, environment variables, or absolute local paths.
- Keep visible copy research-only and avoid transaction instruction language.

Required verification:
- node --test --test-name-pattern "tool trace layout|evidence detail|blocked tool tags" test\daily-summary-assets.test.mjs
- npm run console:build
- npm run test:summary

Return the changed files, the commands you ran, and any failed command output.
```

## Review Checklist For Main Agent

- Confirm Cursor did not touch daily summary production surfaces.
- Confirm no fetch behavior, API payload, provider prompt, or tool execution changed.
- Confirm no external data provider or model call was introduced.
- Confirm `AgentPanel` copy is readable and research-only.
- Confirm extracted components are presentational.
- Run the stated verification commands before accepting the Cursor patch.

## Dependencies

- Existing `AgentPanel` state and fetch behavior.
- Existing `parseAgentAnswerSections`.
- Existing `ScoreRows` rendering for `score_opportunities`.
- Existing `yfinance_history` trace parser and metric-card display.
- Existing tool readiness and evidence log APIs.

## Non-Goals

- No opportunity-detail implementation.
- No public deployment work.
- No VitePress changes.
- No WeCom or daily report changes.
- No tool execution changes.
- No model provider changes.
- No trading recommendations.
