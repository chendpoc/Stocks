# DecisionGraph Maturity v1

Status: done

## Progress (T090)

| Slice | Status |
|---|---|
| S1 Context snapshot contract tests | done |
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

`build_context_snapshot` is reviewable, reproducible, and explainable enough for
the current workflow maturity phase.

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

The `build_context_snapshot` maturity slice now has:

- clear input boundary: `symbol`, `taskType`, and `asof_ts`;
- clear source mapping: `market_data`, `benchmark`, `signals`, `events`,
  `lessons`, `corpus`, `patterns`, and `related_hypotheses`;
- clear output: `weighted_context_items`, `evidence_refs`, `context_hash`, and
  `snapshot_id`;
- explainable weights through relevance, freshness, source quality, confidence,
  and composite weight fields;
- stable context hash for identical weighted items;
- explicit, tested empty-source behavior;
- evidence ref dedupe by `ref_type + ref_id`.

## Operator Surface

First-slice inspection is intentionally small:

- `runs show` exposes the run's context snapshot summary.
- `context snapshots list` lists snapshot identity and counts.
- `context snapshots show` shows source-type counts and top weighted item
  summaries.

Do not add a custom UI, new table, full raw data browser, evidence resolver, or
artifact store in this slice.

## Out of Scope (v1)

- Backend **1m** fetch, intraday bar wiring into weighted context, and
  minute-level pattern discovery. DecisionGraph may **cite** intraday summaries
  later; it is not the owner for 1m ingestion. See
  [Intraday 1m context and minute-level analysis](../later/intraday-1m-context-and-minute-analysis.md).

## Next Action

Use `.agent-dev/specs/decision-graph-maturity-v1/` and
`.agent-dev/tasks/T090-decision-graph-maturity-v1.md` as the current
DecisionGraph maturity evidence. Do not restart T090 from this backlog entry.
