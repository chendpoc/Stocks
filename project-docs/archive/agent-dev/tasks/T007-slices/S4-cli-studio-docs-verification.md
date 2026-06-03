# S4 CLI Studio Docs Verification

## Goal

Finish T007 with CLI smoke, Studio smoke, documentation updates, and forbidden-scope audit.

## Scope

- Update `.agent-dev/context/code_map.md` with the T007 DecisionGraph-native pointer.
- Update `CLAUDE.md` with concise T007 commands and gotchas.
- Update `.agent-dev/tasks/T007-slices/README.md` only if implementation changed slice gates.
- Run the T007 verification commands.

## Frozen Contracts

- Documentation must say T007 only migrated `DecisionGraph`.
- Documentation must preserve T006 app boundaries:
  - `apps/trader-workflows` owns LangGraph runtime.
  - `apps/trader-cli` remains a thin wrapper.
  - `apps/trader-agent/backend` owns domain facts only.
- Documentation must not describe custom workflow UI, evidence detail UI, or other native graph migrations as completed.
- Documentation must say Studio direct real-persistence is not part of T007.
- Documentation must say `thread_id = run_id` for native DecisionGraph.

## Exit Criteria

- Automated tests pass.
- Manual CLI smoke is documented.
- Manual Studio smoke is documented.
- Forbidden-scope audit is documented.
- `runs show` bounded metadata shape is documented.
- No `apps/trader-cockpit`, backend schema/API, or non-DecisionGraph graph migration appears in the diff.

## Verification

Run:

```text
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/langgraph-native-decisiongraph/spec.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/langgraph-native-decisiongraph/decision-record.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/tasks/T007.json | ConvertFrom-Json | Out-Null
<run V102 from spec.json to check langgraph.json shape>
cd apps/trader-workflows && npm test -- src/graphs/decisionGraph.test.ts
cd apps/trader-workflows && npm test -- src/runtime/stage1Runtime.test.ts
git diff --check -- .agent-dev/specs/langgraph-native-decisiongraph .agent-dev/tasks/T007.json .agent-dev/tasks/T007.md .agent-dev/tasks/T007-slices .agent-dev/langgraph-native-decisiongraph-worker-prompt.md apps/trader-workflows
manual: cd apps/trader-workflows && npx @langchain/langgraph-cli dev
manual: npm run trader-cli -- decide TSLA.US --json
manual: npm run trader-cli -- runs show <RUN_ID> --json
manual: git diff --name-only forbidden path audit
manual: review diff content against forbidden scope and non-goals
```

## Non-goals

- No new product scope.
- No implementation changes outside documentation unless a verification failure requires a narrow fix in an allowed file.
