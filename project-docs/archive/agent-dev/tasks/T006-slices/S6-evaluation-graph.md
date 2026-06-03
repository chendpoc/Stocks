# S6 EvaluationGraph v0

## Goal

Implement `EvaluationGraph v0` to aggregate outcomes and emit a current-model promotion recommendation without automatic model switching.

## Scope

- Add `apps/trader-workflows/src/graphs/evaluationGraph.ts`.
- Add `apps/trader-workflows/src/graphs/evaluationGraph.test.ts`.
- Add `apps/trader-workflows/src/services/evaluation.ts`.
- Add `apps/trader-workflows/src/services/evaluation.test.ts`.
- Add thin `trader eval summary` wrapper in `apps/trader-cli`.

## API/CLI Contract

- Read outcomes through `GET /api/intel/stage1/decision-outcomes?decision_id=&symbol=&limit=`.
- Persist reports through `POST /api/intel/stage1/evaluation-reports`.
- `recommendation` must be `hold` or `needs_more_data`.
- `trader eval summary --json` maps to workflow command `eval summary --json`.

## Exit Criteria

- Reports `model_path` metrics separately from `override_path` metrics.
- Reports `delta_human_value`.
- Emits only `hold` or `needs_more_data` in Stage 1.
- Does not require challenger comparison.
- Does not auto-promote or change model configuration.

## Verification

Run `V206` from `.agent-dev/specs/self-evolving-agent-stage1/spec.json`.

## Non-goals

- No automatic promotion.
- No model registry.
- No training.
