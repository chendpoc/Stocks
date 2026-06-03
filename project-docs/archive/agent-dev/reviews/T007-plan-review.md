## Findings

### P001 [critical] worker_ambiguity
- File: `.agent-dev/tasks/T007-slices/S3-run-registry-checkpointer-boundary.md:18`
- Issue: The plan says `run_id -> graph_name -> thread_id -> checkpoint_ref` and that `Stage1CheckpointStore` stores metadata only, but it does not define the concrete registry API/schema or how current `Stage1Runtime.showRun()` and `resumeRun()` change. Current code exposes `checkpoints: Stage1CheckpointRecord[]`, persists `workflow_checkpoints.state_json`, and resumes through `getLatestCheckpoint()` plus registered handlers.
- Impact: A worker can either keep the old full-state table, delete it and break `runs show/resume`, or create an incompatible partial migration. This directly risks the T006 CLI/run_id contract.
- Correction: Specify the post-T007 store contract: registry columns, whether `thread_id` equals `run_id` or is separately generated, what `checkpoint_ref` contains (`checkpoint_id`/`checkpoint_ns`), what `runs show` returns, and how `resume RUN_ID` invokes the compiled graph through LangGraph config without duplicate domain writes.

### P002 [critical] missing_decision
- File: `.agent-dev/specs/langgraph-native-decisiongraph/spec.md:40`
- Issue: The plan requires the same compiled graph to be runnable from Studio, workflow CLI, and trader-cli, but only the CLI path has a run registry owner. A direct Studio invocation bypasses `Stage1Runtime`, so it is unclear whether Studio runs create a `run_id` registry record, use a fixture/fake-provider path only, or persist real domain decisions without registry metadata.
- Impact: This is a hidden storage/API contract decision. Different workers could produce different run_id/thread_id behavior while all claiming Studio loads `decision_graph`.
- Correction: Decide and record the Studio invocation mode. If real persistence is allowed, define how Studio creates/maps `run_id`, `thread_id`, and registry metadata. If not, state Studio smoke is load-only or fixture-only and must not write domain facts.

### P003 [important] dependency_risk
- File: `.agent-dev/specs/langgraph-native-decisiongraph/spec.md:51`
- Issue: The proposed `langgraph.json` example only shows `graphs`. Current LangGraph CLI docs describe `dependencies` as a required config key and JS local-server docs show `@langchain/langgraph-cli dev` with a config that may also need env/node settings. The plan's S1 verification only parses JSON and then relies on a manual smoke.
- Impact: The worker may add a syntactically valid but CLI-invalid or environment-fragile config, delaying the failure to manual Studio smoke.
- Correction: Pin the intended config shape, for example `dependencies: ["."]`, `graphs.decision_graph`, and the selected env handling (`.env`, repo-root `.env`, or no env for fixture smoke). Keep `graphs` to only `decision_graph`.

### P004 [important] worker_ambiguity
- File: `.agent-dev/tasks/T007-slices/S1-studio-native-foundation.md:12`
- Issue: S1 requires a real `decisionGraph` export and Studio load, while S2 is the slice that actually migrates DecisionGraph state/nodes. S1 also says node migration is a non-goal unless needed.
- Impact: S1 is not independently implementable. A worker must either create a placeholder/single-node wrapper, which the spec forbids, or silently pull S2 work into S1.
- Correction: Either merge S1 and S2 for the graph export gate, or allow S1 to add config/dependencies only and move "real compiled business graph loads in Studio" to the S2/S4 gate.

### P005 [important] verification_gap
- File: `.agent-dev/specs/langgraph-native-decisiongraph/spec.json:246`
- Issue: Acceptance coverage is too loose for the riskiest claims. `V201` and `V202` run the same test command without naming required assertions; `V203` does not require proving the absence of full native state in `runs show`; `V302` omits backend startup and LLM/env prerequisites; `V301` does not require invoking the graph or checking only `decision_graph` is listed.
- Impact: The worker can pass the named commands while still preserving the old hand-written path, leaking state, or leaving Studio unusable in the expected mode.
- Correction: Add explicit assertions/manual checks for compiled-graph invocation, no `workflow_checkpoints.state_json` equivalent for native DecisionGraph state, `runs show` metadata shape, backend/LLM prerequisites, and Studio graph list/invocation outcome.

### P006 [minor] artifact_gap
- File: `.agent-dev/specs/langgraph-native-decisiongraph/spec.json:4`
- Issue: The spec status is still `draft`, and `.agent-dev/specs/langgraph-native-decisiongraph/dev-plan.md` is absent. `.agent-dev/README.md` treats dev-plan as optional, but `.agent-dev/subagents/plan-review-agent.md` says Phase 5 tasks require a dev-plan artifact.
- Impact: This does not block the technical review by itself because T007 has task, slice, decision, and worker-prompt artifacts, but it weakens the artifact gate if the parent agent treats T007 as past Plan Gate.
- Correction: Either add/approve the Phase 5 dev plan artifact or explicitly mark this review as a task/slice/worker-prompt review before implementation approval.

## Open Decisions

- Should Studio direct invocation be real-persistence, fixture-only, or load-only?
- Is `thread_id` equal to `run_id`, derived from it, or a separate id stored in registry metadata?
- What exact `runs show RUN_ID --json` shape is preserved after native checkpointer adoption?
- Should S1 and S2 remain separate, or should the Studio "real compiled graph" gate move after S2?
- Which `langgraph.json` keys are required for this repo: `dependencies`, `env`, `node_version`, or only `graphs`?

## Acceptance / Verification Gaps

- A001 needs a concrete config-shape check, not only JSON parse plus manual smoke.
- A003 needs an assertion that `runDecisionGraph` invokes the compiled graph path, not merely that behavior still passes.
- A004/A005 need direct checks that run registry metadata is bounded and LangGraph owns native graph state.
- A006 needs a diff/test check that `runs show` and checkpoint metadata do not expose raw/large state.
- V302 needs prerequisites: backend dev server, repo-root `.env`/LLM, and how to handle unavailable live services.
- V304 should include a `git diff --name-only` forbidden-path audit plus a content audit for raw evidence/UI/paper/training terms.

## Verdict

- `revise_required`

## Plan Review Handoff

- task_id / spec_id: `T007` / `langgraph-native-decisiongraph`
- review target: full task plan, slice plan, and worker prompt
- verdict: `revise_required`
- critical_count: 2
- important_count: 3
- minor_count: 1
- files inspected: `project-docs/workflows/agent-dev-workflow.md`, `CLAUDE.md`, `.agent-dev/README.md`, `.agent-dev/memory/schemas.md`, `.agent-dev/context/code_map.md`, `.agent-dev/tasks/T007.json`, `.agent-dev/tasks/T007.md`, `.agent-dev/tasks/T007-slices/README.md`, `.agent-dev/tasks/T007-slices/S1-studio-native-foundation.md`, `.agent-dev/tasks/T007-slices/S2-decisiongraph-native-flow.md`, `.agent-dev/tasks/T007-slices/S3-run-registry-checkpointer-boundary.md`, `.agent-dev/tasks/T007-slices/S4-cli-studio-docs-verification.md`, `.agent-dev/specs/langgraph-native-decisiongraph/spec.json`, `.agent-dev/specs/langgraph-native-decisiongraph/spec.md`, `.agent-dev/specs/langgraph-native-decisiongraph/decision-record.json`, `.agent-dev/langgraph-native-decisiongraph-worker-prompt.md`, `.agent-dev/specs/self-evolving-agent-stage1/spec.json`, `.agent-dev/specs/self-evolving-agent-stage1/decision-record.json`, `project-docs/adr/0001-langgraph-minimal-stage1.md`, `apps/trader-workflows/package.json`, `apps/trader-workflows/src/index.ts`, `apps/trader-workflows/src/graphs/decisionGraph.ts`, `apps/trader-workflows/src/graphs/decisionGraph.test.ts`, `apps/trader-workflows/src/runtime/checkpointStore.ts`, `apps/trader-workflows/src/runtime/stage1Runtime.ts`, `apps/trader-workflows/src/runtime/stage1Runtime.test.ts`, `apps/trader-cli/src/commands/decide.ts`, `apps/trader-cli/src/commands/runs.ts`
- CodeGraph evidence used: index available; `codegraph_context` found `Stage1Runtime` and class-based `DecisionGraph`; `codegraph_search` found `Stage1CheckpointStore` and `runDecisionGraph`; `codegraph_trace handleDecideCommandAsync -> runDecisionGraph` showed the dynamic callback path through `runtime.runGraph`.
- External evidence used: official LangGraph JS/local-server and CLI docs; npm metadata for `@langchain/langgraph`, `@langchain/langgraph-cli`, and `@langchain/langgraph-checkpoint-sqlite`.
- source-of-truth conflicts: S3 boundary underspecified against current runtime/store code; Studio direct invocation lacks a recorded decision; config shape is weaker than current LangGraph CLI docs; S1/S2 gates conflict.
- open decisions: 5
- findings payload location: `.agent-dev/reviews/T007-plan-review.json`
