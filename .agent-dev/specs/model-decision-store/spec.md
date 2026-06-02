# SUPERSEDED: Model Decision Store：DecisionEnvelope 持久化与只读浏览

> Status: superseded by `.agent-dev/specs/self-evolving-agent-stage1/`.
>
> Reason: Stage 1 has been redefined as LangGraph minimal durable runtime with DecisionGraph, OutcomeGraph, EvaluationGraph, and InsightExplorationGraph v0. This older T006 plan only covered Decision Store + TUI and should not be handed to an implementation worker.

## 背景

`project-docs/research-reports/deep-research-report.md` 将项目终态定义为模型主脑驱动的交易决策学习系统。当前阶段优先级不是 paper execution 或实盘，而是先建立可验证的数据主轴：

```text
DecisionEnvelope -> Decision Store -> Feature Snapshot -> read-only review
```

T006 是这个主轴的第一步。它让一次显式 `trader decide SYMBOL` 产生结构化 `DecisionEnvelope`，保存到 `market_intel.db`，并能通过 CLI/TUI 回读。

## 目标

- 新增 `model_decisions` 与 `decision_feature_snapshots`。
- 新增 backend decisions API：create/list/detail。
- 新增 CLI：
  - `trader decide SYMBOL`
  - `trader decisions list`
  - `trader decisions show DECISION_ID`
- 新增只读 TUI `Decisions` 页面。
- 模型输出必须经 strict JSON parse + Zod validation 后才能入库。

## 决策

### D001: Decision Store 使用 market_intel.db

使用现有 `market_intel.db` 作为 system-of-record，由 backend intel schema/API 管理。这样后续 T007 Outcome、T011 Dataset、T012 Evaluation 可以直接 join，不引入第二套本地数据库。

### D002: 只有显式 decision run 入库

`trader analyze` 和 ChatPage 默认不保存为 decision。T006 只接受明确入口 `trader decide SYMBOL`，避免普通问答污染 Decision Corpus。

### D003: 使用最小 DecisionAction 集合

允许：

```text
NO_TRADE
WATCH
WAIT_TRIGGER
PAPER_ENTER_CANDIDATE
PAPER_EXIT_CANDIDATE
INVALIDATE
```

不在 T006 引入 `PAPER_ENTER`、`PAPER_EXIT`、`LIVE_*`、`CANCEL`、`REPLACE`、`SCALE_*`。这些 action 需要执行态对象和 broker mirror，属于后续任务。

### D004: trade_plan 不全局必填

`trade_plan` 是 optional。模型可以对 `NO_TRADE`、`WATCH`、`INVALIDATE` 不输出交易计划。T008/T010 再决定哪些 decision 可以转为 `OrderIntent`。

### D005: feature snapshot 保存三层

- `raw_context_json`: `/context/build` 的原始上下文摘要。
- `features_json`: 结构化关键特征。
- `tool_trace_json`: 本次 decide 使用的工具、参数、成功/失败状态。

### D006: 包含只读 Decisions TUI 页面

TUI 只读浏览列表和详情。不做编辑、journal、outcome、paper、models。

### D007: strict JSON + Zod validation

模型必须输出可解析的 DecisionEnvelope JSON。本地 Zod 校验失败时 fail closed，不写入半成品。

### D008: 不写 legacy hypotheses/predictions

`hypotheses/predictions` 是旧 intel hypothesis pipeline；`model_decisions` 是 model-brain decision corpus。T006 不迁移、不双写、不改 postmortem evaluator。

## 数据模型

### model_decisions

核心字段：

- `id`
- `ts`
- `symbol`
- `model_provider`
- `model_name`
- `model_version`
- `action`
- `confidence`
- `uncertainty`
- `belief_state_json`
- `trade_plan_json`
- `evidence_json`
- `objections_json`
- `missing_evidence_json`
- `decision_json`
- `status`
- `created_at`

### decision_feature_snapshots

核心字段：

- `id`
- `decision_id`
- `symbol`
- `asof_ts`
- `raw_context_json`
- `features_json`
- `tool_trace_json`
- `created_at`

## API 合约

```text
POST /api/intel/decisions
GET  /api/intel/decisions?symbol=&action=&model_version=&limit=
GET  /api/intel/decisions/{id}
```

创建 API 接受已经通过 CLI Zod 校验的 envelope 和 snapshot payload。backend 仍需做基础字段校验，不能盲信 CLI。

## CLI 合约

```text
trader decide TSLA
trader decisions list --symbol TSLA --limit 20
trader decisions show dec_...
```

`trader decide SYMBOL` 成功后打印 `decision_id`、`action`、`confidence`、`summary`。失败时打印 JSON parse/Zod/backend 错误，不写 partial decision。

## TUI 合约

新增 `Decisions` 页面：

- recent decisions list
- selected decision detail
- action/confidence/uncertainty/model/symbol/time
- belief_state/trade_plan/evidence/objections/missing_evidence 摘要
- loading/error/empty 状态

不提供编辑、删除、journal、outcome、paper execution 操作。

## 非目标

见 `spec.json#non_goals`。T006 明确不做 execution、risk、broker mirror、outcome、journal、training、promotion，也不动 Web Cockpit。

## 验收

T006 通过时，系统应满足：

1. `trader decide TSLA` 能生成并保存一条结构化 decision。
2. `trader decisions list/show` 能回读。
3. TUI Decisions 页面能只读浏览。
4. invalid model output 不入库。
5. diff 没有 scope creep 到 execution/risk/broker/outcome/journal。
