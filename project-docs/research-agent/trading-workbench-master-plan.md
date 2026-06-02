# Trading Research Workbench Master Plan (SUPERSEDED)

Date: 2026-05-23

## Supersession Notice

Status: SUPERSEDED as of 2026-05-25.

This staged research-console route has been abandoned and is kept only as a historical implementation record. It is not the source of truth and 不再作为后续开发路线.

Future development follows the trader-agent 目标系统文档:

```text
project-docs/research-agent/target-system/trader-agent/README.md
project-docs/research-agent/target-system/trader-agent/00-system-overview.md
project-docs/research-agent/target-system/trader-agent/01-agent-core-backend-prd.md
project-docs/research-agent/target-system/trader-agent/02-web-agent-cockpit-prd.md
project-docs/research-agent/target-system/trader-agent/03-shared-platform-roadmap-prd.md
```

Use this file only to understand existing implementation history and migration context.

## Decision

Daily summary is now in daily summary maintenance mode.

The main product development focus moves to the trading research workbench in `apps/research-console`. The public VitePress site remains the daily report surface for `stocks-emw.pages.dev`; it should not host the research console, agent runtime, market-data tools, or local research records.

## Product Boundary

- Daily summary maintenance mode covers only automation failures, obvious content defects, and security or leakage issues.
- `apps/research-console` is the React research workbench and stays local-first in the current stage.
- VitePress remains for public daily reports, current-month history, and static Cloudflare display.
- The research workbench must not enter the public `stocks-emw.pages.dev` deploy.
- Future remote use requires a separate protected deployment, a separate CI path, and server-side-only secrets.

## Phase Roadmap

### Phase 1: Summary-To-Opportunity Board

Select a date, load the structured daily summary, and show a bounded opportunity observation list.

Success criteria:

- The board uses selected-day summary context.
- Each opportunity shows source day, symbols, motivation, risk, and local score.
- No model call or external market-data call is required for the board.

### Phase 2: Research Inspector View

Add a detail view for one opportunity.

Success criteria:

- Show source summary path, admin theory, related symbols, trigger logic, invalidation, and evidence needs.
- Keep raw Markdown, raw structured JSON, absolute local paths, and credentials server-side.
- Use `packages/summary-core` contracts for shared opportunity data shapes.

### Phase 3: Evidence Tool Layer

Connect yfinance, Longbridge, Alpha Vantage, and news search as research evidence tools.

Success criteria:

- External tools are disabled by default.
- Tools require `RESEARCH_ENABLE_EXTERNAL_TOOLS=1`.
- Tool outputs are cached, source-attributed, sanitized, and bounded.
- The browser receives only evidence summaries, not provider raw payloads or secrets.

### Phase 4: Agent Research Flow

Make the agent reason over opportunity context and evidence needs.

Success criteria:

- Show public research plan, evidence needs, executed tools, blocked policy decisions, invalidation conditions, and next checks.
- Do not expose raw CoT, hidden scratchpad, model prompts, headers, or credentials.
- Every answer keeps the research-only boundary visible and avoids buy, sell, long, or short instructions.

### Phase 5: Review And Learning

Record the later outcome of opportunity observations.

Success criteria:

- Store follow-up status, observed result, failure mode, and learning notes.
- Make prior observations searchable for local review.
- Keep the record separate from public daily summaries.

### Phase 6: Protected Deployment

Deploy the research workbench only after the security boundary is explicit.

Success criteria:

- Use a separate protected deployment, not `stocks-emw.pages.dev`.
- Production API routes require `RESEARCH_CONSOLE_ACCESS_TOKEN` and `x-research-console-token`.
- No model, Longbridge, Alpha Vantage, news search, webhook, or Whop secrets enter browser bundles.

## Interface And Data Rules

- `packages/summary-core` is the shared type boundary for summary, opportunity, tool trace, and agent evidence contracts.
- Browser payloads may include bounded summaries, counts, status, relative paths, and sanitized evidence.
- Browser payloads must not include raw Markdown, raw summary JSON, absolute local paths, request headers, environment variables, credentials, model prompts, or provider raw responses.
- External data is supporting evidence. It cannot become a direct trading instruction.
- Tool execution must pass through the policy gate. UI actions and agent plans may request tools, but they cannot bypass policy.

## Module Development Protocol

Every new workbench module starts with a module development document:

```text
project-docs/research-agent/modules/YYYY-MM-DD-<module>.md
```

Each module development document must state:

- Purpose: product behavior and why it belongs in `apps/research-console`.
- Boundaries: reads, writes, browser exposure, and external calls.
- Files: intended implementation and test surfaces.
- Tests: red and green commands.
- Agent split: low-decision tasks that can be delegated.
- Risks: privacy, policy, performance, determinism, and trading-instruction risks.

Low-decision implementation tasks may be delegated to agents, but each phase should keep at most 0-2 active agents. The main agent owns architecture decisions, review, integration, verification, and production-boundary audits.

## Operating Rules

- Do not add research-console code to daily summary publishing.
- Do not let public VitePress builds expose local-only research, agent, or opportunity records.
- Do not expand daily summary scope unless it blocks automation, fixes an obvious defect, or closes a leakage risk.
- Run a short retrospective after a meaningful module or about every ten collaboration turns.
- Keep the workbench local-first until protected deployment is designed and verified.

## Current Next Step

Use the execution queues before starting delegated work:

- `project-docs/research-agent/cursor-execution-queue.md`
- `project-docs/research-agent/codex-agent-execution-queue.md`

The queues are the current source of truth for which PRD task is active, which lanes are held for review, and which verification gates already passed.

Phase 1 remains the base product path.

The first module should convert selected-day summary context into a workbench opportunity list that is useful without external tools. That creates the stable object model for later evidence refresh, agent reasoning, and review history.

Authoritative Phase 1 planning docs:

- `project-docs/research-agent/modules/2026-05-23-summary-to-opportunity-board.md`
- `project-docs/research-agent/modules/2026-05-23-cursor-opportunity-board-prd.md`
- `project-docs/research-agent/modules/2026-05-23-cursor-opportunity-detail-prd.md`
- `project-docs/research-agent/modules/2026-05-23-cursor-agent-panel-readability-prd.md`
- `project-docs/research-agent/modules/2026-05-23-codex-evidence-tool-layer-prd.md`
- `project-docs/research-agent/modules/2026-05-23-codex-agent-research-flow-prd.md`
- `project-docs/research-agent/modules/2026-05-23-codex-review-learning-records-prd.md`

Use the Cursor PRDs for low-decision UI and test tasks. Use the Codex-agent PRDs for server-side contracts, evidence tools, agent orchestration, local records, and boundary audits. Keep architecture review, boundary audits, and final integration with the main agent.
