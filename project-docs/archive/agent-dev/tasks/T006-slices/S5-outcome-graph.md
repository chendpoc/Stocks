# S5 OutcomeGraph v0

## Goal

Implement `OutcomeGraph v0` to label due decisions across fixed horizons.

## Scope

- Add `apps/trader-workflows/src/graphs/outcomeGraph.ts`.
- Add `apps/trader-workflows/src/graphs/outcomeGraph.test.ts`.
- Add `apps/trader-workflows/src/services/outcomes.ts`.
- Add `apps/trader-workflows/src/services/outcomes.test.ts`.
- Add thin `trader outcomes run --due` wrapper in `apps/trader-cli`.

## API/CLI Contract

- Read due pending outcomes through `GET /api/intel/stage1/decision-outcomes/due?now=&limit=&symbol=`.
- Persist labels through `POST /api/intel/stage1/decision-outcomes/{outcome_id}/label`.
- Unique domain key is `decision_id + horizon + path`.
- `path` is `model_path` or `override_path`.
- Only rows with `status=pending` can be labeled.
- Final rows with `status=labeled`, `skipped`, or `failed` cannot be relabeled or rewritten.
- `trader outcomes run --due --json` maps to workflow command `outcomes run --due --json`.

## Exit Criteria

- Supports `30m`, `1h`, `EOD`, `1d`, `3d`.
- Calculates absolute return, benchmark return, relative return, invalidation proxy, target proxy, and final label.
- Labels are deterministic for the same market data snapshot.
- Pending rows transition exactly once to `labeled`, `skipped`, or `failed`.
- Outcome processing does not mutate historical `ContextSnapshot`.

## Verification

Run `V205` from `.agent-dev/specs/self-evolving-agent-stage1/spec.json`.

## Non-goals

- No paper P&L.
- No broker mirror.
- No promotion recommendation.
