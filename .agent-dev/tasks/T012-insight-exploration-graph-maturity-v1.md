# T012: InsightExplorationGraph Maturity v1

Status: pending

Spec: `.agent-dev/specs/workflow-feedback-loop-maturity-v1/spec.md`

Depends on: `T011 EvaluationGraph Maturity v1`

## Goal

Make `InsightExplorationGraph` generate bounded `InsightCandidate` records from
measured feedback, not free-form raw data exploration.

This is a development task specification. It does not implement code.

## Current Implementation

`InsightExplorationGraph` currently:

- fetches context snapshots and decision outcomes;
- runs a controlled ReAct-style exploration;
- persists pending `InsightCandidate` records;
- enforces weight cap and `auto_promotion: false`;
- blocks forbidden lesson/trade/train/promote API calls.

It does not yet use `EvaluationReport` as the main driver for insight
generation, and it does not yet schedule `InsightCandidateOutcome` records after
creating insight candidates.

## Implementation Plan

### Confirmed Decision: Q62 B

After `InsightExplorationGraph` creates and persists an `InsightCandidate`, it
must schedule the matching `InsightCandidateOutcome`. `OutcomeGraph` only
handles due outcome records and labeling.

### Confirmed Decision: Q63 B

Each `InsightCandidate` must carry exactly one horizon selected from:

```text
1m
2m
5m
30m
1h
2h
4h
```

The normal schedule request sends that horizon; backend scheduling derives
`due_at`. `InsightExplorationGraph` must not pass arbitrary custom horizons in
the v1 path, and must not use `30d`, `90d`, or other low-frequency windows.

### Confirmed Decision: Q64 B

When candidate semantics do not clearly select one of the whitelisted horizons,
`InsightExplorationGraph` must use `2m`. It should still record why the fallback
was used in `reason_codes` or `candidate_json`.

### S1: Input Contract

Mature insight exploration should consume:

```text
EvaluationReport
ContextSnapshot summaries
Outcome labels
```

The CLI may keep `--symbol` and `--window`, but implementation should support
an explicit or latest evaluation report input:

```text
--evaluation-report-id <REPORT_ID>
```

If no explicit report is provided, the implementation may use the latest
bounded report for the symbol/window, but this behavior must be documented and
tested.

### S2: Candidate Contract

Generated `InsightCandidate` records should include:

```text
origin_category: failure_mode | positive_pattern | data_gap | mixed
thesis
symbols
window_start
window_end
evidence_refs
horizon: 1m | 2m | 5m | 30m | 1h | 2h | 4h
horizon_source: explicit | default_2m
weight_cap
verification_status = pending
auto_promotion = false
candidate_json
```

`InsightCandidate` is not a `RuleCandidate`. AlphaResearchGraph owns the
conversion from insight to rule candidate.

### S3: Schedule InsightCandidateOutcome

After each `InsightCandidate` is persisted, schedule the matching outcome via:

```text
POST /insight-candidate-outcomes/schedule
```

The schedule request should stay bounded to:

```text
insight_id
symbol
horizon: 1m | 2m | 5m | 30m | 1h | 2h | 4h
evidence_refs
reason_codes
outcome_json
```

The schedule API derives and persists `due_at` from `scheduled_at + horizon`.
`OutcomeGraph` must not scan unscheduled `InsightCandidate` records or decide
what to observe. Manual or admin scheduling may exist only as a recovery path,
not as the normal v1 path.

### S4: Safety Invariants

Insight exploration must not:

- read raw market/news data directly;
- generate `RuleCandidate`;
- activate lessons;
- mutate RulePack;
- trade;
- train models;
- promote candidates.

It should use context summaries, evaluation summaries, outcome summaries, and
`EvidenceRef` links.

### S5: CLI and Docs

Keep the current command shape where possible:

```text
npm run workflows -- insights explore --symbol TSLA --window 4h --json
```

If `--evaluation-report-id` is added, document it as optional and bounded.

## Allowed Files

- `apps/trader-workflows/src/services/outcomes.ts`
- `apps/trader-workflows/src/services/insightCandidates.ts`
- `apps/trader-workflows/src/graphs/insightExplorationGraph.ts`
- `apps/trader-workflows/src/graphs/insightExplorationGraph.test.ts`
- `apps/trader-workflows/src/index.ts`
- `apps/trader-workflows/README.md`
- `apps/trader-workflows/README.zh-CN.md`

## Forbidden

- No direct raw market/news data ingestion.
- No `RuleCandidate` generation.
- No AlphaResearchGraph implementation.
- No automatic lesson activation.
- No RulePack mutation.
- No model training or promotion.
- No broker or paper execution.
- No custom UI.
- No primary manual scheduling flow for insight candidate outcomes.

## Verification

```text
cd apps/trader-workflows && npm test -- src/graphs/insightExplorationGraph.test.ts
git diff --check -- apps/trader-workflows .agent-dev/tasks/T012-insight-exploration-graph-maturity-v1.json .agent-dev/tasks/T012-insight-exploration-graph-maturity-v1.md
```

Tests must cover evaluation-driven candidate generation, outcome scheduling
after candidate persistence, horizon whitelist selection, `2m` fallback
selection, derived due-date contract, weight cap, evidence refs, no
auto-promotion, and forbidden API boundaries.
