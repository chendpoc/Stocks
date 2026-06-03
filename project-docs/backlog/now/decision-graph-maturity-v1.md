# DecisionGraph Maturity v1

Status: Now

## Progress (T090)

| Slice | Status |
|---|---|
| S2 Bounded `context_snapshot` in `runs show` | done |
| S3 Read-only `context snapshots list/show` | done |
| S4 Workflow docs (CLI envelope) | done |

## Requirement

Make `DecisionGraph` the first mature workflow before expanding
`AlphaResearchGraph`.

The target is a reviewable decision workflow, not a complete trading system.
Each run should make clear which context snapshot was used, how that context was
constructed, what decision was produced, and which outcomes were scheduled.

## Source

- [Workflow maturity roadmap](../workflow-maturity-roadmap.md)
- [Ubiquitous language](../../../UBIQUITOUS_LANGUAGE.md)
- [Trader Workflows README](../../../apps/trader-workflows/README.md)

## Entry Note

`DecisionGraph` is already a native LangGraph graph and the right first workflow
to harden for CLI and LangGraph Web UI inspection.

## Boundary

The existing DecisionGraph topology remains valid. This slice hardens
`build_context_snapshot`; it does not add a new graph node, storage table,
DataReadiness system, risk policy, or AlphaResearchGraph implementation.

`build_context_snapshot` should become reviewable, reproducible, and
explainable before the project expands additional workflow graphs.

## Current Graph Shape

```text
normalize_input
-> build_context_snapshot
-> generate_decision_envelope
-> validate_decision_envelope
-> persist_model_decision
-> schedule_model_path_outcomes
-> final_output
```

## First Slice

Use `build_context_snapshot` as the first maturity slice:

- input is clear: `symbol`, `taskType`, and `asof_ts`;
- source mapping is clear: `market_data`, `benchmark`, `signals`, `events`,
  `lessons`, `corpus`, `patterns`, and `related_hypotheses`;
- output is clear: `weighted_context_items`, `evidence_refs`, `context_hash`,
  and `snapshot_id`;
- weights are explainable through relevance, freshness, source quality,
  confidence, and composite weight fields;
- context hash is stable for identical weighted items;
- empty-source behavior is explicit and tested.

## Operator Surface

First-slice inspection is intentionally small:

- `runs show` should expose the run's context snapshot summary.
- `context snapshots list` should list snapshot identity and counts.
- `context snapshots show` should show source-type counts and top weighted item
  summaries.

Do not add a custom UI, new table, full raw data browser, evidence resolver, or
artifact store in this slice.

## Next Action

Operator CLI for the first slice is documented in
[Trader Workflows README](../../../apps/trader-workflows/README.md) (`runs show`
`context_snapshot` field; `context snapshots list/show`).

Remaining maturity work (if any) stays in
`../../../.agent-dev/specs/decision-graph-maturity-v1/spec.md` — e.g. focused
`build_context_snapshot` contract tests and LangGraph Studio scoped to
`decision_graph`.
