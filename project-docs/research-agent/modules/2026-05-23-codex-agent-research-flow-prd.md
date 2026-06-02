# PRD | Codex Agent | Agent Research Flow | v1.0

Date: 2026-05-23

## Summary

This PRD defines the Phase 4 agent research flow for the trading research workbench.

The goal is to make the agent behave like an auditable research assistant: it should show a public research plan, evidence needs, policy decisions, executed evidence, invalidation checks, and next observations without exposing raw chain-of-thought or turning research into trading instructions.

This is a Codex-agent task because it crosses provider prompting, kernel orchestration, response contracts, evidence logs, and UI boundaries.

## Product Context

Authoritative planning docs:

- `project-docs/research-agent/trading-workbench-master-plan.md`
- `project-docs/research-agent/opportunity-reasoning.md`
- `project-docs/research-agent/tooling.md`
- `project-docs/research-agent/modules/2026-05-23-codex-evidence-tool-layer-prd.md`
- `project-docs/research-agent/modules/2026-05-23-cursor-agent-panel-readability-prd.md`

Cursor has handled low-decision UI readability work. Codex agent work should now focus on the reasoning contract and orchestration boundary.

## User Value

The user should be able to ask: "Given this selected daily summary and opportunity board, what should I verify next and why?"

The agent should answer with a structured research workflow, not a hidden model monologue and not a trade command.

## Global Constraints

- Runtime surface: `apps/research-console`.
- Shared type surface: `packages/summary-core`.
- Test surface: `test/daily-summary-assets.test.mjs`, `test/opportunity-reasoning.test.mjs`.
- Do not expose raw chain-of-thought, hidden scratchpads, model prompts, provider payloads, headers, credentials, environment variables, raw Markdown, raw structured JSON, or absolute local paths.
- Do not modify daily summary generation, `daily:publish`, WeCom delivery, VitePress routing, Cloudflare public deployment, GitHub Actions publishing, or notification scripts.
- All visible answers must remain research-only.
- No buy, sell, long, short, entry, exit, stop loss, target price, position sizing, or order language.

## In Scope

- Stabilize `AgentResponseEnvelope` and related summary-core contracts.
- Ensure `runResearchAgent(...)` returns a coherent research flow:
  - selected-day context;
  - public research plan;
  - evidence needs;
  - executed tool trace;
  - blocked policy decisions;
  - invalidation conditions;
  - next observations;
  - evidence log reference.
- Keep model-backed and local-deterministic provider outputs aligned to the same visible section shape.
- Add tests for multi-turn context summary and bounded answer sections.
- Improve prompt anchors only when required by the contract.

## Out Of Scope

- New market data providers.
- New UI redesign.
- Persistent review records. That belongs to Phase 5.
- Scheduled agent runs.
- Public deployment.
- Raw CoT or model trace display.

## Functional Requirements

### FR1: Stable Public Research Plan

The agent response must include a public plan that explains what will be checked and why.

Acceptance criteria:

- Plan stages are deterministic enough for UI status rendering.
- Plan stages can be marked `done`, `blocked`, `pending`, or `process` from tool trace and policy decisions.
- Plan text is short and does not reveal private reasoning.

### FR2: Evidence Needs Drive Tool Planning

When the user explicitly asks to refresh or validate evidence, structured evidence needs should guide candidate tool calls.

Acceptance criteria:

- Generic explanation requests stay local-only.
- Evidence refresh requests map evidence kinds to candidate tools.
- Planning can request tools, but policy still decides allowed versus blocked.
- Repeated rounds do not duplicate identical tool calls.

### FR3: Fixed Visible Answer Shape

Local and model-backed answers must use the same visible structure.

Acceptance criteria:

- The answer contains conclusion, evidence, falsification, next observation, and research boundary sections.
- Section labels are parseable by the UI.
- If the model provider fails, fallback output keeps the same structure.
- The answer does not include transaction instruction language.

### FR4: Evidence Log Integrity

Every `/api/agent/chat` run must leave a sanitized, local evidence log.

Acceptance criteria:

- Log records include run id, day, provider status, bounded message preview, bounded answer preview, used context, tool trace summary, policy decisions, opportunity reasoning summary, and relative log path.
- Log records do not include raw Markdown, raw structured JSON, absolute paths, prompts, headers, credentials, or raw provider payloads.
- Run history returns summaries, not full log records.

### FR5: Boundary Tests

Tests must prove the agent research flow cannot leak server-only data or become a transaction instruction surface.

Acceptance criteria:

- Tests scan provider, kernel, evidence logging, and UI components for forbidden imports and secret-shaped strings.
- Tests prove production API routes still use `api-auth`.
- Tests prove model provider fallback remains bounded.

## Target Files

Expected implementation surfaces:

- `packages/summary-core/src/index.ts`
- `apps/research-console/lib/agent-kernel.ts`
- `apps/research-console/lib/agent-provider.ts`
- `apps/research-console/lib/agent-answer-sections.ts`
- `apps/research-console/lib/agent-evidence.ts`
- `apps/research-console/lib/opportunity-reasoning.ts`
- `apps/research-console/app/api/agent/chat/route.ts`
- `apps/research-console/app/api/agent/runs/route.ts`
- `apps/research-console/components/AgentPanel.tsx`
- `apps/research-console/components/AgentEvidenceDetail.tsx`
- `test/daily-summary-assets.test.mjs`
- `test/opportunity-reasoning.test.mjs`

Expected documentation surfaces:

- `project-docs/research-agent/tooling.md`
- `project-docs/research-agent/opportunity-reasoning.md`
- This PRD.

## Suggested Codex-Agent Task Split

### Task 1: Response Contract Audit

Read `AgentResponseEnvelope` and confirm every response field has a clear producer and consumer. Add tests for required fields and forbidden fields.

### Task 2: Answer Section Stabilization

Tighten `agent-answer-sections` and provider output so local and model-backed answers share the same parseable section structure.

### Task 3: Tool-Planning Loop Guardrails

Audit multi-round planning in `agent-kernel.ts` for duplicate calls, policy bypass, and runaway planning. Add focused tests.

### Task 4: Evidence Log And Run History Boundary

Ensure persisted evidence and listed run history are both sanitized. Add tests for old malformed log records if needed.

## Codex Agent Prompt

```text
Implement the next task from project-docs/research-agent/modules/2026-05-23-codex-agent-research-flow-prd.md.

Start by reading the PRD, project-docs/research-agent/opportunity-reasoning.md, project-docs/research-agent/tooling.md, apps/research-console/lib/agent-kernel.ts, apps/research-console/lib/agent-provider.ts, apps/research-console/lib/agent-evidence.ts, and packages/summary-core/src/index.ts.

Hard boundaries:
- Do not modify daily summary generation, daily:publish, WeCom delivery, Cloudflare public deployment, VitePress routing, GitHub Actions publishing, or notification scripts.
- Do not expose raw chain-of-thought, hidden scratchpads, model prompts, provider raw payloads, raw Markdown, raw JSON, absolute paths, headers, environment variables, or credentials.
- Do not add a new market-data provider in this task.
- Keep all visible answer language research-only. Do not add buy/sell, long/short, entry/exit, target price, stop loss, position sizing, or order language.

Required verification:
- npm run console:lint
- npm run console:build
- npm run test:summary
- node --test test\opportunity-reasoning.test.mjs

Return changed files, commands run, failed command output if any, and a boundary-risk note.
```

## Review Checklist For Main Agent

- Did the patch keep raw CoT and prompts server-side?
- Did it preserve model fallback behavior?
- Did it preserve the policy gate for every tool call?
- Did it leak raw local context into browser payloads?
- Did answer text remain research-only?
- Did tests cover both local and model-backed paths where practical?

## Risks

- "Thinking" features can become raw chain-of-thought exposure. Use public plans and evidence summaries instead.
- Model-backed output can drift from UI parsing assumptions. Keep section labels stable.
- Multi-round tool planning can become noisy. Limit rounds and dedupe tool calls.
- A good-looking answer can overstate confidence. Keep falsification and missing evidence visible.
