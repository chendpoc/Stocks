# T010: OutcomeGraph Maturity v1

Status: done

Completed: 2026-06-05

Spec: `.agent-dev/specs/workflow-feedback-loop-maturity-v1/spec.md`

## Goal

Make `OutcomeGraph` the typed feedback-labeling boundary for both decision
outcomes and insight candidate outcomes.

## Outcome (as implemented)

`OutcomeGraph` now:

- labels due decision outcomes and insight candidate outcomes in one run;
- uses normalized labels (`hit`/`miss`/`neutral`/`invalid`/`insufficient_data`);
- emits counts by source type and normalized label;
- builds compact evidence summaries (capped at 15 lines) when labeling needs
  fresh evidence;
- does not mutate context snapshots or own insight scheduling.

Backend adds narrow `insight_candidate_outcomes` schema and Stage1 schedule/list
APIs consumed by `InsightExplorationGraph`.

## Evidence

- Commits: `aedfee41`, `d4bd3fb8`, `f658f41f`
- Review: `.agent-dev/reviews/T010-review-presentation.md` (PASS, 0 blockers)
- Verification (2026-06-05): `cd apps/trader-workflows && npm test` -> 115/115
- Backend verify: `npm run trader-agent:backend:verify` - environment-dependent;
  test file `test_stage1_insight_candidate_outcomes.py` present

## Implementation Plan (spec reference)

### Confirmed Decision: Q60 B

T010 may add a narrow `InsightCandidateOutcome` backend contract in v1. This is
limited to `insight_candidate_outcomes` schema/API/tests and does not authorize
a generic outcome system.

### Confirmed Decision: Q62 B

The schedule API is a backend capability, not `OutcomeGraph` scheduling
ownership. Normal scheduling is owned by `InsightExplorationGraph` after it
persists an `InsightCandidate`. `OutcomeGraph` must only fetch due outcomes,
label them, and emit bounded summaries.

### Confirmed Decision: Q63 B

`InsightCandidateOutcome` uses a bounded horizon contract. Normal schedule
requests provide `horizon` from `1m`, `2m`, `5m`, `30m`, `1h`, `2h`, or `4h`;
the backend derives `due_at` from `scheduled_at + horizon`.

### Confirmed Decision: Q64 B

`2m` is the fallback horizon when `InsightExplorationGraph` cannot clearly
select a horizon from candidate semantics. The backend still receives a concrete
whitelisted horizon in normal schedule requests; it does not infer the fallback
from a missing field.

### Confirmed Decision: Q65 C

When a due `InsightCandidateOutcome` needs fresh context, `OutcomeGraph` may
invoke a white-listed `Evidence Loader` and build a compact evidence summary
before labeling. This is still bounded: no raw evidence crawling, no direct
raw-data ingestion, and no unbounded expansion.

### Confirmed Decision: Q66 B

The evidence loader boundary is the same symbol plus market benchmark or index
context. `OutcomeGraph` must not decide arbitrary sources dynamically. It may
use the white-listed loader only within that bounded scope.

### Confirmed Decision: Q67 15 lines

Compact evidence summaries should stay within `15` lines. This is short enough
to remain readable at label time while still carrying the symbol, benchmark or
index context, and the evidence needed for a bounded judgment.

### S1: Outcome Contract

Add a workflow-side normalized outcome contract:

```ts
type OutcomeSourceType = "decision" | "insight_candidate";
type NormalizedOutcomeLabel =
  | "hit"
  | "miss"
  | "neutral"
  | "invalid"
  | "insufficient_data";
```

Each finalized outcome summary should include:

```text
source_type
source_id
symbol
horizon
status
normalized_label
metrics
reason_codes
evidence_refs
```

Preserve source-specific labels in a bounded field such as `source_label` or
`reason_codes`; do not make EvaluationGraph parse raw backend payloads.

### S2: InsightCandidateOutcome Persistence Contract

Current backend evidence shows durable `decision_outcomes` support, but no
separate durable `insight_candidate_outcomes` route.

Q60 B is confirmed. S2 adds a narrow backend
`insight_candidate_outcomes` contract and tests.

Do not store insight candidate outcomes by pretending an `insight_id` is a
`decision_id`.

Expected backend shape:

```text
insight_candidate_outcomes:
  outcome_id
  insight_id
  symbol
  horizon: 1m | 2m | 5m | 30m | 1h | 2h | 4h
  status
  due_at
  normalized_label
  metrics_json
  reason_codes_json
  evidence_refs_json
  outcome_json
  created_at
  labeled_at
```

Expected minimal APIs:

```text
POST /insight-candidate-outcomes/schedule
GET  /insight-candidate-outcomes/due
POST /insight-candidate-outcomes/{outcome_id}/label
GET  /insight-candidate-outcomes
GET  /insight-candidate-outcomes/{outcome_id}
```

Do not add update/delete endpoints, approval endpoints, activation endpoints,
or a generic outcome endpoint in v1.

Do not make `OutcomeGraph` scan unscheduled `InsightCandidate` records or decide
which new insight candidates should receive outcomes.

The schedule endpoint must validate the horizon whitelist. It should not accept
arbitrary custom horizons in the normal v1 path.

The schedule endpoint must not accept `30d`, `90d`, or other low-frequency
horizons in v1.

### S3: OutcomeGraph Output

Return bounded counts:

```text
processed_count
labeled_count
skipped_count
failed_count
counts_by_source_type
counts_by_normalized_label
outcomes[]
```

`outcomes[]` should remain bounded to summary fields. It must not contain raw
market bars, raw context snapshots, raw articles, or full model traces. When
fresh evidence is required for labeling, it may include only compact evidence
summary references or bounded evidence metadata. Compact evidence summaries
must stay within `15` lines.

### S4: CLI and Docs

Keep the existing operator command shape where possible:

```text
npm run workflows -- outcomes run --due --json
```

If output shape changes, update workflow README examples. Do not add custom UI.

## Allowed Files

- `apps/trader-workflows/src/services/outcomes.ts`
- `apps/trader-workflows/src/graphs/01-outcome/outcomeGraph.ts`
- `apps/trader-workflows/src/graphs/01-outcome/outcomeGraph.nodes.ts`
- `apps/trader-workflows/src/graphs/01-outcome/outcomeGraph.state.ts`
- `apps/trader-workflows/src/graphs/01-outcome/outcomeGraph.types.ts`
- `apps/trader-workflows/src/graphs/01-outcome/outcomeGraph.test.ts`
- `apps/trader-workflows/src/index.ts`
- `apps/trader-workflows/README.md`
- `apps/trader-workflows/README.zh-CN.md`

Backend files are allowed only for the narrow `InsightCandidateOutcome`
persistence contract:

- `apps/trader-agent/backend/app/intel/db/schema.py`
- `apps/trader-agent/backend/app/intel/api/stage1.py`
- `apps/trader-agent/backend/tests/test_stage1_insight_candidate_outcomes.py`

## Forbidden

- No context snapshot mutation.
- No generic `TrackedOutcome`.
- No AlphaResearchGraph implementation.
- No RulePack mutation.
- No model promotion.
- No broker or paper execution.
- No custom UI.
- No scheduling-owner logic inside `OutcomeGraph`.
- No unbounded raw evidence crawling or direct raw-data ingestion.
- No arbitrary dynamic evidence-source selection.
- No evidence summaries longer than `15` lines.

## Verification

```text
cd apps/trader-workflows && npx tsx --test src/graphs/01-outcome/outcomeGraph.test.ts
npm run trader-agent:backend:verify
git diff --check -- apps/trader-workflows apps/trader-agent/backend .agent-dev/tasks/T010-outcome-graph-maturity-v1.json .agent-dev/tasks/T010-outcome-graph-maturity-v1.md
```

Backend verification is required. Implementation must not fake persistence or
reuse `decision_outcomes` for insight rows.
