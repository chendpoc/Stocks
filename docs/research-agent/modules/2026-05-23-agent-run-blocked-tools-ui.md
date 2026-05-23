# Agent Run Blocked Tools UI

## Purpose

Show blocked tool requests in the agent run history list. The evidence log already stores `blocked_tools`, but the sidebar only renders executed `tool_names`. For research workflows, a blocked external evidence request is meaningful: it tells the user that the agent wanted market/history/news evidence but policy prevented execution.

This improves auditability without exposing raw tool traces or secrets.

## Boundaries

- Input: existing `AgentRunEvidenceSummary.blocked_tools`.
- Output: compact blocked tags in the browser run history list.
- No new API fields.
- No raw `tool_trace.result_summary`.
- No credentials, raw Markdown, raw JSON, or local absolute paths.
- Do not change tool execution policy.

## Files

- `apps/research-console/components/AgentPanel.tsx`
- `apps/research-console/app/globals.css`
- `test/daily-summary-assets.test.mjs`
- `docs/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`

## Tests

RED first:

```powershell
node --test --test-name-pattern "renders blocked tool tags in run history" test\daily-summary-assets.test.mjs
```

Expected red state:

- `AgentPanel` does not read or render `run.blocked_tools`.
- No blocked-tool CSS class exists.

GREEN verification:

```powershell
node --test --test-name-pattern "renders blocked tool tags in run history|agent evidence log viewer" test\daily-summary-assets.test.mjs
npm run test:summary
npm run console:build
```

## Risks

- Display should not imply blocked tools executed.
- The UI must stay compact because run history is a sidebar, not a full evidence viewer.
