# T011: EvaluationGraph Maturity v1

Status: done

Completed: 2026-06-05

Spec: `.agent-dev/specs/workflow-feedback-loop-maturity-v1/spec.md`

Depends on: `T010 OutcomeGraph Maturity v1`

## Goal

Make `EvaluationGraph` produce a reviewable feedback report that can feed
reflection and mature insight exploration.

## Outcome (as implemented)

`EvaluationGraph` now:

- consumes normalized `DecisionOutcomeSummary` and
  `InsightCandidateOutcomeSummary` inputs from `T010`;
- builds `EvaluationReport` with bounded structured `sections`
  (`decision_performance`, `insight_candidate_performance`,
  `top_positive_patterns`, `top_negative_patterns`, `failure_modes`,
  `data_gaps`, `evidence_refs`);
- persists the report unless `persist: false`;
- keeps `auto_promotion: false` and does not mutate RulePack or model config;
- returns `hold` or `needs_more_data` only;
- exposes `sections` through `eval summary` CLI output.

Sections logic stays in `apps/trader-workflows/src/services/evaluation.ts`; graph
nodes remain thin and call the existing build path.

## Evidence

- Primary commit: `4c84eb9d`
- Review: `.agent-dev/reviews/T011-review-presentation.md` (PASS, 0 blockers, 1
  warning)
- Verification (2026-06-05): `cd apps/trader-workflows && npm test` → 101/101

## Implementation Plan (spec reference)

### S1: Input Contract

Consume normalized outcome summaries from `T010`:

```text
DecisionOutcomeSummary[]
InsightCandidateOutcomeSummary[]
```

### S2: Report Sections

`EvaluationReport` includes:

```text
decision_performance
insight_candidate_performance
top_positive_patterns
top_negative_patterns
failure_modes
data_gaps
evidence_refs
```

Keep report values bounded. Do not include raw bars, raw snapshots, raw
articles, or full model traces.

### S3: Safety Behavior

Keep these invariants:

```text
auto_promotion = false
no active RulePack mutation
no model config mutation
dry-run can skip persistence
```

### S4: CLI and Docs

Command shape:

```text
npm run workflows -- eval summary --json
```

CLI `data.sections` documents the bounded report sections.

## Allowed Files

- `apps/trader-workflows/src/services/evaluation.ts`
- `apps/trader-workflows/src/services/evaluation.test.ts`
- `apps/trader-workflows/src/graphs/02-evaluation/evaluationGraph.ts`
- `apps/trader-workflows/src/graphs/02-evaluation/evaluationGraph.nodes.ts`
- `apps/trader-workflows/src/graphs/02-evaluation/evaluationGraph.state.ts`
- `apps/trader-workflows/src/graphs/02-evaluation/evaluationGraph.types.ts`
- `apps/trader-workflows/src/graphs/02-evaluation/evaluationGraph.test.ts`
- `apps/trader-workflows/src/index.ts`
- `apps/trader-workflows/README.md`
- `apps/trader-workflows/README.zh-CN.md`

## Forbidden

- No automatic model promotion.
- No active RulePack mutation.
- No `RuleCandidate` generation.
- No AlphaResearchGraph implementation.
- No context snapshot or outcome mutation.
- No custom UI.

## Verification

```text
cd apps/trader-workflows && npx tsx --test src/graphs/02-evaluation/evaluationGraph.test.ts src/services/evaluation.test.ts
cd apps/trader-workflows && npm test
git diff --check -- apps/trader-workflows .agent-dev/tasks/T011-evaluation-graph-maturity-v1.json .agent-dev/tasks/T011-evaluation-graph-maturity-v1.md
```

The tests assert both report content and safety invariants.
