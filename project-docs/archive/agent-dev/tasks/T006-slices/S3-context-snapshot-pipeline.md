# S3 Context Snapshot Pipeline

## Goal

Implement the workflow-side context builder that converts existing intel data into weighted immutable context snapshots.

## Scope

- Add `apps/trader-workflows/src/services/contextSnapshots.ts`.
- Add `apps/trader-workflows/src/services/contextSnapshots.test.ts`.
- Read existing `/api/intel/context/build` output and convert it into `WeightedContextItem[]`.
- Persist `ContextSnapshot` through the Stage 1 backend API from S2.

## API Rules

- Use `apps/trader-workflows/src/api/client.ts`; do not import `apps/trader-cli/src/api/client.ts`.
- Persist through `POST /api/intel/stage1/context-snapshots`.
- Repeated same snapshot payload must be idempotent.
- Snapshot conflict must surface backend `409` instead of silently rewriting historical context.

## Exit Criteria

- Raw evidence is represented by `evidence_ref`, not embedded as large raw objects.
- Each item includes confidence, relevance weight, freshness weight, source-quality weight, and verification status.
- Weighting uses rule base + capped LLM rerank placeholder/interface; pure LLM final weights are not allowed.
- Historical `ContextSnapshot` records are immutable.

## Verification

Run `V202` from `.agent-dev/specs/self-evolving-agent-stage1/spec.json`.

## Non-goals

- No new raw evidence ingestion schema.
- No OCR/image processing implementation in this slice.
- No DecisionGraph.
