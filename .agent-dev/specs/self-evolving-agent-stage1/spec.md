# Self-Evolving Trading Agent Stage 1

## 背景

`docs/deep-research-report.md` 的终态目标是模型主脑驱动的自进化交易决策系统：模型自己判断，结果自己回流，表现更好才升级。经过本轮 grill-with-docs，Stage 1 的最小闭环从旧 T006 的 “Decision Store + TUI” 调整为：

```text
ContextSnapshot
-> DecisionGraph
-> model_decisions
-> OutcomeGraph
-> decision_outcomes
-> EvaluationGraph
-> promotion recommendation
```

同时保留 `InsightExplorationGraph v0` 作为受控 ReAct 的探索入口，只产出 `InsightCandidate`。

## 架构原则

### LangGraph 只负责 durable workflow

LangGraph 用于 `DecisionGraph`、`OutcomeGraph`、`EvaluationGraph`、`InsightExplorationGraph` 这类需要 checkpoint、pause/resume、HITL 或跨小时运行的 workflow。

Runtime 归属：

```text
apps/trader-workflows   LangGraph runtime + graph implementations + checkpoint store
apps/trader-agent       backend domain schema/API over market_intel.db
apps/trader-cli         thin command wrappers to trigger/show workflow runs
```

`apps/trader-cli` 不承载 graph implementation，避免 CLI 同时承担命令、TUI、LLM 和 durable runtime。

### CLI 到 workflow 的固定契约

`apps/trader-workflows` 必须提供 machine-readable command entry：

```text
npm --prefix apps/trader-workflows run workflows -- <command> --json
```

根目录必须增加：

```text
npm run trader-workflows -- <command> --json
```

`apps/trader-cli` 的 Stage 1 命令只做 thin wrapper：转发参数、读取 workflow JSON envelope、展示结果、传递非零 exit code。CLI 不直接 import `apps/trader-workflows/src/**`，也不实现 graph/runtime。

Workflow JSON envelope：

```json
{
  "ok": true,
  "command": "decide",
  "run_id": "run_...",
  "status": "succeeded",
  "data": {},
  "error": null
}
```

命令映射：

| CLI | Workflow app |
|---|---|
| `trader runs list --json` | `runs list --json` |
| `trader runs show RUN_ID --json` | `runs show RUN_ID --json` |
| `trader runs resume RUN_ID --json` | `runs resume RUN_ID --json` |
| `trader decide SYMBOL --json` | `decide SYMBOL --json` |
| `trader outcomes run --due --json` | `outcomes run --due --json` |
| `trader eval summary --json` | `eval summary --json` |
| `trader insights explore --symbol SYMBOL --window WINDOW --json` | `insights explore --symbol SYMBOL --window WINDOW --json` |

普通数据处理不进入 LangGraph：

```text
data fetch / OCR / image caption / chunking / embedding / kline feature extraction / vector indexing
```

这些保持 services/jobs。

### domain facts 与 checkpoint 分离

`market_intel.db` 是交易领域事实源：

```text
context_snapshots
model_decisions
decision_outcomes
insight_candidates
evaluation_reports
weighting_policy_stats
```

LangGraph checkpoint store 只保存 runtime state：

```text
graph run state
node state
resume / interrupt metadata
checkpoint lineage
```

默认 checkpoint DB：

```text
TRADER_WORKFLOWS_CHECKPOINT_DB
default: data/trader-workflows/checkpoints.sqlite
```

测试必须使用临时 checkpoint DB，不能写 `market_intel.db` 或 `data/trader-agent/trader-agent.db`。

S1 依赖策略：

```text
runtime package: @langchain/langgraph
sqlite driver: better-sqlite3
adapter: apps/trader-workflows/src/runtime/checkpointStore.ts
```

图实现只依赖 `Stage1CheckpointStore` facade，不直接依赖 raw SQLite。若后续接入官方 LangGraph SQLite saver，也必须包在同一 facade 后面，不改变 graph/CLI contract。

### Stage 1 backend API 契约

Stage 1 domain API 统一挂在：

```text
/api/intel/stage1
```

`apps/trader-workflows/src/api/client.ts` 使用 `TRADER_API_BASE`，默认 `http://127.0.0.1:8000/api/intel`。它可以参考 `apps/trader-cli/src/api/client.ts` 的错误处理风格，但不能 import CLI 模块。

最小 route：

| Domain | Routes |
|---|---|
| ContextSnapshot | `POST /context-snapshots`, `GET /context-snapshots/{snapshot_id}`, `GET /context-snapshots?symbol=&limit=` |
| ModelDecision | `POST /model-decisions`, `GET /model-decisions/{decision_id}`, `GET /model-decisions?symbol=&model_version=&limit=`, `POST /model-decisions/{decision_id}/human-overrides` |
| DecisionOutcome | `POST /decision-outcomes/schedule`, `GET /decision-outcomes/due?now=&limit=&symbol=`, `POST /decision-outcomes/{outcome_id}/label`, `GET /decision-outcomes?decision_id=&symbol=&status=&limit=` |
| InsightCandidate | `POST /insight-candidates`, `GET /insight-candidates/{insight_id}`, `GET /insight-candidates?symbol=&verification_status=&limit=` |
| EvaluationReport | `POST /evaluation-reports`, `GET /evaluation-reports/{report_id}`, `GET /evaluation-reports?model_version=&limit=` |
| WeightingPolicyStats | `GET /weighting-policy-stats`, `POST /weighting-policy-stats` |

写入规则：

- Create endpoint 必须支持 deterministic id 或 idempotency key。
- 相同 id + 相同 payload 再次写入返回 existing record。
- 相同 id + 不同 immutable payload 返回 `409`。
- `decision_json`、`context snapshot items`、`insight candidate` 和 `evaluation report` 都按 immutable record 处理。
- `outcome_json` 在 pending row finalize 后不可再改写。
- `human_overrides_json` 只能 append，不允许覆盖原始 `DecisionEnvelope`。
- DecisionGraph 为每个 `decision_id + horizon + path` 预创建 `decision_outcomes` pending rows。
- OutcomeGraph 只处理 `status=pending AND due_at<=now` 的 due rows。
- OutcomeGraph 将 pending row finalize 为 `labeled`、`skipped` 或 `failed` 后，不能再次 relabel 或改写。
- `decision_outcomes` 必须包含 `symbol`、`status`、`due_at`、`scheduled_at`、`updated_at` 和可选 `labeled_at`。

### ContextSnapshot 不可变

原始多模态对象先被 processors 转为 `WeightedContextItem`，再组成不可变 `ContextSnapshot`。

```text
Raw Evidence
-> processors
-> WeightedContextItem
-> immutable ContextSnapshot
-> DecisionGraph
```

历史 snapshot 不能被 outcome 回写。Outcome 只能更新未来的 `WeightingPolicy`、`SourceStats`、`LessonStats`。

### InsightCandidate 不是 AcceptedLesson

受控 ReAct 可以探索 K 线规律、历史规律和市场机制，但只能产出 `InsightCandidate`。候选规律必须经过 replay/outcome evidence 后，才能成为 `AcceptedLesson`。

### HumanOverride 双轨评估

原始 `DecisionEnvelope` 不可变。Human-in-the-loop 可以追加 `HumanOverride`，但 evaluation 必须区分：

```text
model_path
override_path
delta_human_value
```

## Stage 1 Graphs

### DecisionGraph

```text
input: symbol / model_version / run intent
build_context_snapshot
model_decision
validate_decision_envelope
persist model_decisions + context_snapshots
emit scheduled outcomes
```

### OutcomeGraph

```text
input: decision_id / horizon
wait or pick due outcome
fetch future market data
calculate absolute return
calculate relative return vs benchmark
calculate invalidation/target proxy
persist decision_outcomes
```

固定 horizons：

```text
30m / 1h / EOD / 1d / 3d
```

### EvaluationGraph

```text
input: model_version / window
aggregate outcomes
compare model_path vs override_path
report confidence calibration and failure modes
emit promotion recommendation
```

Stage 1 只输出：

```text
hold | needs_more_data
```

不自动升级模型，不强制 challenger。

DecisionGraph 和 InsightExplorationGraph 使用 `apps/trader-workflows/src/llm/provider.ts`。这个 provider 可以复用 `LLM_PROVIDER`、`LLM_API_KEY`、`OPENAI_API_KEY`、`LLM_MODEL`、`LLM_BASE_URL` 等 env 命名，但不能 import `apps/trader-cli/src/llm/provider.ts`。

### InsightExplorationGraph v0

```text
input: symbols / time window / exploration prompt
controlled ReAct over weighted context + historical outcomes
generate InsightCandidate
persist candidate with evidence refs
```

不做：

```text
AcceptedLesson promotion
training
paper execution
high-risk decision boost
```

## Stage 1 不做

- 自研 TUI Decisions/Outcomes/Insights/Eval 页面
- Paper order submit/query/cancel
- Broker Mirror / Reconciler
- 自动模型升级
- 完整 Model Registry
- 完整 intelligence schema
- 自动训练
- legacy hypotheses/predictions 双写

## 旧 T006 处理

旧 `model-decision-store` / T006 规划被本 Stage 1 规格取代。旧 T006 过窄地只覆盖 Decision Store + TUI，没有覆盖 Stage 1 所需的 LangGraph durable runtime、OutcomeGraph、EvaluationGraph、InsightExplorationGraph 和 HumanOverride 双轨评估。

本规格仍保留 `T006` 作为 umbrella task，但 implementation 必须按 slice 执行和 review；每个 slice 有独立 worker prompt、exit criteria 和 verification gate。
