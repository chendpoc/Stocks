# T013 Code Task Worker Dispatch

Status: ready for worker  
Protocol: `.agent-dev/subagents/code-task-worker.md`  
Parent gate: M0 commits landed; T012 `done`; do not commit unless user asks.

## Intent Lock

```text
task_id: T013
spec_id: alpha-research-graph
slice_or_step: full task (S1–S5); verify-first, implement-only-on-gap
task_type: implement + verify + docs closure
intent_summary: Confirm AlphaResearchGraph v0 matches spec; run V201–V204; fill Outcome/Evidence in task md; optional review presentation.
success_criteria: All steps verified; task JSON remains done only if evidence passes; no forbidden paths; no CLI subcommand.
non_goals: AlphaResearchAgent v1; RulePack; execution; new InsightExploration nodes; commit/push.
```

## Preconditions

- Branch already contains T013 implementation commits (`4365a505` … `b847dee9`).
- If code missing locally, implement strictly per `.agent-dev/tasks/T013-alpha-research-graph-v0.json` steps S1→S5 serially.

## May Edit

From `spec.json` `scope.create` + `scope.modify` and per-step `files_expected` only.

## Must Not Edit

- `spec.scope.forbidden` paths
- `apps/trader-cli/**`
- `docs/**` public site
- Unrelated dirty files (T014–T017, `.deepseek/**`)

## Verification (run all; report exit codes)

```powershell
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/alpha-research-graph/spec.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/alpha-research-graph/decision-record.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/tasks/T013-alpha-research-graph-v0.json | ConvertFrom-Json | Out-Null

cd apps/trader-agent/backend
python -m pytest tests/test_rule_discovery_lite_backtest.py tests/test_rule_candidate_api.py -v --tb=short

cd ../../trader-workflows
npx tsx --test src/services/insightCandidates.test.ts src/services/alphaResearch.test.ts src/graphs/04-alphaResearch/alphaResearchGraph.test.ts
npm test

git diff --check -- .agent-dev/specs/alpha-research-graph .agent-dev/tasks/T013-alpha-research-graph-v0.json .agent-dev/tasks/T013-alpha-research-graph-v0.md apps/trader-agent/backend/app/api/rule_candidates.py apps/trader-agent/backend/app/modules/rule_discovery.py apps/trader-workflows/src/services/alphaResearch.ts apps/trader-workflows/src/graphs/04-alphaResearch apps/trader-workflows/langgraph.json
```

## Deliverables

1. Code Task Handoff (worker template)
2. Update `.agent-dev/tasks/T013-alpha-research-graph-v0.md` with **Outcome** and **Evidence** sections
3. Optional: `.agent-dev/reviews/T013-review-presentation.md` if gaps found

## Serial Step Reminder

Do not skip S2 before S3 in any re-implementation. S5: no CLI — Studio + exports only.
