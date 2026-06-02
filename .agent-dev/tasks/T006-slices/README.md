# T006 Self-Evolving Agent Stage 1 Slice Plan

Strict dependency graph:

```text
S0 spec gate
├─ S1 LangGraph runtime foundation
└─ S2 Stage 1 domain schema/API
   └─ S3 Context pipeline v0

S1+S2+S3 -> S4 DecisionGraph v0
S1+S2+S4 -> S5 OutcomeGraph v0
S2+S5    -> S6 EvaluationGraph v0
S1+S2+S3+S5 -> S7 InsightExplorationGraph v0
S1+S2+S3+S4+S5+S6+S7 -> S8 docs/report/verification
```

| Slice | Scope | Gate |
|---|---|---|
| S0 | Stage 1 ADR/spec/decision-record alignment and old T006 supersession | V101 |
| S1 | `apps/trader-workflows` app, LangGraph runtime foundation, checkpoint split, run inspection | V203 |
| S2 | `market_intel.db` domain facts and backend API | V201 |
| S3 | WeightedContextItem and immutable ContextSnapshot | V202 |
| S4 | DecisionGraph v0 and immutable DecisionEnvelope persistence | V204 |
| S5 | OutcomeGraph v0 for 30m/1h/EOD/1d/3d labels | V205 |
| S6 | EvaluationGraph v0 with model_path/override_path and recommendation | V206 |
| S7 | InsightExplorationGraph v0, controlled ReAct, InsightCandidate only | V207 |
| S8 | CLI/report/docs/verification and scope review | V208 |

Hard non-goals for every slice:

- no self-built TUI page
- no paper submit/query/cancel
- no Broker Mirror / Reconciler
- no automatic model promotion
- no automatic training
- no full Model Registry
- no AcceptedLesson auto-promotion
- no legacy hypotheses/predictions dual-write

Frozen contracts before implementation:

- CLI wrappers call `apps/trader-workflows` through the workflow JSON command contract; no direct graph/runtime imports from `apps/trader-cli`.
- Runtime checkpoints default to `data/trader-workflows/checkpoints.sqlite` and are overrideable with `TRADER_WORKFLOWS_CHECKPOINT_DB`.
- S1 uses `@langchain/langgraph` plus a project-owned `Stage1CheckpointStore` SQLite facade backed by `better-sqlite3`.
- Stage 1 domain API lives under `/api/intel/stage1` with immutable/idempotent create semantics.
- DecisionGraph pre-creates pending `decision_outcomes`; OutcomeGraph finalizes due pending rows exactly once.
- `apps/trader-workflows` owns its own API client and LLM provider.

Slice detail files:

- `S1-runtime-foundation.md`
- `S2-domain-schema-api.md`
- `S3-context-snapshot-pipeline.md`
- `S4-decision-graph.md`
- `S5-outcome-graph.md`
- `S6-evaluation-graph.md`
- `S7-insight-exploration-graph.md`
- `S8-cli-report-docs.md`
