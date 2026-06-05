# Clarification Questions

## Q68: Should T013 be pure spec gate only?

**Category**: scope_boundary

**Decision**: No. T013 covers M1, M2, and M3.

## Q69: Should T013 still enforce M1 -> M2 -> M3 internally?

**Category**: architecture

**Decision**: Yes. T013 is one task, but the internal milestones remain strictly
serial.

## Q70: What is the v0 input shape?

**Category**: data_model

**Decision**: Use a standard `AlphaResearchInput` containing `insight_id`,
`symbol`, `thesis`, `evidence_refs`, `alpha_seed`, and backtest window fields.
The graph does not hydrate context from `insight_id`.

## Q71: What happens when required input data is missing?

**Category**: risk

**Decision**: Emit `input_validation_failed` with a validation report. Do not
create a rule candidate and do not run lite backtest.

## Q72: Should InsightCandidate include alpha-ready seed data?

**Category**: data_model

**Decision**: Yes. T013 may add minimal `candidate_json.alpha_seed.v1` hints to
new `InsightCandidate` records.

## Q73: Who generates alpha_seed?

**Category**: architecture

**Decision**: `InsightExplorationGraph` generates seed hints. It does not create
`RuleCandidate`; AlphaResearchGraph validates and maps the seed to the backend
request.

## Q74: Should alpha_seed be perfect before persistence?

**Category**: data_model

**Decision**: The ideal is complete enough for v0 validation. Engineering
enforces the boundary with validation reports rather than complex recovery
flows.

## Q75: Should AlphaResearchGraph have a load/hydrate node?

**Category**: architecture

**Decision**: No. Hydration is not a graph node in v0.

## Q76: How does workflow call Rule Discovery / Lite Backtest?

**Category**: api_contract

**Decision**: Through a minimal backend HTTP API wrapper.

## Q77: Is missing critical seed/context a normal needs_more_data branch?

**Category**: risk

**Decision**: No. It is an input validation failure and should stop before the
next stage.

## Q78: What is the validation failure status?

**Category**: naming

**Decision**: `input_validation_failed`.

## Q79: Does v0 need deterministic normalization as a graph node?

**Category**: architecture

**Decision**: No. Field mapping is a thin function used by
`create_rule_candidate`, not its own node.

## Q80: Does v0 need LLM wording or fallback?

**Category**: architecture

**Decision**: No.

## Q81: Does T013 modify InsightExplorationGraph?

**Category**: scope_boundary

**Decision**: Yes, only to add minimal `alpha_seed.v1` hints to new
`InsightCandidate` payloads.

## Q82: What is the final v0 node set?

**Category**: architecture

**Decision**: `validate_input -> create_rule_candidate -> run_lite_backtest`.

## Q83: Where does the v1 research-agent plan live?

**Category**: scope_boundary

**Decision**: As a separate Later backlog item:
`project-docs/backlog/later/alpha-research-agent-v1.md`.
