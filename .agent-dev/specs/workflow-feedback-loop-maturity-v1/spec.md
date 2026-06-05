# Workflow Feedback Loop Maturity v1

> Source backlog: `project-docs/backlog/now/workflow-feedback-loop-hardening.md`
> Structured contract: `spec.json`
> Decisions: `decision-record.json`
> Open questions: `clarification-questions.md`

Status: done

## Purpose

Record the completed v1 plan and evidence for making the existing feedback
workflows usable as a durable improvement loop before expanding beyond
`AlphaResearchGraph v0`.

This is a requirements and implementation-spec artifact. The implementation
work was completed through T010, T011, and T012.

## Current State

`OutcomeGraph`, `EvaluationGraph`, and `InsightExplorationGraph` are implemented
and tested as mature v1 feedback-loop contracts:

- `OutcomeGraph` currently finalizes due `decision_outcomes` and returns counts.
- `EvaluationGraph` currently builds/persists a model-path evaluation report.
- `InsightExplorationGraph` currently explores context snapshots and outcomes
  to persist pending insight candidates.

The typed handoff is:

```text
DecisionGraph / InsightExplorationGraph
  -> OutcomeGraph
  -> EvaluationGraph
  -> InsightExplorationGraph
  -> Reflection Proposal or AlphaResearchGraph
  -> policy/manual review gate
```

## Working Baseline

These decisions encode the current discussion baseline for review before
implementation. Q60 is confirmed as B, so T010 may add only the narrow
`InsightCandidateOutcome` backend contract described in this spec and task.
Q62 is confirmed as B, so normal `InsightCandidateOutcome` scheduling is owned
by `InsightExplorationGraph`, not by `OutcomeGraph`. Q63 is confirmed as B, so
`InsightCandidate` carries a bounded horizon selected from a whitelist. Q64 is
confirmed as B with `2m` as the fallback horizon when candidate semantics are
ambiguous.
Q65 is confirmed as C, so `OutcomeGraph` may call a white-listed `Evidence
Loader` to generate a compact evidence summary at label time.
Q66 is confirmed as B, so the `Evidence Loader` may use the same `symbol` plus
market benchmark or index context, but not arbitrary dynamic source selection.
Q67 is confirmed as `15` lines, so compact evidence summaries stay short and
bounded.

| Decision | Chosen rule | Why |
|---|---|---|
| Mainline | Define one feedback-loop spec before graph-specific tasks. | The graph contracts depend on each other. |
| Source scope | v1 covers `DecisionGraph` and `InsightExplorationGraph` outputs only. | This covers current implemented sources without pulling future graphs forward. |
| Outcome source types | Use `DecisionOutcome` and `InsightCandidateOutcome`; do not invent a generic `TrackedOutcome` in v1. | Keeps vocabulary explicit and avoids premature abstraction. |
| Outcome label | Use a normalized label plus metrics, reason codes, and evidence refs. | Evaluation needs both aggregateable labels and explainable evidence. |
| Evaluation output | Emit metrics plus strength/weakness summaries, failure modes, and data gaps. | Reflection and insight generation need more than raw aggregates. |
| Insight input | Mature insight exploration is driven by evaluation reports plus context snapshots and outcomes. | Prevents free-form idea generation from drifting away from measured feedback. |
| Runtime shape | Do not migrate the three graphs to native LangGraph in v1. | First mature the contracts, tests, and operator inspection. |
| Task order | Implement OutcomeGraph, then EvaluationGraph, then InsightExplorationGraph. | Data flows from labels to reports to new insight candidates. |
| InsightCandidateOutcome backend | Add a narrow `insight_candidate_outcomes` backend contract in T010. | This closes `InsightExplorationGraph -> OutcomeGraph -> EvaluationGraph` without inventing a generic outcome system. |
| InsightCandidateOutcome scheduling | `InsightExplorationGraph` schedules after creating an `InsightCandidate`. | `OutcomeGraph` should stay focused on due outcome labeling, not deciding what new insight candidates to observe. |
| Outcome horizon | `InsightCandidate` carries exactly one horizon from `1m`, `2m`, `5m`, `30m`, `1h`, `2h`, or `4h`. | Keeps v1 measurable in the intended short-cycle feedback loop and excludes ultra-low-frequency validation windows. |
| Horizon fallback | If candidate semantics do not clearly select a horizon, `InsightExplorationGraph` uses `2m`. | Keeps the short-cycle loop moving without falling back to longer low-signal windows. |
| Evidence source | `OutcomeGraph` may load fresh compact evidence via a white-listed `Evidence Loader` before labeling due outcomes. | Labeling should reflect the current short-cycle evidence window, not only stale candidate payloads. |
| Evidence scope | `Evidence Loader` may use the same `symbol` plus market benchmark or index context. | Keeps the evidence window bounded and comparable without letting `OutcomeGraph` choose arbitrary sources. |
| Evidence summary length | Compact evidence summaries should stay within `15` lines. | Keeps the label-time evidence readable without turning it into a long report. |

## Handoff Contract

### Module Boundaries

These are separate task modules and should be treated as separate implementation
units:

- `OutcomeGraph`
- `EvaluationGraph`
- `InsightExplorationGraph`
- `AlphaResearchGraph`

Do not collapse them into a single generic feedback module. Keep each module's
scope, tasks, and verification surface separate.

### Source Types

Feedback-loop v1 supports exactly two source types:

```text
decision
insight_candidate
```

It does not support alpha candidates, market judgments, model-learning
experiments, workflow drafts, or arbitrary future source types.

### Outcome Types

`DecisionOutcome` remains the outcome for model or override path decisions.

`InsightCandidateOutcome` is the outcome for an `InsightCandidate`. It observes
whether a candidate insight was supported, contradicted, still neutral, invalid,
or blocked by insufficient data over a defined horizon.

v1 must not store insight candidate outcomes by stuffing them into
`decision_outcomes.decision_id`. Durable insight candidate outcomes use the
narrow `InsightCandidateOutcome` backend contract only.

### InsightCandidateOutcome Scheduling

Q62 B is confirmed. The primary scheduler is `InsightExplorationGraph`: after it
persists an `InsightCandidate`, it schedules the matching
`InsightCandidateOutcome` through:

```text
POST /insight-candidate-outcomes/schedule
```

The schedule payload should stay bounded to:

```text
insight_id
symbol
horizon
evidence_refs
reason_codes
outcome_json
```

The normal caller supplies `horizon`, not arbitrary due timestamps. The backend
persists `due_at` as `scheduled_at + horizon`. Manual or admin recovery may
override `due_at` only with an explicit reason code; this is not the primary v1
path.

`OutcomeGraph` must not scan unscheduled `InsightCandidate` records or decide
which new insight candidate outcomes to observe. It fetches due
`InsightCandidateOutcome` records, labels them, and emits summaries.

### Horizon Contract

Q63 B is confirmed. Each `InsightCandidate` must carry exactly one horizon:

```text
1m
2m
5m
30m
1h
2h
4h
```

`InsightExplorationGraph` chooses the horizon from the candidate's origin,
thesis, and expected evidence cadence:

- `1m`, `2m`, or `5m` for immediate microstructure, momentum, or anomaly checks;
- `2m` as the fallback when the candidate semantics do not clearly select a
  different horizon;
- `30m` for slower intraday validation when the candidate explicitly needs a
  longer short-cycle window;
- `1h`, `2h`, or `4h` for slower intraday confirmation.

`InsightCandidate` has no implicit daily or monthly fallback in v1. If the
workflow cannot select one of the allowed horizons from explicit semantics, it
must use `2m` rather than inventing a custom window.

`OutcomeGraph` treats the horizon as an existing outcome attribute. It must not
change horizon selection when labeling due outcomes.

### InsightCandidateOutcome Backend API

Q60 B is confirmed. T010 should add exactly five minimal backend APIs:

```text
POST /insight-candidate-outcomes/schedule
GET  /insight-candidate-outcomes/due
POST /insight-candidate-outcomes/{outcome_id}/label
GET  /insight-candidate-outcomes
GET  /insight-candidate-outcomes/{outcome_id}
```

These APIs are only for scheduling, listing, reading, and labeling
`InsightCandidateOutcome` records. They must not activate insights, promote
rules, create alpha candidates, or define a generic outcome system.

### Normalized Outcome Label

Each finalized outcome should expose a normalized label:

```text
hit
miss
neutral
invalid
insufficient_data
```

The source-specific raw label may remain available as `source_label` or a
reason code, but downstream aggregation should use the normalized label.

Each outcome summary should also expose bounded metrics:

```text
return_pct
relative_return_pct
max_drawdown_pct
realized_volatility
horizon_minutes
```

Metrics may be `null` when not applicable or not available.

Each outcome must include:

```text
reason_codes[]
evidence_refs[]
```

Reason codes are bounded strings such as:

```text
target_hit
invalidation_hit
underperformed_benchmark
insufficient_market_bars
candidate_contradicted
candidate_supported
data_window_incomplete
```

## Graph Contracts

### OutcomeGraph v1

Responsibilities:

- fetch due decision outcomes;
- fetch due insight candidate outcomes through the five minimal APIs;
- when needed, call a white-listed `Evidence Loader` to produce a compact
  evidence summary before labeling, using the same `symbol` plus benchmark or
  index context;
- label outcomes with normalized labels and bounded metrics;
- emit counts by source type, status, and normalized label;
- preserve source-specific details in bounded JSON, not raw data blobs.

Non-responsibilities:

- no context snapshot mutation;
- no rule activation;
- no model promotion;
- no AlphaResearchGraph execution;
- no decision about which unscheduled insight candidates should receive
  outcomes;
- no unbounded raw evidence crawling or direct raw-data ingestion;
- no arbitrary dynamic source selection for evidence loading;
- no generic future `TrackedOutcome` abstraction.

### EvaluationGraph v1

Responsibilities:

- aggregate decision outcome performance;
- aggregate insight candidate outcome performance;
- emit strengths, weaknesses, failure modes, and data gaps;
- include evidence refs for follow-up research;
- persist a bounded `EvaluationReport`.

Non-responsibilities:

- no automatic model promotion;
- no active RulePack mutation;
- no direct generation of `RuleCandidate`;
- no rewriting outcomes or context snapshots.

### InsightExplorationGraph v1

Responsibilities:

- consume `EvaluationReport`, context snapshot summaries, and outcome labels;
- generate bounded `InsightCandidate` records;
- schedule `InsightCandidateOutcome` records after persisting
  `InsightCandidate` records;
- keep evidence refs and weight caps;
- explain whether the candidate came from a failure mode, positive pattern, or
  data gap.

Non-responsibilities:

- no raw market/news data ingestion;
- no direct `RuleCandidate` generation;
- no automatic lesson activation;
- no trading, training, promotion, or policy mutation.

## Operator Surface

The first implementation phase should stay minimal:

```text
outcomes run --due --json
eval summary --json
insights explore --symbol SYMBOL --window 4h --json
```

New inspection output should be bounded summaries, not a new UI. CLI/TUI and
LangGraph Web UI improvements can reuse these summaries later.

## Implementation Tasks

Use these active task artifacts:

```text
.agent-dev/specs/workflow-feedback-loop-maturity-v1/clarification-questions.md
.agent-dev/tasks/T010-outcome-graph-maturity-v1.json
.agent-dev/tasks/T010-outcome-graph-maturity-v1.md
.agent-dev/tasks/T011-evaluation-graph-maturity-v1.json
.agent-dev/tasks/T011-evaluation-graph-maturity-v1.md
.agent-dev/tasks/T012-insight-exploration-graph-maturity-v1.json
.agent-dev/tasks/T012-insight-exploration-graph-maturity-v1.md
```

Implementation order:

```text
T010 OutcomeGraph maturity v1
-> T011 EvaluationGraph maturity v1
-> T012 InsightExplorationGraph maturity v1
-> AlphaResearchGraph v0 spec
```

## Non-Goals

- No AlphaResearchGraph implementation.
- No ReflectionGraph implementation.
- No native LangGraph migration for these three graphs in v1.
- No broker or paper execution.
- No active RulePack mutation.
- No automatic model promotion or switching.
- No workflow builder.
- No custom UI or React Flow editor.
- No raw evidence browser.
- No generic future-source `TrackedOutcome` abstraction.

## Acceptance

1. The feedback-loop spec defines source types, handoff order, scheduling
   owner, outcome labels, evaluation report shape, and insight candidate input
   shape.
2. `OutcomeGraph` task has a concrete implementation plan, file scope,
   forbidden scope, and verification mapping.
3. `EvaluationGraph` task has a concrete implementation plan, file scope,
   forbidden scope, and verification mapping.
4. `InsightExplorationGraph` task has a concrete implementation plan, file
   scope, forbidden scope, and verification mapping.
5. The plan does not pull `AlphaResearchGraph`, native graph migration, custom
   UI, execution, RulePack mutation, or automatic promotion into v1.

## Verification

Planning/document gates:

```text
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/workflow-feedback-loop-maturity-v1/spec.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/workflow-feedback-loop-maturity-v1/decision-record.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/workflow-feedback-loop-maturity-v1/clarification-questions.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/tasks/T010-outcome-graph-maturity-v1.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/tasks/T011-evaluation-graph-maturity-v1.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/tasks/T012-insight-exploration-graph-maturity-v1.json | ConvertFrom-Json | Out-Null
git diff --check -- .agent-dev/specs/workflow-feedback-loop-maturity-v1 .agent-dev/tasks project-docs/backlog
node --test test/docs-ai-context.test.mjs
```

Implementation gates are listed in each task.
