# T007 LangGraph-Native DecisionGraph Slice Plan

Strict dependency graph:

```text
S0 spec gate
└─ S1 Studio config + dependencies
   └─ S2 DecisionGraph native state/nodes + Studio load
      └─ S3 run registry + checkpointer boundary
         └─ S4 CLI/Studio/docs/scope verification
```

| Slice | Scope | Gate |
|---|---|---|
| S0 | T007 source-of-truth and T006 contract lock | V101 |
| S1 | exact `langgraph.json` shape and Studio/checkpointer dependencies | V102 |
| S2 | DecisionGraph StateGraph state, nodes, adapter preservation, Studio load-only smoke | V201, V202, V301 |
| S3 | `thread_id = run_id`, bounded `runs show`, Stage1CheckpointStore downgrade | V203, V302 |
| S4 | CLI/Studio smoke, docs, forbidden-scope audit | V303, V304 |

Hard non-goals for every slice:

- no custom workflow UI
- no React Flow editor
- no evidence detail UI
- no raw evidence large-object display
- no Studio direct real-persistence
- no backend schema/API changes
- no OutcomeGraph native migration
- no EvaluationGraph native migration
- no InsightExplorationGraph native migration
- no paper execution
- no broker mirror
- no training
- no automatic promotion
- no apps/trader-cockpit changes

Frozen contracts before implementation:

- `apps/trader-workflows/langgraph.json` uses `dependencies: ["."]`, only `graphs.decision_graph`, and `env: "../../.env"`.
- `decision_graph` is the real compiled graph or documented LangGraph CLI-compatible factory.
- `runDecisionGraph` remains the adapter and invokes the compiled graph.
- CLI still exposes `run_id`; native DecisionGraph uses `thread_id = run_id`.
- `Stage1CheckpointStore` stores run metadata and summaries, not full native graph checkpoints.
- `runs show RUN_ID --json` returns bounded metadata and summaries.
- Studio direct real-persistence is forbidden in T007.
- Graph state uses processed context and `evidence_refs`, not raw evidence blobs.

Slice detail files:

- `S1-studio-native-foundation.md`
- `S2-decisiongraph-native-flow.md`
- `S3-run-registry-checkpointer-boundary.md`
- `S4-cli-studio-docs-verification.md`
