# T013: AlphaResearchGraph v0

Status: done

Spec: `.agent-dev/specs/alpha-research-graph/spec.md`

Depends on: `T012 InsightExplorationGraph Maturity v1`

Readiness gate: T012 must be `done`; AlphaResearchAgent v1 research-agent plan
must remain separate from this task.

## Goal

Implement the first end-to-end alpha validation chain:

```text
AlphaResearchInput
-> validate_input
-> create_rule_candidate
-> run_lite_backtest
-> RuleCandidate + LiteBacktestReport + safe review state
```

T013 covers M1, M2, and M3, but these milestones are strictly serial inside the
task.

## Milestone ↔ Step Map

| Milestone | Step | Scope |
|---|---|---|
| M1 Spec gate | S1 | Spec/task/backlog docs only |
| M2 Backend API | S2 | `rule_candidates.py` HTTP wrapper |
| M3 alpha_seed | S3 | `buildInsightCandidatePayload` heuristic seed |
| M3 graph + client | S4 | `alphaResearch.ts` + `04-alphaResearch` graph |
| M3 export | S5 | `langgraph.json`, README, `index.ts` (no CLI) |

## Allowed Files

Create/modify only paths listed in `T013-alpha-research-graph-v0.json`
`files_expected` per step plus `spec.json` `scope`. Do not touch forbidden
paths (`trader-cli`, RulePack, execution, broker modules).

## M1: Spec Gate (S1)

Confirm and keep current:

- `.agent-dev/specs/alpha-research-graph/spec.md`
- `.agent-dev/specs/alpha-research-graph/spec.json`
- `.agent-dev/specs/alpha-research-graph/decision-record.json`
- `.agent-dev/specs/alpha-research-graph/clarification-questions.md`
- `.agent-dev/specs/alpha-research-graph/clarification-questions.json`
- `.agent-dev/tasks/README.md`
- `project-docs/backlog/README.md`
- `project-docs/backlog/now/alpha-research-graph-spec.md`
- `project-docs/backlog/later/alpha-research-agent-v1.md`
- `apps/trader-workflows/GRAPH_NODE_CLEANUP_TASK.md` (T013 authority note)

Exit criteria:

- JSON files parse (V201).
- Plan review gaps P001–P006 closed in spec.
- Review confirms v0 is not a research agent.
- Review confirms v1 is a Later backlog item.

## M2: Backend Minimal API Slice (S2)

Expose the minimal HTTP API wrapper for Rule Discovery / Lite Backtest:

```text
POST /api/rule-candidates
GET  /api/rule-candidates/{candidate_id}
POST /api/rule-candidates/{candidate_id}/evidence-requirements
POST /api/rule-candidates/{candidate_id}/lite-backtest
POST /api/rule-candidates/{candidate_id}/advance
GET  /api/rule-candidates/{candidate_id}/lite-backtest-report
```

Mount: `prefix="/api/rule-candidates"` in `main.py`.

Implementation guidance:

- Wrap the existing backend `rule_discovery.py` module.
- Preserve backend state-machine checks and `agent_events`.
- Allow `source: insight_candidate` with `source_ref.insight_id`.
- Do not add approval, versioning, active RulePack, or execution APIs.

Verify: V202.

## M3: alpha_seed heuristic (S3)

- Add `candidate_json.alpha_seed` (`schema_version: alpha_seed.v1`) in
  `buildInsightCandidatePayload` (heuristic; no new graph node).
- `candidate_family` must map to `CANDIDATE_FAMILIES`.
- `data_requirements` for RuleCandidate creation uses backend
  `DEFAULT_DATA_REQUIREMENTS`; `required_evidence_hint` is metadata only.

Verify:

```text
cd apps/trader-workflows
npx tsx --test src/services/insightCandidates.test.ts src/graphs/03-insightExploration/insightExplorationGraph.test.ts
```

## M3: AlphaResearchGraph v0 (S4)

Implement only the v0 thin graph:

```text
validate_input
-> create_rule_candidate
-> run_lite_backtest
```

`run_lite_backtest` node orchestrates (single node, multiple HTTP calls):

```text
evidence-requirements -> lite-backtest -> advance(decision) -> lite-backtest-report
```

Implementation guidance:

- Add workflow service client for the new backend API.
- Add AlphaResearchGraph under `src/graphs/04-alphaResearch/`.
- Add tests for validation failure, API calls, final output, and forbidden
  boundaries.

Verify: V203 (alphaResearch + graph tests).

## M3: Export (S5)

- Register graph in `apps/trader-workflows/langgraph.json`.
- Update README / README.zh-CN.
- Export types from `src/index.ts`.
- **Do not** add CLI commands (deferred).

Verify: V204 `npm test`.

## Forbidden

- No AlphaResearchAgent v1 research harness.
- No open-ended evidence search.
- No context hydrate node inside AlphaResearchGraph.
- No LLM wording, normalization, or field backfill node.
- No direct SQLite access from `apps/trader-workflows`.
- No active RulePack mutation.
- No automatic approval, promotion, or versioning.
- No broker, paper, or simulated execution.
- No workflow builder or UI.
- No CLI exposure in S5.

## Verification

```text
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/alpha-research-graph/spec.json | ConvertFrom-Json | Out-Null; Get-Content -Raw -Encoding UTF8 .agent-dev/specs/alpha-research-graph/decision-record.json | ConvertFrom-Json | Out-Null; Get-Content -Raw -Encoding UTF8 .agent-dev/specs/alpha-research-graph/clarification-questions.json | ConvertFrom-Json | Out-Null; Get-Content -Raw -Encoding UTF8 .agent-dev/tasks/T013-alpha-research-graph-v0.json | ConvertFrom-Json | Out-Null
cd apps/trader-agent/backend && python -m pytest tests/test_rule_discovery_lite_backtest.py tests/test_rule_candidate_api.py -v --tb=short
cd apps/trader-workflows && npx tsx --test src/services/insightCandidates.test.ts src/services/alphaResearch.test.ts src/graphs/04-alphaResearch/alphaResearchGraph.test.ts
cd apps/trader-workflows && npm test
git diff --check -- .agent-dev/specs/alpha-research-graph .agent-dev/tasks/T013-alpha-research-graph-v0.json .agent-dev/tasks/T013-alpha-research-graph-v0.md project-docs/backlog apps/trader-workflows
```
