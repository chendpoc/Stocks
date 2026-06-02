# S2 Domain Schema/API

## Goal

Add Stage 1 domain facts to `market_intel.db` and expose backend API endpoints for workflow-side reads/writes. This slice owns trading-domain persistence only; it must not contain LangGraph runtime state.

## Scope

- Modify `apps/trader-agent/backend/app/intel/db/schema.py`.
- Add `apps/trader-agent/backend/app/intel/api/stage1.py`.
- Mount the API in `apps/trader-agent/backend/app/intel/api/__init__.py`.
- Add `apps/trader-agent/backend/tests/test_intel_stage1_schema_api.py`.

## Domain Tables

- `context_snapshots`
- `model_decisions`
- `decision_outcomes`
- `insight_candidates`
- `evaluation_reports`
- `weighting_policy_stats`

## API Contract

Base path: `/api/intel/stage1`.

Required routes:

- `POST /context-snapshots`
- `GET /context-snapshots/{snapshot_id}`
- `GET /context-snapshots?symbol=&limit=`
- `POST /model-decisions`
- `GET /model-decisions/{decision_id}`
- `GET /model-decisions?symbol=&model_version=&limit=`
- `POST /model-decisions/{decision_id}/human-overrides`
- `POST /decision-outcomes/schedule`
- `GET /decision-outcomes/due?now=&limit=&symbol=`
- `POST /decision-outcomes/{outcome_id}/label`
- `GET /decision-outcomes?decision_id=&symbol=&status=&limit=`
- `POST /insight-candidates`
- `GET /insight-candidates/{insight_id}`
- `GET /insight-candidates?symbol=&verification_status=&limit=`
- `POST /evaluation-reports`
- `GET /evaluation-reports/{report_id}`
- `GET /evaluation-reports?model_version=&limit=`
- `GET /weighting-policy-stats`
- `POST /weighting-policy-stats`

Write rules:

- Create endpoints accept deterministic ids or idempotency keys.
- Same id + same immutable payload returns the existing record.
- Same id + different immutable payload returns `409`.
- Original `DecisionEnvelope` and historical `ContextSnapshot` records are immutable.
- `human_overrides_json` is append-only and must not replace `decision_json`.
- `decision_outcomes` rows are pre-created as `status=pending` by DecisionGraph.
- OutcomeGraph can finalize pending rows to `labeled`, `skipped`, or `failed`; final rows cannot be relabeled.
- `decision_outcomes` unique key is `decision_id + horizon + path`; fields include `symbol`, `status`, `due_at`, `scheduled_at`, `updated_at`, and optional `labeled_at`.

## Exit Criteria

- Tables are lazy-created in `market_intel.db`.
- API supports create/list/detail paths needed by workflow services.
- Tests cover route shape, idempotent duplicate writes, immutable conflict `409`, and no checkpoint fields in domain tables.
- No legacy `hypotheses` / `predictions` writes are added.
- No LangGraph checkpoint fields are stored in domain tables.

## Verification

Run `V201` from `.agent-dev/specs/self-evolving-agent-stage1/spec.json`.

## Non-goals

- No workflow runtime.
- No model calls.
- No TUI.
- No paper execution or broker mirror.
