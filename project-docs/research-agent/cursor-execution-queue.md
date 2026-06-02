# Cursor Execution Queue | Trading Research Workbench

Date: 2026-05-23

## Purpose

This document is the execution queue for low-decision Cursor work on the trading research workbench.

It does not replace the module PRDs. It tells Cursor and the main agent which PRD task is current, which tasks are already landed in the working tree, where review must stop, and which verification gates prove the next step is safe.

## Operating Rule

Only one Cursor prompt should be active at a time.

The maximum number of active delegated agents is 0-2. The main agent owns architecture, review, integration, verification, and production-boundary audit.

## Hard Boundaries

- Do not modify daily summary generation, `daily:publish`, WeCom delivery, Cloudflare deployment, VitePress routing, GitHub Actions publishing, or webhook delivery while working this queue.
- Do not call Longbridge, Alpha Vantage, yfinance, news search, Whop, model providers, or web search unless a future PRD explicitly enables that task.
- Do not expose raw Markdown, raw structured JSON, absolute local paths, prompts, headers, environment variables, credentials, or provider raw payloads to the browser.
- Keep all output research-only.
- Do not include buy, sell, long, short, entry, exit, stop loss, target price, position sizing, or order language.

## Current Queue Status

| Lane | PRD | Current State | Next Action |
| --- | --- | --- | --- |
| Phase 1 board | `project-docs/research-agent/modules/2026-05-23-cursor-opportunity-board-prd.md` | Implementation has landed in the working tree. Code-level verification passed after main-agent readability fixes. | Hold for visual QA or small copy/layout fixes only. |
| Phase 2 detail | `project-docs/research-agent/modules/2026-05-23-cursor-opportunity-detail-prd.md` | Implementation has landed in the working tree. Code-level verification passed after main-agent readability fixes. | Hold for visual QA or bounded evidence-display polish only. |
| Phase 4 agent panel readability | `project-docs/research-agent/modules/2026-05-23-cursor-agent-panel-readability-prd.md` | Implementation has landed in the working tree. Main-agent review fixed remaining mojibake copy. | Hold for visual QA; do not add agent behavior in this lane. |
| Phase 5 review and learning | `project-docs/research-agent/modules/2026-05-23-codex-review-learning-records-prd.md` | Codex-agent PRD ready. Not a Cursor implementation lane yet. | Keep in Codex-agent queue unless a future low-decision UI subtask is split out. |
| Protected deployment | `project-docs/research-agent/modules/2026-05-23-research-console-deployment-boundary.md` and related audit docs. | Boundary documented, not a Cursor implementation task. | Keep separate from local workbench UI. |

Related high-decision Codex-agent PRDs:

- `project-docs/research-agent/modules/2026-05-23-codex-evidence-tool-layer-prd.md`
- `project-docs/research-agent/modules/2026-05-23-codex-agent-research-flow-prd.md`
- `project-docs/research-agent/modules/2026-05-23-codex-review-learning-records-prd.md`

## Current Review Evidence

Code-level gates already used for the landed UI work:

```powershell
npm run console:lint
npm run console:build
npm run test:summary
git diff --check
```

Known remaining gap:

- Browser visual QA for the research console has not been fully recorded in this queue.
- Dev server may need a fresh `console:build` before local browser QA if `.next` cache is stale.
- No final commit or release handoff has been made for the current worktree.

Visual QA fixes landed (2026-05-23):

- OpportunityBoard missing-context note now lists missing context types clearly instead of mislabeling them as the selected day.
- ResearchInspector required evidence badge uses Chinese copy (`必需`) and the existing warning style class.
- OpportunityBoard reasoning panel column labels now use Chinese copy aligned with AgentPanel (`推理摘要` / `市场情报需求` / `下一步检查`).
- ScoreRows score meter uses Chinese accessible labels (`评分 X，满分 100`), `progressbar` semantics, and a Chinese listbox label when selectable (`机会评分列表`).
- OpportunityBoard / ResearchInspector landmarks use Chinese `aria-label`; date field has explicit `id`/`htmlFor`; evidence actions expose `aria-busy`, external results use `aria-live="polite"`, errors use `role="alert"`; board date input and evidence buttons share visible `:focus-visible` rings.
- AgentPanel form fields use explicit `id`/`htmlFor`; submit and quick actions expose `aria-busy`; chat errors use `role="alert"`; reply section uses `aria-live="polite"` with Chinese landmarks; agent form controls share visible `:focus-visible` rings.

## Next Cursor Task

Do not ask Cursor to continue from the old board/detail/readability prompts unless the main agent identifies a specific defect.

The next meaningful Cursor task should be one of:

1. Visual QA fixes for the existing local research console UI.
2. A bounded visual QA or accessibility patch for the existing research-console UI.
3. A focused accessibility pass if visual QA finds keyboard, focus, or contrast defects.

## Main-Agent Review Gate

After every Cursor patch, the main agent must check:

- Did the patch touch daily summary, VitePress, Cloudflare, WeCom, GitHub Actions, or publishing surfaces?
- Did it add or bypass a network/tool/model call?
- Did it expose raw local source data or secret-shaped data to browser code?
- Did it introduce transaction instruction language?
- Did it leave source-code mojibake markers?
- Did the stated verification commands actually run and pass?

## Acceptance Criteria For Queue Updates

This queue is current only if:

- It lists every active Cursor PRD.
- It states whether each lane is not started, active, landed, blocked, or held for review.
- It names the next allowed Cursor action.
- It keeps the one-prompt-at-a-time rule visible.
- It records verification commands for landed work.
- It does not redefine daily summary work as part of the research workbench queue.
- Phase 5 implementation ownership is delegated through `project-docs/research-agent/codex-agent-execution-queue.md`, not this Cursor queue.
