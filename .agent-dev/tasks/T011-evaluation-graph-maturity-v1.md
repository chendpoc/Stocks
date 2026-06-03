# T011: EvaluationGraph Maturity v1

Status: pending

Spec: `.agent-dev/specs/workflow-feedback-loop-maturity-v1/spec.md`

Depends on: `T010 OutcomeGraph Maturity v1`

## Goal

Make `EvaluationGraph` produce a reviewable feedback report that can feed
reflection and mature insight exploration.

This is a development task specification. It does not implement code.

## Current Implementation

`EvaluationGraph` currently:

- builds an evaluation report from decision outcomes;
- persists the report unless `persist: false`;
- keeps `auto_promotion: false`;
- returns an envelope with report and persisted report.

It does not yet evaluate insight candidate outcomes or emit structured failure
modes, strengths, weaknesses, and data gaps.

## Implementation Plan

### S1: Input Contract

Consume normalized outcome summaries from `T010`:

```text
DecisionOutcomeSummary[]
InsightCandidateOutcomeSummary[]
```

The implementation may keep existing decision outcome aggregation as the first
source, but the report contract must have a place for insight candidate
performance.

### S2: Report Sections

`EvaluationReport` should include:

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

Evaluation may recommend `hold` or `needs_more_data`. It must not recommend
automatic promotion or activation.

### S4: CLI and Docs

Keep the current command shape unless a bounded output field needs to be added:

```text
npm run workflows -- eval summary --json
```

Update README examples only when output shape changes.

## Allowed Files

- `apps/trader-workflows/src/services/evaluation.ts`
- `apps/trader-workflows/src/graphs/evaluationGraph.ts`
- `apps/trader-workflows/src/graphs/evaluationGraph.test.ts`
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
cd apps/trader-workflows && npm test -- src/graphs/evaluationGraph.test.ts
git diff --check -- apps/trader-workflows .agent-dev/tasks/T011-evaluation-graph-maturity-v1.json .agent-dev/tasks/T011-evaluation-graph-maturity-v1.md
```

The tests must assert both report content and safety invariants.
