# Codex Agent Execution Queue | Trading Research Workbench

Date: 2026-05-23

## Purpose

This queue is for high-decision Codex-agent work on the trading research workbench.

Cursor remains appropriate for low-decision UI copy, layout, and bounded component tasks. Codex agent work is reserved for server-side contracts, data boundaries, tool policy, evidence storage, agent orchestration, and local research records.

## Operating Rule

Run one Codex-agent PRD task at a time.

Keep at most 0-2 active delegated agents across Cursor and Codex combined. The main agent owns architecture, review, integration, verification, and production-boundary audit.

## Hard Boundaries

- Do not modify daily summary generation, `daily:publish`, WeCom delivery, Cloudflare public deployment, VitePress routing, GitHub Actions publishing, or notification scripts unless a future PRD explicitly says the task is a daily-summary maintenance fix.
- Do not expose raw Markdown, raw structured JSON, absolute local paths, prompts, headers, environment variables, credentials, provider raw payloads, or model scratchpads to browser-facing code.
- Do not bypass `authorizeResearchTool(...)`.
- Do not publish research-console local records to `stocks-emw.pages.dev`.
- Keep all outputs research-only.
- Do not add buy, sell, long, short, entry, exit, stop loss, target price, position sizing, or order language.

## Current Queue Status

| Lane | PRD | Current State | Next Action |
| --- | --- | --- | --- |
| Phase 3 evidence tool layer | `docs/research-agent/modules/2026-05-23-codex-evidence-tool-layer-prd.md` | Task 1 landed. Evidence output contracts and sanitizer tests exist. | Continue policy/cache hardening only after product-level evidence actions are verified. |
| Phase 3 external evidence actions | `docs/research-agent/modules/2026-05-23-external-evidence-tool-actions-prd.md` | Active. This is the product-level UI/API entry for Longbridge, Alpha Vantage, yfinance, and news evidence. | Verify `/api/research/evidence`, ResearchInspector actions, readiness, and external-tool policy. |
| Phase 4 agent research flow | `docs/research-agent/modules/2026-05-23-codex-agent-research-flow-prd.md` | PRD ready. Cursor readability work has landed; reasoning contract still needs hardening. | Start after Phase 3 contract audit or if evidence flow is not needed for the selected task. |
| Phase 5 review and learning records | `docs/research-agent/modules/2026-05-23-codex-review-learning-records-prd.md` | PRD ready. No implementation started. | Start after ResearchInspector visual QA, unless user prioritizes review records. |
| Protected deployment | `docs/research-agent/research-console-deployment-boundary.md` | Boundary documented, not active implementation. | Defer until local-first workbench is useful. |

## Current Review Evidence

Baseline gates for Codex-agent patches:

```powershell
npm run console:lint
npm run console:build
npm run test:summary
git diff --check
```

Additional gates by lane:

- Phase 3: `node --test test\market-data-sources.test.mjs`
- Phase 4: `node --test test\opportunity-reasoning.test.mjs`
- Phase 5: focused review-record tests added by the implementing agent

## Next Codex Agent Prompt

Use this only after the main agent confirms no Cursor visual-QA patch is currently active:

```text
Implement the next unlanded task from docs/research-agent/modules/2026-05-23-external-evidence-tool-actions-prd.md.

Goal: make external evidence tools usable through a guarded research-console UI/API path.

Read first:
- docs/research-agent/modules/2026-05-23-external-evidence-tool-actions-prd.md
- docs/research-agent/modules/2026-05-23-codex-evidence-tool-layer-prd.md
- docs/research-agent/tooling.md
- apps/research-console/lib/agent-tools.ts
- apps/research-console/lib/tool-policy.ts
- apps/research-console/components/research/ResearchInspector.tsx
- apps/research-console/app/api/research/evidence/route.ts
- packages/summary-core/src/index.ts
- test/market-data-sources.test.mjs
- test/daily-summary-assets.test.mjs

Hard boundaries:
- Do not modify daily summary generation, daily:publish, WeCom delivery, Cloudflare public deployment, VitePress routing, GitHub Actions publishing, or notification scripts.
- Do not add automatic external calls.
- External tools must remain opt-in through RESEARCH_ENABLE_EXTERNAL_TOOLS=1 and authorizeResearchTool(...).
- Do not expose raw provider payloads, absolute local paths, prompts, headers, environment variables, credentials, or model scratchpads to browser-facing code.
- Keep all output research-only. Do not add buy/sell, long/short, entry/exit, target price, stop loss, position sizing, or order language.

Required verification:
- npm run console:lint
- npm run console:build
- npm run test:summary
- node --test test\market-data-sources.test.mjs

Return changed files, commands run, failed command output if any, and a boundary-risk note.
```

## Main-Agent Review Gate

After every Codex-agent patch, the main agent must check:

- Did the patch touch daily summary, VitePress, Cloudflare, WeCom, GitHub Actions, or notification surfaces?
- Did it add or bypass a network call?
- Did every external tool path pass through policy?
- Did it expose raw local source data or secret-shaped data to browser code?
- Did it introduce transaction instruction language?
- Did it leave source-code mojibake markers?
- Did the stated verification commands actually run and pass?

## Acceptance Criteria For Queue Updates

This queue is current only if:

- It lists every active Codex-agent PRD.
- It states whether each lane is not started, active, landed, blocked, or held for review.
- It names the next allowed Codex-agent action.
- It keeps the one-task-at-a-time rule visible.
- It records verification commands for landed work.
- It does not redefine daily summary work as part of the research workbench queue.
