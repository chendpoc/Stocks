# S4 DecisionGraph v0

## Goal

Implement `DecisionGraph v0` in `apps/trader-workflows`, using immutable `ContextSnapshot` input and persisting immutable `DecisionEnvelope` output.

## Scope

- Add `apps/trader-workflows/src/graphs/decisionGraph.ts`.
- Add `apps/trader-workflows/src/graphs/decisionGraph.test.ts`.
- Add `apps/trader-workflows/src/services/decisions.ts`.
- Add `apps/trader-workflows/src/llm/provider.ts`.
- Add `apps/trader-workflows/src/llm/decisionEnvelope.ts`.
- Add thin `trader decide SYMBOL` wrapper in `apps/trader-cli`.

## Frozen Contracts

- DecisionGraph uses `apps/trader-workflows/src/llm/provider.ts`.
- The workflow provider may reuse env names `LLM_PROVIDER`, `LLM_API_KEY`, `OPENAI_API_KEY`, `LLM_MODEL`, and `LLM_BASE_URL`.
- Do not import `apps/trader-cli/src/llm/provider.ts`.
- Persist decisions through `POST /api/intel/stage1/model-decisions`.
- Schedule outcome horizons through `POST /api/intel/stage1/decision-outcomes/schedule`.
- For every persisted decision, pre-create pending outcome rows for `30m`, `1h`, `EOD`, `1d`, `3d` and `model_path`; if a HumanOverride is present later, outcome scheduling for `override_path` is append-only and must not alter `model_path`.
- `trader decide SYMBOL --json` maps to workflow command `decide SYMBOL --json` and returns the workflow JSON envelope.

## Exit Criteria

- `DecisionEnvelope` validation enforces the Stage 1 action set.
- Action-specific plan requirements are enforced:
  - `NO_TRADE`: no trade plan required.
  - `WATCH`: watch condition required.
  - `WAIT_TRIGGER`: trigger + invalidation required.
  - `PAPER_ENTER_CANDIDATE`: trigger + invalidation + target plan required.
  - `PAPER_EXIT_CANDIDATE`: exit rationale + invalidation/hold condition required.
- `PAPER_*_CANDIDATE` is persisted but never submits paper orders.
- Outcome horizons are scheduled as pending `decision_outcomes` rows for `30m`, `1h`, `EOD`, `1d`, `3d`.

## Verification

Run `V204` from `.agent-dev/specs/self-evolving-agent-stage1/spec.json`.

## Non-goals

- No outcome labeling.
- No paper execution.
- No TUI.
