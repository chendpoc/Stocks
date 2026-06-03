# Clarification Questions

## Q60: Should T010 add a narrow InsightCandidateOutcome backend contract in v1?

**Category**: api_contract

**Context**: The current backend has durable `decision_outcomes`, but no
separate `insight_candidate_outcomes` contract. If v1 keeps only decision
outcomes, the DecisionGraph feedback loop can mature, but the
InsightExplorationGraph feedback loop remains incomplete.

**Impact**: This decides whether T010 may modify backend schema/API/tests. It
must be confirmed before implementation.

| Option | Meaning |
|---|---|
| A | Do not add backend support in v1. Mature `DecisionOutcome` only and leave `InsightCandidateOutcome` as a future contract. |
| B | Add a narrow `InsightCandidateOutcome` backend contract in v1: `insight_candidate_outcomes` table/API/tests only, with no generic `TrackedOutcome` abstraction. |

**Recommended**: B

**Your Decision**: B

## Q63: How should InsightCandidateOutcome horizon and due_at be determined?

**Category**: data_contract

**Context**: Q62 says `InsightExplorationGraph` schedules
`InsightCandidateOutcome` after creating an `InsightCandidate`. The remaining
question is which finite short-cycle observation windows the candidate may use.

**Impact**: This decides the `InsightCandidate` field contract, schedule API
validation, and how `due_at` is derived. Without this, implementations may mix
minute/hour feedback candidates with low-frequency 30d/90d hypotheses in a way
EvaluationGraph cannot aggregate cleanly.

| Option | Meaning |
|---|---|
| A | Use one fixed `30m` horizon for all insight candidate outcomes. |
| B | `InsightCandidate` carries exactly one horizon from a short-cycle whitelist: `1m`, `2m`, `5m`, `30m`, `1h`, `2h`, or `4h`; normal scheduling derives `due_at` from that horizon. |
| C | Schedule every insight candidate at multiple short-cycle horizons. |
| D | Require the caller to provide an explicit custom horizon or `due_at` for every schedule request. |

**Recommended**: B

**Your Decision**: B

## Q65: Should OutcomeGraph load fresh evidence before labeling due outcomes?

**Category**: evidence_policy

**Context**: Q60-Q64 define the feedback-loop contract and horizon ownership.
The remaining question is whether `OutcomeGraph` labels only from stored outcome
payloads, or whether it may pull fresh short-cycle evidence at label time.

**Impact**: This decides whether `OutcomeGraph` can call a white-listed `Evidence
Loader` to build a compact evidence summary before labeling due outcomes.
Without this, outcome labels may reflect stale candidate payloads instead of the
current short-cycle evidence window.

| Option | Meaning |
|---|---|
| A | `OutcomeGraph` only uses market bars. |
| B | `OutcomeGraph` uses market bars plus the existing `evidence_refs`, but does not pull new evidence. |
| C | `OutcomeGraph` may call a white-listed `Evidence Loader` to build a compact evidence summary before labeling. |
| D | `OutcomeGraph` only marks outcomes due and leaves labeling for a later human or workflow step. |

**Recommended**: C

**Your Decision**: C

## Q66: What context scope may the Evidence Loader use?

**Category**: evidence_policy

**Context**: Q65 allowed `OutcomeGraph` to pull a compact evidence summary
before labeling. The remaining question is whether that loader should stay tied
to the same `symbol` and a narrow benchmark/index context, or whether it may
expand to other sources dynamically.

**Impact**: This decides the loader boundary for evidence used during labeling.
Without a bound, `OutcomeGraph` could drift into source-selection logic.

| Option | Meaning |
|---|---|
| A | The loader may only use same-symbol evidence. |
| B | The loader may use same-symbol evidence plus market benchmark or index context. |
| C | The loader may add industry or related-symbol context. |
| D | `OutcomeGraph` may decide evidence sources dynamically. |

**Recommended**: B

**Your Decision**: B

## Q67: How long should the compact evidence summary be?

**Category**: evidence_policy

**Context**: Q65-Q66 allow `OutcomeGraph` to load fresh compact evidence from a
white-listed loader with a bounded source scope. The remaining question is how
long that summary should be so it stays readable and bounded.

**Impact**: This decides the length cap for compact evidence summaries used at
label time.

| Option | Meaning |
|---|---|
| A | Fixed very short, capped at 5 lines. |
| B | A wider 10-20 line range. |
| C | Longer summaries are allowed as long as they do not store raw data. |
| D | `OutcomeGraph` decides dynamically. |

**Recommended**: A

**Your Decision**: `15` lines

## Q64: What horizon should be used when candidate semantics are ambiguous?

**Category**: data_contract

**Context**: Q63 defines the finite short-cycle horizon whitelist. The remaining
choice is whether an ambiguous `InsightCandidate` should be rejected, defaulted,
mapped by category, or scheduled at multiple horizons.

**Impact**: This decides the fallback behavior inside `InsightExplorationGraph`.
The backend schedule API still receives a concrete whitelisted horizon and
derives `due_at`; `OutcomeGraph` still does not choose horizons.

| Option | Meaning |
|---|---|
| A | If candidate semantics do not clearly select a horizon, do not schedule the outcome. |
| B | If candidate semantics do not clearly select a horizon, use `2m`. |
| C | Use a fixed mapping from `origin_category` to horizon. |
| D | Schedule multiple whitelisted horizons for each ambiguous candidate. |

**Recommended**: B

**Your Decision**: B

## Q62: Who schedules InsightCandidateOutcome after an InsightCandidate is created?

**Category**: architecture

**Context**: Q60 added the five minimal `InsightCandidateOutcome` APIs, including
`POST /insight-candidate-outcomes/schedule`. The remaining ownership question is
whether scheduling belongs to the graph that creates insight candidates, the
graph that labels due outcomes, or a manual operator step.

**Impact**: This decides whether T012 must call the schedule API after creating
`InsightCandidate`, and prevents `OutcomeGraph` from silently becoming a source
selection workflow.

| Option | Meaning |
|---|---|
| A | `OutcomeGraph` scans pending `InsightCandidate` records and decides which outcomes to schedule. |
| B | `InsightExplorationGraph` schedules `InsightCandidateOutcome` immediately after creating and persisting `InsightCandidate`; `OutcomeGraph` only handles due records and labeling. |
| C | Manual CLI/admin action schedules insight candidate outcomes as the primary v1 path. |
| D | Do not schedule `InsightCandidateOutcome` in v1. |

**Recommended**: B

**Your Decision**: B
