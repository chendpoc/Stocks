# Agent Evidence Log Viewer

## Purpose

Expose the local agent run evidence trail inside the React research console.

The previous module writes sanitized JSONL records under `.cache/research-agent/runs/`. The next step is to make those records useful during research: the sidebar should show recent runs for the selected day so we can compare what the agent answered, which tools ran, and which policy gates blocked execution without reopening raw cache files manually.

## Boundaries

- Runtime surface: `apps/research-console` only.
- Read source: `.cache/research-agent/runs/YYYY-MM-DD.jsonl`.
- Browser payload: summaries only, not the full JSONL record.
- `day` input must be `YYYY-MM-DD` before any cache path is read.
- Do not expose raw `tool_trace.result_summary` in the run list.
- Do not expose raw Markdown, raw structured JSON, absolute local paths, provider prompts, full messages, headers, environment variables, or secrets.
- Do not call external tools or models while listing runs.
- Public VitePress build remains unaffected.

## Files

Expected implementation write scope:

- `packages/summary-core/src/index.ts`
- `apps/research-console/lib/agent-evidence.ts`
- `apps/research-console/app/api/agent/runs/route.ts`
- `apps/research-console/components/AgentPanel.tsx`
- `apps/research-console/app/globals.css`
- `test/daily-summary-assets.test.mjs`

Documentation:

- `project-docs/research-agent/tooling.md`
- `project-docs/plans/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`

## Tests

RED first:

```powershell
node --test --test-name-pattern "agent evidence log viewer" test\daily-summary-assets.test.mjs
```

Expected initial failure:

- `listAgentRunEvidence(...)` does not exist.
- `/api/agent/runs` route does not exist.
- `AgentPanel` does not fetch or render recent run history.

Observed RED on 2026-05-23:

- `TypeError: listAgentRunEvidence is not a function`
- `ENOENT: ...apps/research-console/app/api/agent/runs/route.ts`

GREEN verification:

```powershell
node --test --test-name-pattern "agent evidence log viewer|agent run evidence" test\daily-summary-assets.test.mjs
npm run console:lint
npm run test:summary
npm run console:build
npm run pages:build
git diff --check
```

Observed targeted GREEN on 2026-05-23:

- `research console writes sanitized agent run evidence log`
- `research console agent evidence log viewer returns bounded run summaries`
- `research console agent evidence log viewer rejects invalid dates before reading cache paths`
- `research console agent evidence log viewer sanitizes legacy cache records on read`
- `research console renders agent evidence log viewer in the agent panel`

## Agent Split

- Low-decision task suitable for a subagent: review whether the runs API leaks too much detail.
- Main-agent responsibility: TDD, schema design, route auth parity, UI integration, and full regression.

## Risks

- Privacy: run logs may contain sensitive user questions. Return truncated previews only.
- Legacy cache safety: list-time sanitization must not trust old or hand-written JSONL records.
- Performance: JSONL can grow. Keep default limit small and cap max limit.
- Security: reuse production token guard from existing research APIs.
- Path safety: validate selected day before reading `.cache` paths.
- UX: the sidebar must stay compact; this is evidence navigation, not a chat transcript viewer.
