# T025: Market Agent Outcome/Evaluation/Insight Adapter

Status: done

Spec: `.agent-dev/specs/market-agent-mvp-v0/spec.md`

Depends on: current T010, T011, T012 graph implementations and T024.

## Goal

Reuse existing OutcomeGraph, EvaluationGraph, and InsightExplorationGraph while
adding Market Agent-compatible command behavior and tests.

## Allowed Files

- `apps/trader-workflows/src/index.ts`
- `apps/trader-workflows/src/index.test.ts`
- `apps/trader-workflows/src/services/marketAgent.ts`
- `apps/trader-workflows/src/services/marketAgent.test.ts`
- `.agent-dev/tasks/T025-market-agent-outcome-evaluation-insight-adapter.*`

## Forbidden

- Do not rewrite `apps/trader-workflows/src/graphs/01-outcome/**`.
- Do not rewrite `apps/trader-workflows/src/graphs/02-evaluation/**`.
- Do not rewrite `apps/trader-workflows/src/graphs/03-insightExploration/**`.
- Do not edit backend schema.

## Acceptance

- `outcomes list` exposes read-only outcome list behavior.
- `outcomes run --due`, `eval summary`, and `insights explore` remain compatible.
- `insights list` exposes read-only insight candidate list behavior.
- Tests prove existing graph command paths still run through `Stage1Runtime`.

## Verification

```text
npm --prefix apps/trader-workflows test -- src/index.test.ts src/services/marketAgent.test.ts
npm --prefix apps/trader-workflows test
git diff --check -- apps/trader-workflows/src/index.ts apps/trader-workflows/src/index.test.ts apps/trader-workflows/src/services/marketAgent.ts apps/trader-workflows/src/services/marketAgent.test.ts
```

## Review Prompt

Review task T025.
