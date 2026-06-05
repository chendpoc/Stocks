# Trader Workflows

`apps/trader-workflows` 是 trader-agent 系统的 LangGraph 工作流运行时包。

当前产品方向是 **工作流 + CLI/TUI + 后端/共享契约**。本包负责图执行、可 checkpoint 的运行实例，以及工作流级编排；**不**负责后端持久化规则、RulePack 激活、券商执行或 UI 界面。

项目级 agent 工程原则见 [08-agent-engineering-principles-proposal.md](../../project-docs/research-agent/target-system/trader-agent/08-agent-engineering-principles-proposal.md)。新增长运行 run、subagent、MCP/tool surface、skill 或 alpha research workflow 前，先按该文档检查边界。

当前 backlog 主线是 workflow 成熟度：[workflow-maturity-roadmap.md](../../project-docs/backlog/workflow-maturity-roadmap.md)。

## 工作流清单

表中空白链接表示该 workflow 还没有独立开发文档。

| Workflow | 状态 | 文档 |
|---|---|---|
| `Stage1Runtime` | 已实现 | [workflow runtime run/checkpoint/audit alignment](../../project-docs/backlog/now/workflow-runtime-run-checkpoint-audit-alignment.md) |
| `DecisionGraph` | 已实现 | [DecisionGraph maturity v1](../../project-docs/backlog/now/decision-graph-maturity-v1.md) |
| `OutcomeGraph` | 已实现 | [T010: OutcomeGraph Maturity v1](../../.agent-dev/tasks/T010-outcome-graph-maturity-v1.md) |
| `EvaluationGraph` | 已实现 | [T011: EvaluationGraph Maturity v1](../../.agent-dev/tasks/T011-evaluation-graph-maturity-v1.md) |
| `InsightExplorationGraph` | 已实现 | [T012: InsightExplorationGraph Maturity v1](../../.agent-dev/tasks/T012-insight-exploration-graph-maturity-v1.md) |
| `AlphaResearchGraph` | 规划中 | [AlphaResearchGraph spec](../../project-docs/backlog/now/alpha-research-graph-spec.md) |
| `MarketJudgmentGraph` | 规划中 |  |
| `ModelLearningGraph` | 规划中 |  |
| `ReflectionGraph` | 规划中 | [Reflection Engine](../../project-docs/research-agent/target-system/trader-agent/01-agent-core-development/18-reflection-engine.md) |
| `RuntimeOrchestrator` | 后端依赖 | [workflow runtime run/checkpoint/audit alignment](../../project-docs/backlog/now/workflow-runtime-run-checkpoint-audit-alignment.md) |
| `Rule Discovery / Lite Backtest` | 后端依赖 | [alpha research engineering principles](../../project-docs/research-agent/target-system/trader-agent/08-agent-engineering-principles-proposal.md) |
| `Memory Review / Activation` | 后端依赖 | [alpha research engineering principles](../../project-docs/research-agent/target-system/trader-agent/08-agent-engineering-principles-proposal.md) |
| `Audit / Rebuild Workflow` | 后端依赖 | [workflow runtime run/checkpoint/audit alignment](../../project-docs/backlog/now/workflow-runtime-run-checkpoint-audit-alignment.md) |
| `Approval / Capability Gate` | 后端依赖 |  |

## 架构

```text
操作者界面
apps/trader-cli / 未来 TUI
  |
  v
工作流运行时
apps/trader-workflows
  |
  |-- Stage1Runtime                 [已实现]
  |
  |-- DecisionGraph                 [已实现]
  |-- OutcomeGraph                  [已实现]
  |-- EvaluationGraph               [已实现]
  |-- InsightExplorationGraph       [已实现]
  |
  |-- AlphaResearchGraph            [规划中: Now]
  |-- MarketJudgmentGraph           [规划中: Next]
  |-- ModelLearningGraph            [规划中: Later]
  |-- ReflectionGraph               [规划中]
  |
  v
后端 / 共享平台
apps/trader-agent/backend
apps/trader-agent/shared
  |
  |-- RuntimeOrchestrator           [已实现，非 LangGraph]
  |-- Rule Discovery / Lite Backtest [已实现 / 部分]
  |-- Memory Review / Activation    [已实现 / 部分]
  |-- Audit / Rebuild Workflow      [已实现]
  |-- Approval / Capability Gate    [部分 schema，工作流待建]
```

## 已实现工作流

### Stage1Runtime

`Stage1Runtime` 是工作流运行时基础层，负责创建运行实例、记录 checkpoint、支持运行检查与中断恢复。

职责：

- 创建持久化 `workflow_runs`；
- 写入工作流 checkpoint；
- 提供 `runs list`、`runs show`、`runs resume` 原语；
- 将 LangGraph 原生 checkpoint 与本地运行时存储对接；
- 保持图执行可观测，且不把执行逻辑推入 CLI/TUI。

#### CLI：`runs show`

使用 `npm run workflows -- runs show RUN_ID --json`（或 `trader-workflows`）。返回
envelope 为 `{ ok, command, run_id, status, data: { run } }`。

**DecisionGraph** 运行的 `data.run.output` 为有界摘要，并包含 `context_snapshot`：

```json
{
  "snapshot_id": "snap-…",
  "decision_id": "dec-…",
  "action": "NO_TRADE",
  "scheduled_outcome_count": 3,
  "paper_execution_submitted": false,
  "context_snapshot": {
    "snapshot_id": "snap-…",
    "context_hash": "…",
    "context_version": "stage1-context-v0",
    "item_count": 12,
    "evidence_ref_count": 10,
    "source_type_counts": { "signal": 2, "event": 1 }
  }
}
```

其他 graph 仍使用各自有界的 `output` 结构。

### DecisionGraph

`DecisionGraph` 是当前的结构化决策工作流。

职责：

- 为标的或决策窗口构建/获取 context snapshot；
- 调用有边界的决策路径；
- 校验 decision envelope；
- 持久化决策与 pending outcome；
- 返回 evidence references，供下游审查与评估使用。

它是**决策工作流**，不是完整的 alpha 发现工作流：基于已有上下文做决策，不负责发现、验证并晋升新因子。

#### CLI：`context snapshots`（只读）

在不加载完整原始 payload 的前提下检查已持久化的 context snapshot。

`context snapshots list --symbol SYMBOL [--limit N] --json` — 列出某标的近期
snapshot（默认 `limit` 20）。`data.snapshots[]` 每项字段：

```json
{
  "snapshot_id": "snap-…",
  "symbol": "TSLA",
  "asof_ts": "2026-06-01T12:00:00.000Z",
  "context_hash": "…",
  "context_version": "stage1-context-v0",
  "item_count": 12,
  "evidence_ref_count": 10,
  "source_type_counts": { "signal": 2 }
}
```

`context snapshots show SNAPSHOT_ID --json` — 单条摘要（字段同 list），另含
`data.top_items`（按 `composite_weight` 取前 5 项）：

```json
{
  "item_id": "signal:sig-1",
  "source_type": "signal",
  "summary": "Breakout signal",
  "composite_weight": 0.7,
  "evidence_ref": { "ref_type": "intel_signal", "ref_id": "sig-1", "symbol": "TSLA" }
}
```

### OutcomeGraph

`OutcomeGraph` 在市场数据足够时关闭 pending decision outcome 和 insight candidate outcome。

职责：

- 查找到期的 pending decision outcome 和 insight candidate outcome；
- 使用归一化标签标注结果（`hit`/`miss`/`neutral`/`invalid`/`insufficient_data`）；
- 需要新证据时，构建紧凑证据摘要（上限 15 行）；
- 不修改 context snapshot；
- 输出 finalized、skipped、failed 计数，按 source type 和归一化标签分组。

这是第一个反馈闭环。没有它，系统能做出决策，但无法知道决策是否有效。

### EvaluationGraph

`EvaluationGraph` 将 outcome 聚合为 evaluation report。

职责：

- 聚合 outcome 与决策表现；
- 构建 evaluation report；
- 基于已记录事实评估规则或模型行为；
- **不**自动晋升模型或变更配置。

该图可以推荐或报告，但**不得**静默晋升模型、改变生产行为或修改活跃 RulePack 策略。

### InsightExplorationGraph

`InsightExplorationGraph` 从 snapshot、outcome 与 evidence 中探索候选 insight。

职责：

- 检查 context snapshot 与历史 outcome；
- 生成有边界的 `InsightCandidate` 记录；
- 附加 evidence references；
- 强制执行 proposal 权重上限与 forbidden capability 边界；
- **不**执行交易、模型训练、晋升或直接修改 lesson。

这是当前最接近 alpha 发现的已实现入口：产出候选 insight，但不完成正式的 alpha 研究与 lite backtest 链路。

## 规划中的工作流

### AlphaResearchGraph

状态：规划中，backlog **Now**。

`AlphaResearchGraph` 应是正式的 alpha 因子研究工作流。

预期职责：

- 消费 `InsightCandidate`、事件窗口、context 窗口与历史 outcome；
- 将假设转化为结构化 `RuleCandidate`；
- 定义 trigger、entry condition、exit condition、invalidation、数据需求与风险说明；
- 调用或协调 Rule Discovery / Lite Backtest；
- 产出 `LiteBacktestReport`；
- 仅将候选推进到安全审查状态，如 `needs_more_data`、`rejected`、`pending_shadow_tracking` 或 `pending_manual_approval`。

安全边界：

- 不修改活跃 RulePack；
- 不自动交易；
- 不自动扩展 universe；
- 未经人工审批不得晋升。

推荐实现方向：

```text
InsightExplorationGraph
  -> AlphaResearchGraph
  -> Rule Discovery / Lite Backtest
  -> pending_shadow_tracking | pending_manual_approval
  -> OutcomeGraph
  -> EvaluationGraph
```

### MarketJudgmentGraph

状态：规划中，backlog **Next**。

`MarketJudgmentGraph` 应产出面向操作者的市场解读。

预期职责：

- 汇总当前市场 context；
- 产出 `MarketRead`；
- 识别机会偏向（opportunity bias）；
- 构建 watchlist；
- 定义 trigger 与 invalidation；
- 为 CLI/TUI 审查 surfaced 风险警告。

该图用于市场状态判断与日常操作焦点，**不同于** alpha 发现。

### ModelLearningGraph

状态：规划中，backlog **Later**。

`ModelLearningGraph` 应编排离线 challenger 模型实验。

预期职责：

- 为有边界的模型目标运行离线训练任务；
- 跟踪 checkpoint；
- 运行 walk-forward 验证；
- 样本外评估 challenger 模型；
- 输出晋升建议。

安全边界：

- 不直接交易；
- 不自动晋升模型；
- 不在 CLI、后端 API、工作流调度器或运行时中隐藏切换模型；
- 每个 checkpoint、指标与建议必须可审计。

首个合理目标是 `opportunity_ranking_model`，而非完整交易策略模型。

### ReflectionGraph

状态：规划中；后端模块文档已较成熟，但尚未成为独立 LangGraph 工作流。

预期职责：

- 运行每日学习摘要；
- 运行每周 reflection；
- 聚合 setup 与 ticker 表现；
- 分析错误与缺失 evidence；
- 创建 rule proposal 草稿；
- 将候选交给 Rule Discovery / Lite Backtest。

安全边界：

- 不自动激活规则；
- 不直接修改 Risk Engine 策略；
- 不做黑盒策略变更。

## 本包依赖的后端工作流

### RuntimeOrchestrator

状态：已在 `apps/trader-agent/backend` 实现，**非** LangGraph。

以前端 scan pipeline 方式运行，带 `run_id` 与 `agent_events`。

职责：

- 运行标的或 universe 扫描；
- 调用 market snapshot、setup detection、rule/scoring/risk 与 signal 模块；
- 写入步骤级 `agent_events`；
- 提供 run list 与 run detail API。

后续工作应让 `RuntimeOrchestrator` 的 run/event 语义与 `Stage1Runtime` 对齐，避免 CLI/TUI 面对两套不兼容的运行世界。

### Rule Discovery / Lite Backtest

状态：后端已实现 / 部分实现。

它是 alpha 研究的**验证边界**。

职责：

- 创建 `RuleCandidate`；
- 记录 evidence 需求；
- 运行 lite backtest；
- 写入 `LiteBacktestReport`；
- 未经人工审批与版本化则阻止候选激活。

`AlphaResearchGraph` 应复用此后端能力，而不是在工作流包内重建规则验证。

### Memory Review / Activation

状态：后端已实现 / 部分实现。

管理长期金融 memory。

职责：

- 创建 memory candidate；
- 支持人工审查；
- activate、reject、merge 或标记 conflict；
- 阻止 agent 静默更新活跃 memory；
- 记录 audit event。

工作流图可以**消费**活跃 memory，但**不得**静默激活或覆盖 memory。

### Audit / Rebuild Workflow

状态：后端已实现。

保证 artifact 索引与 memory evidence reference 可重建。

职责：

- 增量 rebuild；
- 定向 artifact rebuild；
- FTS 与 section index 维护；
- 检测 stale 或未解析的 evidence reference；
- 报告 rebuild 状态。

### Approval / Capability Gate

状态：部分 schema 已存在；完整工作流待建。

预期职责：

- 审批高风险 tool call；
- 审批 RulePack 发布；
- 审批模型晋升；
- 审批工作流候选激活；
- 记录 approver、时间戳、请求 payload、决策与风险说明。

在推进 workflow builder、agent 生成的工作流激活、类 broker 执行或自动晋升之前，必须先建立此门禁。

## 组合规则

未来工作流应组合为**小图 + 类型化边界**，而不是单一大型可变图。

推荐模式：

```text
父级 runtime graph
  -> wrapper 节点将父 state 映射为子图输入
  -> 子图以内部 state 运行
  -> wrapper 节点将类型化输出映射回父 state
  -> audit event 记录 handoff
```

父 state 应保持小而稳定：

```text
run_id
symbol / universe / window
context_snapshot_id
evidence_refs
signal_ids
insight_candidate_ids
rule_candidate_ids
report_ids
approval_request_ids
audit_event_ids
capability_scope
```

子图可有更丰富的内部 state，但其对外输出应**有界且类型化**。

## 安全规则

- Agent 可**提议**工作流候选，但**不得**静默激活。
- 活跃工作流需要用户明确确认。
- Tool call 必须通过 capability policy。
- 模型学习可训练并评估 challenger 模型，但**不得**自动晋升。
- Rule discovery 与 reflection 可提议候选，但**未经人工审批不得**写入活跃 RulePack。
- 工作流**不得**绕过 Rule Engine、Risk Engine、只读边界或 audit logging。
- 长运行 workflow 必须留下 typed artifacts 与 audit events，不能依赖聊天上下文延续。
- LLM 节点应消费 compact evidence summary 与 `EvidenceRef`，不直接吞原始市场数据或大型 tool payload。

---

English version: [README.md](./README.md)
