# Market Agent Subagent Context

Use this compact context before reading source files.

## Required Startup

Read only:

```text
CLAUDE.md
.agent-dev/context/ai-index.md
.agent-dev/context/code_map.md
.agent-dev/specs/market-agent-mvp-v0/spec.json
.agent-dev/specs/market-agent-mvp-v0/decision-record.json
.agent-dev/specs/market-agent-mvp-v0/task-implementation-plan.md
the resolved T021-T027 task JSON and markdown
```

Then use CodeGraph before opening implementation files:

```text
codegraph_context for the assigned task area
codegraph_explore for scoped symbols or files returned by context
```

Do not broad-read `project-docs/**`, `apps/**`, `.agent-dev/tasks/**`, or a full
unrestricted diff.

## Current Code Facts

- Backend app root: `apps/trader-agent/backend/app/intel`.
- Backend API routes are aggregated in `app.intel.api.__init__` and mounted by
  `app.main.create_app()` under `/api/intel`.
- Existing physical tables include `market_bars`, `model_decisions`,
  `decision_outcomes`, `insight_candidates`, `insight_candidate_outcomes`, and
  `evaluation_reports`.
- Existing workflow CLI entrypoint is `apps/trader-workflows/src/index.ts`.
- Existing workflow commands include `decide`, `context snapshots list/show`,
  `outcomes run --due`, `eval summary`, and `insights explore`.
- Existing completed workflow graphs live under `apps/trader-workflows/src/graphs`.
  Reuse them; do not rebuild `OutcomeGraph`, `EvaluationGraph`, or
  `InsightExplorationGraph`.

## Non-Negotiable Boundaries

- Do not edit `.deepseek/**`, `.obsidian/**`, `apps/research-console/**`,
  `apps/trader-cockpit/**`, `apps/trader-cli/**`, `project-docs/archive/**`,
  `data/**`, or `.github/**`.
- Do not create physical tables named `market_snapshots`, `decision_memories`,
  or `outcome_memories`.
- Do not create a top-level `trader` CLI.
- Do not introduce `OrderIntent`, broker/account, position, PnL, or live trading
  behavior in Market Agent MVP.
