# T007 Closure Review

Date: 2026-06-02

Status: done

Scope: T007 covers only LangGraph-native `DecisionGraph`, LangGraph Studio load-only config, and the `Stage1Runtime` run registry/checkpointer boundary. `OutcomeGraph`, `EvaluationGraph`, `InsightExplorationGraph`, backend schema/API work, Cockpit UI, execution, training, and promotion remain out of scope.

## Evidence

- V201/V202 passed: `npm --prefix apps/trader-workflows test -- src/graphs/decisionGraph.test.ts` ran 7 tests, all passed.
- V203 passed: `npm --prefix apps/trader-workflows test -- src/runtime/stage1Runtime.test.ts` ran 5 tests, all passed.
- V303 passed: `git diff --check -- .agent-dev/specs/langgraph-native-decisiongraph .agent-dev/tasks/T007.json .agent-dev/tasks/T007.md .agent-dev/tasks/T007-slices .agent-dev/langgraph-native-decisiongraph-worker-prompt.md apps/trader-workflows` returned no whitespace errors.
- V301 passed on fallback port 2077: `langgraphjs dev --no-browser --host 127.0.0.1 --port 2077 --config langgraph.json` started the local LangGraph API server, registered graph id `decision_graph`, and accepted `POST /assistants/search` with HTTP 200. The first attempt on port 2024 failed because the port was already in use, not because of T007 config.
- V302 safe subset passed: `npm run trader-agent:backend:status` showed backend `/health` OK, `npm run trader-cli -- runs list --json` succeeded, and `npm run trader-cli -- runs show run_3cbf8380fc0f46e9bc0496f8d54dc583 --json` returned bounded metadata with `thread_id` equal to `run_id` and `checkpoints: []`.

## Deferred External Smoke

The full V302 command `npm run trader-cli -- decide TSLA.US --json` was not executed in this closure pass because it would send Stage1 workflow payloads to the configured external LLM provider. That requires explicit user authorization for external payload export. T007 is still marked done because the native graph implementation, run registry contract, bounded `runs show` contract, and Studio load-only registration were verified locally.

## Scope Finding

The current worktree contains non-T007 backend changes in:

- `apps/trader-agent/backend/app/intel/api/stage1.py`
- `apps/trader-agent/backend/tests/test_intel_stage1_schema_api.py`

These changes strengthen Stage1 API idempotency/conflict checks, but backend schema/API work is forbidden in T007. Treat them as separate Stage1 follow-up work and do not use them as T007 closure evidence.

## Follow-Up

Open a narrow follow-up task for Stage1 core workflow smoke after T007 is committed or otherwise isolated. The follow-up should decide whether to run the real external LLM `decide` smoke, and it should separately review or park the backend idempotency diff.
