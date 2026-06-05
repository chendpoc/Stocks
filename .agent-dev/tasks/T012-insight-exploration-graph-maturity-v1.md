# T012: InsightExplorationGraph Maturity v1

Status: done

Completed: 2026-06-05

Spec: `.agent-dev/specs/workflow-feedback-loop-maturity-v1/spec.md`

Depends on: `T011 EvaluationGraph Maturity v1`

Readiness gate: satisfied - T011 is `done` with review evidence at
`.agent-dev/reviews/T011-review-presentation.md`.

## Goal

Make `InsightExplorationGraph` generate bounded `InsightCandidate` records from
measured feedback, not free-form raw data exploration.

## Outcome (as implemented)

`InsightExplorationGraph` now:

- fetches context snapshots, decision outcomes, and optional
  `EvaluationReport` sections (`evaluation_report_id` graph input);
- runs controlled ReAct-style exploration with heuristic fallback when LLM fails;
- persists pending `InsightCandidate` records with evidence refs and weight cap;
- stores exploration metadata (`origin_category`, `horizon`, `horizon_source`)
  inside `candidate_json` for Stage1 persist compatibility;
- schedules `InsightCandidateOutcome` after each successful persist via
  `{ outcomes: [...] }` schedule envelope (`evidence_refs_json`,
  `reason_codes_json`);
- throws `InsightSchedulingError` when persist succeeds but schedule fails,
  enabling idempotent schedule retry with the same `insight_id` + `horizon`;
- enforces horizon whitelist (`1m`/`2m`/`5m`/`30m`/`1h`/`2h`/`4h`) with `2m`
  fallback;
- blocks forbidden lesson/trade/train/promote APIs and raw market/news reads.

## Evidence

- Commits: `f48ab876`, `20aa5b3e`, `b02d8a60`, `e055da94`, `d4a50bfc`
- Review: `.agent-dev/reviews/T012-review-presentation.md` (PASS, 0 blockers)
- Verification (2026-06-05):
  - `npx tsx --test src/graphs/03-insightExploration/insightExplorationGraph.test.ts` -> 19/19
  - `cd apps/trader-workflows && npm test` -> 115/115

## Implementation Plan (spec reference)

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
`due_at`.

### Confirmed Decision: Q64 B

When candidate semantics do not clearly select one of the whitelisted horizons,
`InsightExplorationGraph` must use `2m` and record `horizon_source: default_2m`
in `candidate_json`.

### S1: Input Contract

Mature insight exploration consumes:

```text
EvaluationReport
ContextSnapshot summaries
Outcome labels
```

Graph input supports optional `evaluation_report_id`. Fetch failure is
non-fatal.

### S2: Candidate Contract

Generated `InsightCandidate` records include:

```text
thesis
symbols_json
window_start
window_end
evidence_refs_json
verification_status = pending
weight_cap
candidate_json:
  origin_category: failure_mode | positive_pattern | data_gap | mixed
  horizon: 1m | 2m | 5m | 30m | 1h | 2h | 4h
  horizon_source: explicit | default_2m
  auto_promotion = false
```

`origin_category`, `horizon`, and `horizon_source` are **not** top-level Stage1
columns; they live in `candidate_json`.

### S3: Schedule InsightCandidateOutcome

After each `InsightCandidate` is persisted, schedule via:

```text
POST /insight-candidate-outcomes/schedule
```

Request body:

```text
{
  outcomes: [{
    insight_id
    symbol
    horizon: 1m | 2m | 5m | 30m | 1h | 2h | 4h
    evidence_refs_json
    reason_codes_json
    outcome_json?
  }]
}
```

Response: `{ items: [...], count }`. Backend derives `due_at`.

Partial failure: persist succeeds, schedule fails -> `InsightSchedulingError`
with recovery payload; retry schedule with same `insight_id` + `horizon`.

### S4: Safety Invariants

Insight exploration must not read raw market/news data directly, generate
`RuleCandidate`, activate lessons, mutate RulePack, trade, train models, or
promote candidates.

### S5: CLI and Docs

```text
npm run workflows -- insights explore --symbol TSLA --window 30d --json
```

CLI `data` includes `scheduled_outcome_id` and `scheduled_outcome_horizon`.
README documents Stage1 persist/schedule contracts and recovery semantics.

## Allowed Files

- `apps/trader-workflows/src/services/outcomes.ts`
- `apps/trader-workflows/src/services/insightCandidates.ts`
- `apps/trader-workflows/src/graphs/03-insightExploration/insightExplorationGraph.ts`
- `apps/trader-workflows/src/graphs/03-insightExploration/insightExplorationGraph.nodes.ts`
- `apps/trader-workflows/src/graphs/03-insightExploration/insightExplorationGraph.state.ts`
- `apps/trader-workflows/src/graphs/03-insightExploration/insightExplorationGraph.types.ts`
- `apps/trader-workflows/src/graphs/03-insightExploration/insightExplorationGraph.test.ts`
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
cd apps/trader-workflows && npx tsx --test src/services/insightCandidates.test.ts src/graphs/03-insightExploration/insightExplorationGraph.test.ts
cd apps/trader-workflows && npx tsx --test src/services/outcomes.test.ts src/services/insightCandidates.test.ts src/graphs/03-insightExploration/insightExplorationGraph.test.ts
cd apps/trader-workflows && npm test
git diff --check -- apps/trader-workflows .agent-dev/specs/workflow-feedback-loop-maturity-v1 .agent-dev/tasks/T012-insight-exploration-graph-maturity-v1.json .agent-dev/tasks/T012-insight-exploration-graph-maturity-v1.md
```

Tests cover evaluation-driven candidate generation, outcome scheduling after
candidate persistence, horizon whitelist selection, `2m` fallback, Stage1
schedule envelope, weight cap, evidence refs, no auto-promotion, partial-failure
recovery, and forbidden API boundaries.
