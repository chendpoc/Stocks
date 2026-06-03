# S7 InsightExplorationGraph v0

## Goal

Implement controlled ReAct exploration that can propose unverified market mechanisms as `InsightCandidate`.

## Scope

- Add `apps/trader-workflows/src/graphs/insightExplorationGraph.ts`.
- Add `apps/trader-workflows/src/graphs/insightExplorationGraph.test.ts`.
- Add `apps/trader-workflows/src/services/insightCandidates.ts`.
- Add `apps/trader-workflows/src/services/insightCandidates.test.ts`.
- Add thin `trader insights explore` wrapper in `apps/trader-cli`.

## API/CLI Contract

- Use workflow-owned `apps/trader-workflows/src/llm/provider.ts`; do not import CLI provider.
- Query context/outcome history through Stage 1 backend API and workflow services.
- Persist candidates through `POST /api/intel/stage1/insight-candidates`.
- `trader insights explore --symbol SYMBOL --window WINDOW --json` maps to workflow command `insights explore --symbol SYMBOL --window WINDOW --json`.

## Exit Criteria

- ReAct can query weighted context and historical outcomes.
- Output is persisted as `InsightCandidate` with evidence refs and verification status.
- The graph cannot create `AcceptedLesson`.
- The graph cannot trade, train, promote, or raise candidate insight weight above accepted evidence limits.

## Verification

Run `V207` from `.agent-dev/specs/self-evolving-agent-stage1/spec.json`.

## Non-goals

- No AcceptedLesson promotion.
- No automatic training.
- No trading.
