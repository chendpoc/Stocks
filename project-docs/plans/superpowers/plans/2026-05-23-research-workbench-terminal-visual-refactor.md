# Research Workbench Terminal Visual Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `apps/research-console` into an institutional dark research cockpit where the first screen prioritizes opportunity-pool scanning, with a right-side research inspector and auxiliary Agent actions.

**Architecture:** Preserve the existing local-first API and evidence contracts. Change only the React presentation layer, CSS system, source guard tests, and module documentation. Keep the Opportunity Board as the primary surface, make `OpportunityDetail` act as the research inspector, and reduce `AgentPanel` visual weight without changing its runtime behavior.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS modules via `app/globals.css`, Node test runner, pnpm workspace.

---

## Source Baseline

Approved design baseline:

- `project-docs/research-agent/design/2026-05-23-research-workbench-front-end-design.md`
- `project-docs/research-agent/design/2026-05-23-research-workbench-terminal-mockup.png`

Current implementation surface:

- `apps/research-console/app/page.tsx`
- `apps/research-console/components/ResearchWorkspace.tsx`
- `apps/research-console/components/OpportunityBoard.tsx`
- `apps/research-console/components/OpportunityDetail.tsx`
- `apps/research-console/components/ScoreRows.tsx`
- `apps/research-console/components/AgentPanel.tsx`
- `apps/research-console/app/globals.css`
- `test/daily-summary-assets.test.mjs`

Hard boundaries:

- Do not modify daily summary generation, `daily:publish`, WeCom delivery, Cloudflare public deploy, VitePress routing, or GitHub Actions publishing.
- Do not add model calls, market-data calls, or new external tools.
- Do not expose raw Markdown, raw JSON, absolute local paths, prompts, headers, environment variables, credentials, or provider raw payloads to browser code.
- Do not add buy, sell, long, short, entry, exit, stop loss, target price, position sizing, order, or broker execution language.

## File Structure

- Modify `test/daily-summary-assets.test.mjs`
  - Adds source-level guard tests for the approved visual direction and trading-boundary copy.
- Create `project-docs/research-agent/modules/2026-05-23-research-workbench-terminal-visual-refactor.md`
  - Records module purpose, boundaries, files, tests, agent split, and visual risks.
- Modify `apps/research-console/app/globals.css`
  - Adds terminal theme tokens and rewrites cockpit, opportunity board, inspector, and Agent panel presentation.
- Modify `apps/research-console/components/ResearchWorkspace.tsx`
  - Makes the Opportunity Board the default first-screen task and changes the top-level grid to a cockpit layout.
- Modify `apps/research-console/components/OpportunityBoard.tsx`
  - Turns the central surface into an Opportunity Blotter and places `OpportunityDetail` beside the row list.
- Modify `apps/research-console/components/ScoreRows.tsx`
  - Preserves selection behavior while rendering rows as dense blotter rows.
- Modify `apps/research-console/components/OpportunityDetail.tsx`
  - Renames presentation semantics to Research Inspector and emphasizes missing evidence and invalidation.
- Modify `apps/research-console/components/AgentPanel.tsx`
  - Keeps behavior intact while demoting non-critical sections into compact auxiliary groups.

## Task 1: Lock The Visual Direction With Source Tests

**Files:**

- Modify: `test/daily-summary-assets.test.mjs`
- Create: `project-docs/research-agent/modules/2026-05-23-research-workbench-terminal-visual-refactor.md`

- [ ] **Step 1: Add the module document**

Create `project-docs/research-agent/modules/2026-05-23-research-workbench-terminal-visual-refactor.md`:

```markdown
# Research Workbench Terminal Visual Refactor

Date: 2026-05-23

## Purpose

Refactor the local React research console into an institutional dark research cockpit.

The first-screen task is fast opportunity-pool scanning. The selected row opens a research inspector for hypothesis, missing evidence, invalidation, and next checks. The Agent remains auxiliary.

## Boundaries

- Runtime surface: `apps/research-console`.
- Browser payload shape must remain bounded and sanitized.
- No new API routes, model calls, external data calls, or tool-policy bypasses.
- No public VitePress, Cloudflare, WeCom, daily summary, or GitHub Actions changes.
- Visible copy remains research-only.

## Files

- `apps/research-console/app/globals.css`
- `apps/research-console/components/ResearchWorkspace.tsx`
- `apps/research-console/components/OpportunityBoard.tsx`
- `apps/research-console/components/OpportunityDetail.tsx`
- `apps/research-console/components/ScoreRows.tsx`
- `apps/research-console/components/AgentPanel.tsx`
- `test/daily-summary-assets.test.mjs`

## Tests

RED:

```powershell
node --test --test-name-pattern "terminal visual refactor" test\daily-summary-assets.test.mjs
```

GREEN:

```powershell
node --test --test-name-pattern "terminal visual refactor|opportunity board accessibility|AgentPanel exposes keyboard" test\daily-summary-assets.test.mjs
npm run console:build
```

Full visual release check after implementation:

```powershell
npm run console:lint
npm run console:build
npm run test:summary
git diff --check
```

## Agent Split

No subagent is required for Task 1. A later low-decision UI polishing pass may be delegated after the main agent verifies source boundaries.

## Risks

- Dark terminal UI can imply trade execution. The implementation must keep research-only copy visible.
- Dense rows can become unreadable. The implementation must use stable row heights and clear status hierarchy.
- AgentPanel can dominate the page. The implementation must make it auxiliary.
```

- [ ] **Step 2: Add the failing source guard test**

Append this test near the existing research-console source tests in `test/daily-summary-assets.test.mjs`:

```js
test("terminal visual refactor keeps opportunity blotter primary and Agent auxiliary", async () => {
  const styles = await readFile("apps/research-console/app/globals.css", "utf8");
  const workspace = await readFile("apps/research-console/components/ResearchWorkspace.tsx", "utf8");
  const board = await readFile("apps/research-console/components/OpportunityBoard.tsx", "utf8");
  const detail = await readFile("apps/research-console/components/OpportunityDetail.tsx", "utf8");
  const agent = await readFile("apps/research-console/components/AgentPanel.tsx", "utf8");
  const moduleDoc = await readFile(
    "project-docs/research-agent/modules/2026-05-23-research-workbench-terminal-visual-refactor.md",
    "utf8",
  );
  const combined = [workspace, board, detail, agent].join("\n");

  assert.match(moduleDoc, /institutional dark research cockpit/i);
  assert.match(moduleDoc, /first-screen task is fast opportunity-pool scanning/i);
  assert.match(styles, /--terminal-bg:/);
  assert.match(styles, /--terminal-panel:/);
  assert.match(styles, /--terminal-warning:/);
  assert.match(styles, /\.opportunity-blotter/);
  assert.match(styles, /\.research-inspector/);
  assert.match(styles, /\.agent-panel-auxiliary/);
  assert.match(workspace, /activeTab.*opportunities/);
  assert.match(board, /Opportunity Blotter|机会池/);
  assert.match(board, /opportunity-blotter/);
  assert.match(detail, /Research Inspector|研究详情/);
  assert.match(detail, /research-inspector/);
  assert.match(agent, /agent-panel-auxiliary/);
  assert.match(combined, /仅供研究观察|研究边界/);
  assert.doesNotMatch(combined, /\b(buy|sell|long|short|stop loss|target price|position sizing|order ticket)\b/i);
  assert.doesNotMatch(combined, /买入|卖出|做多|做空|开仓|平仓|止损|目标价|仓位|下单/);
  assert.doesNotMatch(combined, /daily:publish|notify-card|deploy-cloudflare|scripts\/daily-summary/);
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```powershell
node --test --test-name-pattern "terminal visual refactor" test\daily-summary-assets.test.mjs
```

Expected: FAIL because `--terminal-bg`, `.opportunity-blotter`, `.research-inspector`, and `.agent-panel-auxiliary` do not exist yet.

- [ ] **Step 4: Git checkpoint if explicitly approved**

This project does not mutate Git unless the user explicitly asks for Git mutation. If approved, run:

```powershell
git add test/daily-summary-assets.test.mjs project-docs/research-agent/modules/2026-05-23-research-workbench-terminal-visual-refactor.md
git commit -m "test: lock research workbench terminal visual baseline"
```

## Task 2: Add Terminal Theme Tokens And Cockpit Layout CSS

**Files:**

- Modify: `apps/research-console/app/globals.css`

- [ ] **Step 1: Replace the root theme tokens**

In `apps/research-console/app/globals.css`, replace the current `:root` block with:

```css
:root {
  color-scheme: dark;
  --terminal-bg: #070b10;
  --terminal-bg-soft: #0b1118;
  --terminal-panel: #101821;
  --terminal-panel-raised: #151f29;
  --terminal-panel-muted: #0d141c;
  --terminal-line: #26333f;
  --terminal-line-strong: #344654;
  --terminal-text: #e9f0f2;
  --terminal-text-soft: #b6c5cc;
  --terminal-muted: #81939c;
  --terminal-faint: #526671;
  --terminal-accent: #35d08d;
  --terminal-accent-strong: #13a873;
  --terminal-cyan: #2ab8c9;
  --terminal-warning: #d99a2b;
  --terminal-danger: #e45f5f;
  --terminal-blue: #4b8cff;
  --terminal-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
  --background: var(--terminal-bg);
  --surface: var(--terminal-panel);
  --surface-muted: var(--terminal-panel-muted);
  --surface-strong: #05080c;
  --ink: var(--terminal-text);
  --ink-soft: var(--terminal-text-soft);
  --muted: var(--terminal-muted);
  --line: var(--terminal-line);
  --line-strong: var(--terminal-line-strong);
  --accent: var(--terminal-accent);
  --accent-strong: var(--terminal-accent-strong);
  --amber: var(--terminal-warning);
  --warning: var(--terminal-warning);
  --danger: var(--terminal-danger);
  --panel-shadow: var(--terminal-shadow);
  font-family:
    "Microsoft YaHei", "PingFang SC", "Segoe UI", ui-sans-serif, system-ui,
    -apple-system, BlinkMacSystemFont, sans-serif;
}
```

- [ ] **Step 2: Replace the body background**

Replace the current `html, body` rule with:

```css
html,
body {
  min-height: 100%;
  margin: 0;
  background:
    radial-gradient(circle at 12% -8%, rgba(42, 184, 201, 0.16), transparent 32%),
    linear-gradient(180deg, #091019 0%, var(--terminal-bg) 52%, #04070a 100%);
  color: var(--ink);
}
```

- [ ] **Step 3: Update the app shell spacing**

Replace `.console-shell`, `.workspace`, `.app-titlebar`, and `.shell-meta-grid` blocks with:

```css
.console-shell {
  min-height: 100vh;
  padding: 16px;
}

.workspace {
  width: min(1880px, 100%);
  margin: 0 auto;
}

.app-titlebar {
  align-items: flex-end;
  display: flex;
  gap: 18px;
  justify-content: space-between;
  margin-bottom: 12px;
}

.app-titlebar h1 {
  margin: 0;
  font-size: clamp(28px, 3vw, 42px);
  letter-spacing: 0;
  line-height: 1;
}

.shell-meta-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(3, minmax(118px, 1fr));
  margin: 0;
}

.shell-meta-grid div {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(16, 24, 33, 0.88);
  padding: 9px 11px;
}

.shell-meta-grid dt {
  color: var(--terminal-faint);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
}

.shell-meta-grid dd {
  color: var(--terminal-text);
  font-size: 13px;
  font-weight: 800;
  margin: 3px 0 0;
}
```

- [ ] **Step 4: Run focused test and verify still RED**

Run:

```powershell
node --test --test-name-pattern "terminal visual refactor" test\daily-summary-assets.test.mjs
```

Expected: still FAIL because `.opportunity-blotter`, `.research-inspector`, and `.agent-panel-auxiliary` are not implemented yet. The CSS token assertions should now pass.

- [ ] **Step 5: Git checkpoint if explicitly approved**

```powershell
git add apps/research-console/app/globals.css
git commit -m "style: add terminal theme tokens for research cockpit"
```

## Task 3: Make The Opportunity Board The Primary Blotter Surface

**Files:**

- Modify: `apps/research-console/components/ResearchWorkspace.tsx`
- Modify: `apps/research-console/components/OpportunityBoard.tsx`
- Modify: `apps/research-console/components/ScoreRows.tsx`
- Modify: `apps/research-console/app/globals.css`

- [ ] **Step 1: Set the default tab to opportunities**

In `ResearchMainTabs`, change:

```ts
const [activeTab, setActiveTab] = useState<ResearchTab>("overview");
```

to:

```ts
const [activeTab, setActiveTab] = useState<ResearchTab>("opportunities");
```

- [ ] **Step 2: Rename the board heading and add blotter class**

In `OpportunityBoard.tsx`, replace the opening section:

```tsx
<section aria-label="当日机会面板" className="opportunity-board">
```

with:

```tsx
<section aria-label="机会池" className="opportunity-board opportunity-blotter">
```

Replace the heading block:

```tsx
<p className="eyebrow">Opportunity Board</p>
<h2>当日机会面板</h2>
```

with:

```tsx
<p className="eyebrow">Opportunity Blotter</p>
<h2>机会池</h2>
```

- [ ] **Step 3: Wrap score rows and detail in a two-column workbench grid**

In `OpportunityBoard.tsx`, replace the current score/detail render block:

```tsx
{loading ? (
  <p className="score-empty">加载评分中…</p>
) : error ? null : showEmptyScores ? (
  <p className="score-empty opportunity-board-empty">暂无可评分机会。</p>
) : (
  <ScoreRows
    rows={board?.scores ?? []}
    selectedSymbol={selectedSymbol}
    onSelect={setSelectedSymbol}
  />
)}

<OpportunityDetail
  day={day}
  score={selectedScore}
  evidenceNeeds={board?.reasoning.evidenceNeeds}
  candidateOpportunities={board?.reasoning.candidateOpportunities}
  onRunEvidenceTool={runEvidenceTool}
/>
```

with:

```tsx
<div className="opportunity-workbench-grid">
  <div className="opportunity-blotter-list">
    {loading ? (
      <p className="score-empty">加载评分中…</p>
    ) : error ? null : showEmptyScores ? (
      <p className="score-empty opportunity-board-empty">暂无可评分机会。</p>
    ) : (
      <ScoreRows
        rows={board?.scores ?? []}
        selectedSymbol={selectedSymbol}
        onSelect={setSelectedSymbol}
      />
    )}
  </div>

  <OpportunityDetail
    day={day}
    score={selectedScore}
    evidenceNeeds={board?.reasoning.evidenceNeeds}
    candidateOpportunities={board?.reasoning.candidateOpportunities}
    onRunEvidenceTool={runEvidenceTool}
  />
</div>
```

- [ ] **Step 4: Add blotter row semantics in `ScoreRows`**

In `ScoreRows.tsx`, replace the outer class name:

```tsx
className="score-trace"
```

with:

```tsx
className="score-trace score-blotter"
```

Inside each row, replace:

```tsx
const rowClassName = selected ? "score-row score-row-selected" : "score-row";
```

with:

```tsx
const rowClassName = selected ? "score-row score-row-selected score-blotter-row" : "score-row score-blotter-row";
```

- [ ] **Step 5: Add blotter CSS**

Append to `apps/research-console/app/globals.css` near the opportunity board section:

```css
.opportunity-workbench-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.65fr);
  margin-top: 14px;
}

.opportunity-blotter-list {
  min-width: 0;
}

.score-blotter {
  display: grid;
  gap: 7px;
}

.score-blotter-row {
  align-items: stretch;
  background: rgba(13, 20, 28, 0.92);
  border: 1px solid var(--line);
  border-left: 3px solid transparent;
  border-radius: 7px;
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(118px, 0.7fr) minmax(0, 1.4fr);
  min-height: 82px;
  padding: 9px 10px;
}

.score-row-selected.score-blotter-row {
  background: rgba(19, 168, 115, 0.11);
  border-color: rgba(53, 208, 141, 0.46);
  border-left-color: var(--terminal-accent);
  box-shadow: inset 0 0 0 1px rgba(53, 208, 141, 0.16);
}

.score-meta strong,
.score-pill,
.score-components dd,
.history-trace-head strong {
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
}

.score-pill {
  background: rgba(53, 208, 141, 0.14);
  border: 1px solid rgba(53, 208, 141, 0.28);
  color: var(--terminal-accent);
}

.score-components {
  grid-template-columns: repeat(5, minmax(86px, 1fr));
}
```

- [ ] **Step 6: Run focused tests**

Run:

```powershell
node --test --test-name-pattern "terminal visual refactor|opportunity board accessibility" test\daily-summary-assets.test.mjs
```

Expected: `terminal visual refactor` still FAILS only on `.research-inspector` and `.agent-panel-auxiliary`; existing opportunity-board accessibility tests must still pass.

- [ ] **Step 7: Git checkpoint if explicitly approved**

```powershell
git add apps/research-console/components/ResearchWorkspace.tsx apps/research-console/components/OpportunityBoard.tsx apps/research-console/components/ScoreRows.tsx apps/research-console/app/globals.css
git commit -m "style: make opportunity board the primary blotter"
```

## Task 4: Convert Opportunity Detail Into Research Inspector

**Files:**

- Modify: `apps/research-console/components/OpportunityDetail.tsx`
- Modify: `apps/research-console/app/globals.css`

- [ ] **Step 1: Add inspector class names**

In `OpportunityDetail.tsx`, replace the empty state opening:

```tsx
className="opportunity-detail opportunity-detail-empty"
```

with:

```tsx
className="opportunity-detail research-inspector opportunity-detail-empty"
```

Replace the non-empty section opening:

```tsx
className="opportunity-detail"
```

with:

```tsx
className="opportunity-detail research-inspector"
```

- [ ] **Step 2: Rename the inspector eyebrow**

Replace:

```tsx
<p className="eyebrow">Research Detail</p>
```

with:

```tsx
<p className="eyebrow">Research Inspector</p>
```

Replace:

```tsx
<h4>证据需求</h4>
```

with:

```tsx
<h4>证据缺口</h4>
```

- [ ] **Step 3: Add stronger inspector CSS**

Append near the existing opportunity detail CSS:

```css
.research-inspector {
  align-self: start;
  background: linear-gradient(180deg, rgba(21, 31, 41, 0.98), rgba(13, 20, 28, 0.98));
  border-color: var(--terminal-line-strong);
  box-shadow: var(--terminal-shadow);
  margin-top: 0;
}

.research-inspector .opportunity-detail-head {
  border-bottom: 1px solid var(--line);
  padding-bottom: 10px;
}

.research-inspector .opportunity-detail-section {
  background: rgba(7, 11, 16, 0.42);
  border: 1px solid rgba(52, 70, 84, 0.66);
  border-radius: 8px;
  padding: 10px;
}

.research-inspector .opportunity-detail-needs span,
.research-inspector .opportunity-detail-needs em,
.research-inspector .evidence-action-button {
  letter-spacing: 0;
}

.research-inspector .opportunity-detail-evidence-required,
.research-inspector .opportunity-detail-needs em {
  background: rgba(217, 154, 43, 0.14);
  color: #f3c478;
}

.research-inspector .opportunity-detail-boundary {
  background: rgba(217, 154, 43, 0.1);
  border-color: rgba(217, 154, 43, 0.24);
}
```

- [ ] **Step 4: Run focused test and verify Agent remains the only failing assertion**

Run:

```powershell
node --test --test-name-pattern "terminal visual refactor" test\daily-summary-assets.test.mjs
```

Expected: FAIL only because `.agent-panel-auxiliary` is missing.

- [ ] **Step 5: Git checkpoint if explicitly approved**

```powershell
git add apps/research-console/components/OpportunityDetail.tsx apps/research-console/app/globals.css
git commit -m "style: promote opportunity detail to research inspector"
```

## Task 5: Demote AgentPanel To Auxiliary Layer

**Files:**

- Modify: `apps/research-console/components/AgentPanel.tsx`
- Modify: `apps/research-console/app/globals.css`

- [ ] **Step 1: Add auxiliary class**

In `AgentPanel.tsx`, replace:

```tsx
<aside className="agent-panel" aria-label="机会观察 Agent">
```

with:

```tsx
<aside className="agent-panel agent-panel-auxiliary" aria-label="机会观察 Agent">
```

- [ ] **Step 2: Wrap lower-priority Agent sections in `details`**

Replace these standalone calls:

```tsx
<AgentContextStatus
  loading={contextLoading}
  error={contextError}
  status={contextStatus}
/>

<AgentRunHistory error={runError} history={runHistory} />

<AgentToolPolicy error={toolError} tools={toolReadiness} />
```

with:

```tsx
<details className="agent-auxiliary-section">
  <summary>上下文状态</summary>
  <AgentContextStatus
    loading={contextLoading}
    error={contextError}
    status={contextStatus}
  />
</details>

<details className="agent-auxiliary-section">
  <summary>运行记录</summary>
  <AgentRunHistory error={runError} history={runHistory} />
</details>

<details className="agent-auxiliary-section">
  <summary>工具状态</summary>
  <AgentToolPolicy error={toolError} tools={toolReadiness} />
</details>
```

- [ ] **Step 3: Add auxiliary CSS**

Append near the Agent CSS:

```css
.agent-panel-auxiliary {
  background: rgba(10, 16, 23, 0.96);
  max-height: calc(100vh - 32px);
}

.agent-panel-auxiliary .agent-header {
  border-bottom: 1px solid var(--line);
  margin-bottom: 12px;
  padding-bottom: 10px;
}

.agent-panel-auxiliary .agent-form {
  background: rgba(21, 31, 41, 0.7);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px;
}

.agent-auxiliary-section {
  border-top: 1px solid var(--line);
  margin-top: 12px;
  padding-top: 10px;
}

.agent-auxiliary-section summary {
  color: var(--terminal-text-soft);
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  list-style: none;
}

.agent-auxiliary-section summary::-webkit-details-marker {
  display: none;
}

.agent-auxiliary-section summary::after {
  color: var(--terminal-faint);
  content: " +";
}

.agent-auxiliary-section[open] summary::after {
  content: " -";
}

.agent-auxiliary-section .context-status,
.agent-auxiliary-section .agent-run-list,
.agent-auxiliary-section .tool-readiness {
  border-top: 0;
  margin-top: 10px;
  padding-top: 0;
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
node --test --test-name-pattern "terminal visual refactor|AgentPanel exposes keyboard" test\daily-summary-assets.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Git checkpoint if explicitly approved**

```powershell
git add apps/research-console/components/AgentPanel.tsx apps/research-console/app/globals.css
git commit -m "style: make agent panel auxiliary"
```

## Task 6: Responsive Layout And Final Visual QA

**Files:**

- Modify: `apps/research-console/app/globals.css`
- Optional modify only if visual QA finds defects:
  - `apps/research-console/components/ResearchWorkspace.tsx`
  - `apps/research-console/components/OpportunityBoard.tsx`

- [ ] **Step 1: Add responsive cockpit rules**

Replace the existing `@media (max-width: 1240px)` block with:

```css
@media (max-width: 1240px) {
  .research-cockpit-grid {
    grid-template-columns: minmax(230px, 290px) minmax(0, 1fr);
  }

  .agent-panel {
    grid-column: 1 / -1;
    max-height: none;
    position: relative;
    top: 0;
  }

  .opportunity-workbench-grid {
    grid-template-columns: 1fr;
  }

  .research-inspector {
    position: relative;
  }
}
```

Replace the existing `@media (max-width: 720px)` block with:

```css
@media (max-width: 720px) {
  .console-shell {
    padding: 12px;
  }

  .app-titlebar {
    align-items: flex-start;
    flex-direction: column;
  }

  .shell-meta-grid,
  .research-cockpit-grid,
  .overview-grid,
  .market-grid,
  .opportunity-workbench-grid {
    grid-template-columns: 1fr;
    width: 100%;
  }

  .research-cockpit-topbar,
  .opportunity-board-head,
  .workspace-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .cockpit-status-strip {
    justify-content: flex-start;
  }

  .opportunity-board-head label,
  .opportunity-metrics {
    width: 100%;
  }

  .opportunity-metrics,
  .session-stat-grid,
  .score-components,
  .agent-evidence-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .score-blotter-row {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 2: Run full code checks**

Run:

```powershell
npm run console:lint
npm run console:build
npm run test:summary
git diff --check
```

Expected: all commands PASS.

- [ ] **Step 3: Start local console server**

Run:

```powershell
npm run console:dev
```

Expected: the dev server prints a local URL for `apps/research-console`, commonly `http://localhost:3000`.

- [ ] **Step 4: Browser visual QA at desktop width**

Open the local console URL in Browser.

Verify:

- first screen opens on `机会池`;
- largest visual area is the opportunity blotter;
- right-side research inspector is visible after selecting a row;
- Agent panel is visually auxiliary;
- no text overlaps;
- no public/deploy/daily-summary controls appear;
- research-only boundary is visible.

- [ ] **Step 5: Browser visual QA at narrow/mobile width**

Resize to a narrow viewport.

Verify:

- left sidebar, blotter, inspector, and Agent stack vertically;
- row text wraps without overlapping;
- score, evidence gaps, and status remain readable;
- no horizontal layout break makes core controls inaccessible.

- [ ] **Step 6: Git checkpoint if explicitly approved**

```powershell
git add apps/research-console/app/globals.css apps/research-console/components/ResearchWorkspace.tsx apps/research-console/components/OpportunityBoard.tsx apps/research-console/components/OpportunityDetail.tsx apps/research-console/components/ScoreRows.tsx apps/research-console/components/AgentPanel.tsx test/daily-summary-assets.test.mjs project-docs/research-agent/modules/2026-05-23-research-workbench-terminal-visual-refactor.md
git commit -m "style: refactor research workbench into terminal cockpit"
```

## Self-Review

Spec coverage:

- Opportunity pool as first-screen primary surface: Tasks 1, 3, and 6.
- Institutional dark terminal style: Task 2.
- Research Inspector for selected opportunity: Task 4.
- Agent as auxiliary layer: Task 5.
- Research-only and no-trading-language boundary: Tasks 1 and 6.
- Responsive fallback: Task 6.

Placeholder scan:

- No task uses `TBD`, `TODO`, `implement later`, or unspecified edge handling.
- Every code-changing step includes exact file paths and concrete snippets.

Type consistency:

- Existing React props are preserved.
- No API payload shape is changed.
- No new shared type is introduced.

## Execution Recommendation

Plan execution should be inline for Tasks 1-2 and then checkpoint.

After Task 2, decide whether to continue inline or delegate Task 3/4 as one bounded UI pass. Keep final integration, visual QA, and boundary review in the main session.
