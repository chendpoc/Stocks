# Future Task: Graph Node Simplification

Status: future cleanup note

> **Authority:** For AlphaResearchGraph v0, [`.agent-dev/specs/alpha-research-graph/spec.md`](../.agent-dev/specs/alpha-research-graph/spec.md) is authoritative. This note is non-normative. `finalize_alpha_research_result` and similar helpers are output assembly, not graph nodes unless the spec adds them.

Origin: architecture review during `T013 AlphaResearchGraph v0` planning.

## Purpose

Record a future cleanup task for reducing unnecessary graph nodes in
`apps/trader-workflows`.

This is a planning note only. It does not authorize immediate refactoring,
runtime behavior changes, node renaming, or test rewrites.

## Node Boundary Rule

Keep a step as a graph node when it is a real workflow boundary:

- external I/O or persistence;
- LLM or agentic work;
- long-running or retry-worthy operation;
- validation or policy gate with its own failure semantics;
- artifact, audit event, or recovery boundary.

Move a step out of the graph when it is only:

- input defaulting or casing;
- pure field mapping;
- state-to-result conversion;
- an empty final output placeholder;
- a helper with no independent failure or retry semantics.

## Current Graph Observations

### DecisionGraph

Current shape:

```text
normalize_input
-> build_context_snapshot
-> generate_decision_envelope
-> validate_decision_envelope
-> persist_model_decision
-> schedule_model_path_outcomes
-> final_output
```

Likely useful nodes:

- `build_context_snapshot`
- `generate_decision_envelope`
- `validate_decision_envelope`, if it remains a real validation gate
- `persist_model_decision`
- `schedule_model_path_outcomes`

Likely cleanup candidates:

- `normalize_input`: move to runner or typed input adapter.
- `final_output`: remove if it only returns fixed flags.

Future target shape:

```text
build_context_snapshot
-> generate_decision_envelope
-> validate_decision_envelope
-> persist_model_decision
-> schedule_model_path_outcomes
```

### OutcomeGraph

Current shape:

```text
normalize_input
-> fetch_due_outcomes
-> label_decision_outcomes
-> label_insight_outcomes
-> final_output
```

Likely useful nodes:

- `fetch_due_outcomes`
- outcome labeling, if source-specific labeling needs separate audit/retry
  boundaries.

Likely cleanup candidates:

- `normalize_input`: move to runner or typed input adapter.
- `final_output`: demote count aggregation to a pure helper.
- `label_decision_outcomes` and `label_insight_outcomes`: consider merging into
  one `label_due_outcomes` node unless source-specific policies diverge.

Future target shape:

```text
fetch_due_outcomes
-> label_due_outcomes
```

Keep `aggregateOutcomeGraphCounts` as a pure helper unless it starts producing a
durable artifact.

### EvaluationGraph

Current shape:

```text
normalize_input
-> build_evaluation_report
-> persist_evaluation_report
-> final_output
```

Likely useful nodes:

- `build_evaluation_report`
- `persist_evaluation_report`

Likely cleanup candidates:

- `normalize_input`: move to runner or typed input adapter.
- `final_output`: remove if it stays empty.

Future target shape:

```text
build_evaluation_report
-> persist_evaluation_report
```

If EvaluationGraph does not gain validation, approval, or artifact gates, it may
remain closer to a service pipeline than a complex graph.

### InsightExplorationGraph

Current shape:

```text
normalize_input
-> fetch_exploration_inputs
-> run_insight_react
-> build_insight_payload
-> persist_insight_candidate
-> final_output
```

Likely useful nodes:

- `fetch_exploration_inputs`
- `run_insight_react`
- `persist_insight_candidate`

Likely cleanup candidates:

- `normalize_input`: move to runner or typed input adapter.
- `build_insight_payload`: demote to a pure helper unless it becomes a durable
  artifact boundary.
- `final_output`: remove if it stays empty.

Potential improvement:

- Split `persist_insight_candidate` and `schedule_insight_candidate_outcome` if
  retry and recovery semantics need a first-class graph boundary.

Future target shape:

```text
fetch_exploration_inputs
-> run_insight_react
-> persist_insight_candidate
-> schedule_insight_candidate_outcome
```

Keep `buildInsightCandidatePayload` as a deterministic helper. If `alpha_seed`
is added, it should be part of that helper's contract, not a new graph node by
default.

## AlphaResearchGraph v0 Guidance

Use the cleanup lesson before adding new nodes.

Do not add these nodes:

- `load_insight_candidate`
- `hydrate_context`
- `normalize_alpha_candidate`
- LLM wording or refinement
- context backfill or missing-field repair

Preferred v0 graph shape:

```text
AlphaResearchGraph(AlphaResearchInputPacket)

validate_alpha_input_packet
-> create_rule_candidate
-> run_lite_backtest
-> finalize_alpha_research_result
```

`AlphaResearchInputPacket` should be prepared before graph invocation. A CLI or
service adapter may provide `insight_id` convenience loading, but the graph
itself should consume the standard packet shape.

Use pure helpers for mapping:

```text
buildRuleCandidateRequest(packet)
```

The helper must not invent missing trigger, invalidation, evidence, family, or
backtest fields.

## Non-Goals

- No immediate cleanup during `T013` unless explicitly approved.
- No broad graph runtime migration.
- No behavior change in existing CLI commands.
- No removal of tests without replacement.
- No new product scope, backend API, UI, RulePack activation, or model
  promotion.

## Suggested Future Cleanup Task

Create a dedicated cleanup task only after the current AlphaResearchGraph slice
is stable.

Suggested scope:

1. Move graph input normalization into runners or typed input adapters.
2. Remove empty `final_output` nodes.
3. Demote pure field mapping nodes to helpers.
4. Keep validation nodes only when they emit a validation artifact, audit event,
   or distinct terminal state.
5. Revisit OutcomeGraph source-specific labeling only if source policies need
   separate retry or audit boundaries.
6. Revisit InsightExplorationGraph persist/schedule split only if recovery
   semantics justify it.

Acceptance criteria:

- Existing behavior remains unchanged.
- Public run result shapes remain compatible.
- Node-name tests and docs are updated intentionally.
- Workflow package tests pass.
- The cleanup does not introduce new graph responsibilities.

Verification:

```text
cd apps/trader-workflows && npm test
git diff --check -- apps/trader-workflows
```
