# T090: DecisionGraph Maturity v1

Status: pending

Spec: `.agent-dev/specs/decision-graph-maturity-v1/spec.md`

## Goal

Make `DecisionGraph` reviewable and reproducible by hardening its context
snapshot data-processing contract.

This is a development task specification. It does not implement code.

## Current Implementation

`DecisionGraph` already exists as the first native LangGraph workflow in
`apps/trader-workflows`.

The current gap is not graph shape. The gap is the context snapshot contract:

- source mapping must be explicit and stable;
- empty input must still produce a stable snapshot;
- evidence refs must be deduped;
- `runs show` needs a bounded snapshot summary;
- read-only context snapshot inspection is missing.

## Implementation Plan

### S1: Context Snapshot Contract

Harden `build_context_snapshot` so it persists a stable context snapshot with:

- `symbol`, `taskType`, and `asof_ts` as the input boundary;
- explicit source mapping for `market_data`, `benchmark`, `signals`,
  `events`, `lessons`, `corpus`, `patterns`, and `related_hypotheses`;
- `weighted_context_items`, `evidence_refs`, and `context_hash` in the output;
- stable behavior for empty source data;
- evidence ref dedupe by `ref_type + ref_id`.

### S2: Run Summary

Expose a bounded context snapshot summary through `runs show --json` so operators
can inspect what context was used without querying raw payloads.

### S3: Read-Only Snapshot Inspection

Add read-only `context snapshots list/show` commands for bounded inspection of
stored snapshots.

### S4: Docs

Update workflow docs only if the CLI output envelope changes.

## Allowed Files

- `apps/trader-workflows/src/services/contextSnapshots.ts`
- `apps/trader-workflows/src/services/contextSnapshots.test.ts`
- `apps/trader-workflows/src/runtime/stage1Runtime.ts`
- `apps/trader-workflows/src/runtime/stage1Runtime.test.ts`
- `apps/trader-workflows/src/cli.ts`
- `apps/trader-workflows/src/cli.test.ts`
- `apps/trader-workflows/README.md`
- `apps/trader-workflows/README.zh-CN.md`
- `project-docs/backlog/now/decision-graph-maturity-v1.md`

## Forbidden

- No new graph node topology.
- No new storage table for a readiness system.
- No data-readiness gate.
- No AlphaResearchGraph implementation.
- No OutcomeGraph, EvaluationGraph, or InsightExplorationGraph migration.
- No custom workflow UI.

## Verification

```text
cd apps/trader-workflows && npm test -- src/services/contextSnapshots.test.ts src/runtime/stage1Runtime.test.ts src/cli.test.ts
cd apps/trader-workflows && npm run studio
```
