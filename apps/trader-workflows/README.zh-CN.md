# Trader Workflows

`apps/trader-workflows` 是 trader-agent 系统的 LangGraph 工作流运行时包。

当前产品方向是 **工作流 + CLI/TUI + 后端/共享契约**。本包负责图执行、可 checkpoint 的运行实例，以及工作流级编排；**不**负责后端持久化规则、RulePack 激活、券商执行或 UI 界面。在两层目标架构中，本包属于 AI Analysis Layer。

项目级 agent 工程原则见 [08-agent-engineering-principles-proposal.md](../../project-docs/research-agent/target-system/trader-agent/08-agent-engineering-principles-proposal.md)。新增长运行 run、subagent、MCP/tool surface、skill 或 alpha research workflow 前，先按该文档检查边界。

当前 backlog 主线是 workflow 成熟度：[workflow-maturity-roadmap.md](../../project-docs/backlog/workflow-maturity-roadmap.md)。

## 两层系统目标

完整产品目标见 [Two-Layer Market Analysis And Execution System](../../project-docs/backlog/two-layer-market-analysis-and-execution-system.md)。

| 层 | 核心职能 | 主要 artifact | 边界 |
|---|---|---|---|
| AI Analysis Layer | 理解市场 context、监控紧凑实时状态、形成判断、从 outcome 学习、验证 rule candidate | `ContextSnapshot`、`DecisionEnvelope`、`EvaluationReport`、`InsightCandidate`、`RuleCandidate`、`OpportunityMap`、`RiskEnvelope`、`ExplorationPlan`、`ExecutionPolicy` | 不直接下单；本包负责 LangGraph workflow 部分 |
| Execution Simulation Layer | 消费 quote/depth/trade 实时流，模拟订单，记录成交、仓位、PnL 与执行质量 | `QuoteSnapshot`、`OrderBookSnapshot`、`TradeTick`、`MarketStateSnapshot`、`OrderIntent`、`RiskDecision`、`OrderEvent`、`PositionSnapshot`、`ExecutionFeedback` | 确定性订单状态机；未来实盘券商路径必须经过 approval 与 risk gate |

层间交接：

```text
Analysis Layer
OpportunityMap / RiskEnvelope / ExplorationPlan / ExecutionPolicy
  -> 聚焦的 paper/shadow exploration
  -> OrderEvent / PositionSnapshot / ExecutionFeedback
  -> FeedbackLearningWorkflow
```

实时市场数据属于 `LiveMarketDataPlane`，不是逐 tick LLM loop。AI 节点应消费紧凑的
market state snapshot、异常摘要和 typed evidence。

## 工作流清单

表中空白链接表示该 workflow 还没有独立开发文档。

在 AI Analysis Layer 内，后续规划从三条产品 workflow 出发。现有 graph 名称是这些 workflow 内的实现
artifact，不代表每个概念都要继续拆成独立 graph。

| 目标 workflow | 核心职能 | 核心链路 | 当前实现 artifact |
|---|---|---|---|
| `DecisionWorkflow` | 基于有边界的 context 做当前市场判断 | `context -> decision -> schedule future outcome` | `DecisionGraph`、`Stage1Runtime`、context snapshot inspection |
| `FeedbackLearningWorkflow` | 验证过去判断，总结有效/失败模式，并提出新的 insight candidate | `due outcomes -> label results -> evaluate patterns -> propose insights` | `OutcomeGraph`、`EvaluationGraph`、`InsightExplorationGraph` |
| `AlphaValidationWorkflow` | 验证 insight 是否能成为规则候选 | `insight -> rule candidate -> lite backtest -> safe review state` | `AlphaResearchGraph v0`、后端 Rule Discovery / Lite Backtest |

| Workflow | 状态 | 文档 |
|---|---|---|
| `Stage1Runtime` | 已实现 | [workflow runtime run/checkpoint/audit alignment](../../project-docs/backlog/now/workflow-runtime-run-checkpoint-audit-alignment.md) |
| `DecisionGraph` | 已实现 | [DecisionGraph maturity v1](../../project-docs/backlog/now/decision-graph-maturity-v1.md) |
| `OutcomeGraph` | `FeedbackLearningWorkflow` 的已实现 artifact | [T010: OutcomeGraph Maturity v1](../../.agent-dev/tasks/T010-outcome-graph-maturity-v1.md) |
| `EvaluationGraph` | `FeedbackLearningWorkflow` 的已实现 artifact | [T011: EvaluationGraph Maturity v1](../../.agent-dev/tasks/T011-evaluation-graph-maturity-v1.md) |
| `InsightExplorationGraph` | `FeedbackLearningWorkflow` 的已实现 artifact | [T012: InsightExplorationGraph Maturity v1](../../.agent-dev/tasks/T012-insight-exploration-graph-maturity-v1.md) |
| `AlphaResearchGraph` | `AlphaValidationWorkflow` 的已实现 v0 artifact | [T013: AlphaResearchGraph v0](../../.agent-dev/tasks/T013-alpha-research-graph-v0.md) |
| `MarketJudgmentGraph` | 暂缓；默认作为 operator view，除非通过拆分边界检查 |  |
| `ModelLearningGraph` | 暂缓；默认作为后续 gated capability，除非通过拆分边界检查 |  |
| `ReflectionGraph` | 暂缓；默认作为 feedback report / proposal section，除非通过拆分边界检查 | [Reflection Engine](../../project-docs/research-agent/target-system/trader-agent/01-agent-core-development/18-reflection-engine.md) |
| `RuntimeOrchestrator` | 后端依赖 | [workflow runtime run/checkpoint/audit alignment](../../project-docs/backlog/now/workflow-runtime-run-checkpoint-audit-alignment.md) |
| `Rule Discovery / Lite Backtest` | 后端依赖 | [alpha research engineering principles](../../project-docs/research-agent/target-system/trader-agent/08-agent-engineering-principles-proposal.md) |
| `Memory Review / Activation` | 后端依赖 | [alpha research engineering principles](../../project-docs/research-agent/target-system/trader-agent/08-agent-engineering-principles-proposal.md) |
| `Audit / Rebuild Workflow` | 后端依赖 | [workflow runtime run/checkpoint/audit alignment](../../project-docs/backlog/now/workflow-runtime-run-checkpoint-audit-alignment.md) |
| `Approval / Capability Gate` | 后端依赖 |  |

## 项目里程碑与推进计划

后续 roadmap 按依赖顺序推进，不按表格顺序机械实现。共享契约仍在变化时使用
**严格串行门禁**。目标是打通“市场事实 -> 分析判断 -> 模拟执行 -> 执行反馈 -> 学习”的完整闭环。

| Milestone | 目标 | 交付物 | 退出标准 |
|---|---|---|---|
| M0 Analysis Core Closeout | 在增加 execution scope 前关闭当前分析层工作 | T010-T013 状态对齐、review blocker closeout、workflow README/roadmap 一致 | `DecisionWorkflow -> FeedbackLearningWorkflow -> AlphaValidationWorkflow` 可检查、文档一致、无漂移 |
| M1 Analysis-to-Execution Contract | 定义分析层如何指导执行层，但不变成订单控制 | [`OpportunityMap`、`RiskEnvelope`、`ExplorationPlan`、`ExecutionPolicy` spec](../../project-docs/backlog/now/analysis-to-execution-contract-v0.md) | AI 只输出机会/风险/约束；任何 artifact 都不能被解释为券商订单命令 |
| M2 LiveMarketDataPlane v0 | 建立实盘事实入口 | [`QuoteSnapshot`、`OrderBookSnapshot`、`TradeTick`、`MarketStateSnapshot`、provider trace、quality flags、replay/inspection contract](../../project-docs/backlog/now/live-market-data-plane-v0.md) | 只读 quote/depth/trade 可归一化、可检查、可 replay，且不涉及订单执行 |
| M3 PaperTradingEngine v0 | 建立确定性模拟订单内核 | `OrderIntent`、`RiskDecision`、`OrderEvent`、`PositionSnapshot`、PnL/slippage model、replay tests | 给定 market state + policy，订单状态、成交、仓位与 PnL 可复现 |
| M4 Guided Paper Exploration | 让分析层指导局部 paper/shadow exploration | `ExecutionPolicy -> RiskGate -> PaperTradingEngine -> ExecutionFeedback` 路径 | paper/shadow exploration 只在已批准的机会/风险边界内运行，并产出执行反馈 |
| M5 Execution Feedback Learning | 将执行现实回流分析层 | `ExecutionFeedback` evaluation inputs、report sections、insight/rule-candidate improvement handoff | report 能区分判断质量、规则边际、执行可行性、滑点与风险行为 |
| M6 Operator Surface And Approval Gate | 让人能管理风险边界 | CLI/TUI/cockpit inspection、approval requests、kill switch、audit trail | 高风险动作在激活或执行前可检查、可拒绝、可审计 |
| M7 Shadow / Live Broker Gate | 只在 paper 证据成熟后考虑真实券商集成 | broker adapter spec、最小 shadow/live pilot plan、capability policy | M1-M6 证据被接受且 approval gate 已实现前，不存在 live path |

交付策略：

1. M0 已关闭当前分析层。T010-T013 已在 task/spec/README 对齐；除非有已 review
   的边界说明，否则不重新拆 graph。
2. M1 是第一个新的设计切片。必须先定义 `OpportunityMap`、`RiskEnvelope`、
   `ExplorationPlan`、`ExecutionPolicy`，再进入执行模拟开发。
3. `LiveMarketDataPlane` 契约已完成；实现必须先通过 M2
   [implementation decision gate](../../project-docs/backlog/now/live-market-data-plane-implementation-decision-gate.md)，
   `PaperTradingEngine` 才能依赖它。
4. paper/shadow execution 必须使用确定性状态迁移；LLM 不得处在逐 tick 订单路径中。
5. 不要把 `MarketJudgmentGraph`、`ReflectionGraph`、`ModelLearningGraph`
   拆成独立实现，除非已 review 的 spec 证明它们有独立时间节奏、风险等级、
   approval、source-of-truth 或恢复边界。
6. 后端工作不是最后单独做的大阶段。每个 milestone 只补验收所需的最小后端 slice。
7. broker adapter 只属于 M7。它需要已接受的 paper/shadow 证据、approval gate 和已 review 的实现 spec。

## 执行与管理模型

三条 workflow lane 应作为操作者日常流程与分析层使用，而不是自动交易系统。

| Workflow lane | 何时运行 | 触发方式 | 主要 artifact | 操作者怎么用 |
|---|---|---|---|---|
| `DecisionWorkflow` | 按需或固定市场观察窗口 | CLI/TUI/operator scheduler | `ContextSnapshot`、`DecisionEnvelope`、scheduled future outcomes | 查看当前判断、证据引用和待验证 outcome；默认不执行交易 |
| `FeedbackLearningWorkflow` | outcome 到期后，以及日/周复盘窗口 | scheduler 或 operator review command | finalized outcome labels、`EvaluationReport`、`InsightCandidate` | 查看哪些判断有效/失败，并选择哪些 insight candidate 进入 alpha validation |
| `AlphaValidationWorkflow` | 仅对已选中且 seed/context 完整的 insight candidate 运行 | operator 或 approved research queue | `RuleCandidate`、`LiteBacktestReport`、safe review state | 检查 backtest 证据，并选择 reject / needs more data / shadow track / manual approval |

管理规则：

1. `Stage1Runtime` 统一管理 run id、checkpoint、resume 和有边界的 run output。
2. 后端 API 拥有持久领域事实：context snapshots、decisions、outcomes、reports、
   insight candidates、rule candidates、audit events。
3. CLI/TUI 只做薄操作者界面：触发运行、查看 artifact、发起 approval；不承载
   workflow 逻辑。
4. 低风险 labeling/reporting 可以 schedule。validation、approval、promotion、
   RulePack mutation、model switching、execution 都必须人工门禁。
5. workflow 之间通过 typed artifact id 交接，不依赖聊天上下文或隐藏 graph state。
6. 对执行层的指导必须表达为 `OpportunityMap`、`RiskEnvelope`、`ExplorationPlan`
   或 `ExecutionPolicy`；workflow 不得输出券商订单命令。

## 架构

```text
操作者界面
apps/trader-cli / 未来 TUI
  |
  v
AI Analysis Layer
工作流运行时
apps/trader-workflows
  |
  |-- Stage1Runtime                 [已实现]
  |
  |-- DecisionWorkflow
  |   `-- DecisionGraph             [已实现]
  |
  |-- FeedbackLearningWorkflow
  |   |-- OutcomeGraph              [已实现 artifact]
  |   |-- EvaluationGraph           [已实现 artifact]
  |   `-- InsightExplorationGraph   [已实现 artifact]
  |
  |-- AlphaValidationWorkflow
  |   `-- AlphaResearchGraph        [已实现 artifact: v0]
  |
  |-- Market / Reflection / Model views
      `-- 暂缓，除非拆分边界 spec 证明需要独立 workflow
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
  |
  v
Execution Simulation Layer          [未来 spec track]
  |-- LiveMarketDataPlane
  |-- PaperTradingEngine
  |-- RiskGate
  |-- OrderEventStore
  `-- BrokerAdapter                 [未来，approval-gated]
```

## 已实现工作流

### Stage1Runtime

`Stage1Runtime` 是工作流运行时基础层，负责创建运行实例、记录 checkpoint、支持运行检查与中断恢复。

职责：

- 创建持久化 `workflow_runs`；
- 写入工作流 checkpoint；
- 提供 `runs list`、`runs show`、`runs resume`、`runs monitor`、
  `runs trace` 原语；
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

#### CLI：`runs monitor` 与 `runs trace`

使用 `npm run workflows -- runs monitor [--status STATUS] [--graph-name NAME]
[--limit N] --json` 查看有界 run-monitor 摘要（`limit` 最大 200）。`data.runs[]` 每项包含 run
身份、状态、当前节点、时间戳、`duration_ms`、`checkpoint_count`、
`latest_checkpoint_ref`、`has_error`、`latest_error`、`resumable`；默认不暴露
原始 input 或 output。

使用 `npm run workflows -- runs trace RUN_ID --json` 查看单次运行的紧凑执行链。
返回 envelope 为
`{ ok, command, run_id, status, data: { run, checkpoints, output_summary,
resume_hint } }`。checkpoint 按 `seq` 排序，只包含紧凑 `state_summary`
元数据，不返回原始 checkpoint state。该命令只读，不执行 retry、replay、
cancel、approval 或 workflow edit。

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

`OutcomeGraph` 是 **native LangGraph** 工作流（`langgraph.json` 中的 `outcome_graph`），也可通过 CLI（`outcomes run --due`）运行。

`OutcomeGraph` 在市场数据足够时关闭 pending decision outcome 和 insight candidate outcome。

职责：

- 查找到期的 pending decision outcome 和 insight candidate outcome；
- 使用归一化标签标注结果（`hit`/`miss`/`neutral`/`invalid`/`insufficient_data`）；
- 需要新证据时，构建紧凑证据摘要（上限 15 行）；
- 不修改 context snapshot；
- 输出 finalized、skipped、failed 计数，按 source type 和归一化标签分组。

这是第一个反馈闭环。没有它，系统能做出决策，但无法知道决策是否有效。

### EvaluationGraph

`EvaluationGraph` 是 **native LangGraph** 工作流（`evaluation_graph`），也可通过 CLI（`eval summary`）运行。

`EvaluationGraph` 将 outcome 聚合为 evaluation report。

职责：

- 聚合 decision outcome 与 insight candidate outcome 表现；
- 构建包含结构化 sections 的 evaluation report（decision_performance、
  insight_candidate_performance、top_positive_patterns、top_negative_patterns、
  failure_modes、data_gaps、evidence_refs）；
- 基于已记录事实评估规则或模型行为；
- **不**自动晋升模型或变更配置。

该图只能推荐 `hold` 或 `needs_more_data`，**不得**静默晋升模型、改变生产行为或修改活跃 RulePack 策略。

#### CLI：`eval summary`

使用 `npm run workflows -- eval summary --symbol TSLA.US --json`。返回 envelope 为
`{ ok, command, run_id, status, data }`，其中 `data` 包含有界 report 字段与结构化
`sections`（decision_performance、insight_candidate_performance、
top_positive_patterns、top_negative_patterns、failure_modes、data_gaps、
evidence_refs）。

### InsightExplorationGraph

`InsightExplorationGraph` 是 **native LangGraph** 工作流（`insight_exploration_graph`），也可通过 CLI（`insights explore --symbol … --window …`）运行。

`InsightExplorationGraph` 基于 evaluation 驱动，从 context snapshot、outcome 摘要与 evidence 中探索候选 insight。

职责：

- 检查 context snapshot 与历史 outcome（评估驱动探索；**不**直接读取原始市场/新闻数据）；
- 生成有边界的 `InsightCandidate` 记录；
- 附加 evidence references；
- 每个候选持久化后调度 `InsightCandidateOutcome`
  （`POST /insight-candidate-outcomes/schedule`），使下游 `OutcomeGraph` 到期后可标注该 insight；
- 强制执行 horizon 白名单约束（`1m`/`2m`/`5m`/`30m`/`1h`/`2h`/`4h`；语义不明确时默认 `2m`）；
- 强制执行 proposal 权重上限与 forbidden capability 边界；
- **不**执行交易、模型训练、晋升、生成 `RuleCandidate`、修改 `RulePack`、激活 lesson 或直接修改 lesson。

图结构：

```text
normalize_input
-> fetch_exploration_inputs
-> run_insight_react
-> build_insight_payload
-> persist_insight_candidate  （持久化 + 调度 outcome）
-> final_output
```

Stage1 API 契约（workflow 客户端见 `insightCandidates.ts` / `outcomes.ts`）：

- **持久化**（`POST /insight-candidates`）：顶层字段与后端 `InsightCandidateInput` 对齐
  （`insight_id`、`run_id`、`symbols_json`、窗口边界、`thesis`、`evidence_refs_json`、
  `verification_status`、`weight_cap`、`candidate_json`）。探索元数据
  （`origin_category`、`horizon`、`horizon_source`）存放在 `candidate_json` 内，
  **不**作为额外顶层列发送。
- **调度**（`POST /insight-candidate-outcomes/schedule`）：请求体为
  `{ outcomes: [{ insight_id, symbol, horizon, evidence_refs_json,
  reason_codes_json, outcome_json? }] }`；响应为 `{ items: [...], count }`。
  后端推导 `due_at`；本图只负责调度。

部分失败语义：`persist_insight_candidate` 先持久化、再调度。若持久化成功但调度失败，
节点抛出 `InsightSchedulingError`（含 `insight_id`、`horizon`、`persisted: true`、
`schedulePayload`、`cause`）。恢复方式为对相同 `insight_id` + `horizon` 做幂等重试调度，
**不**静默降级。

可选图输入：`evaluation_report_id` 可加载有界 `EvaluationReport` 以推导
`origin_category` 与探索上下文；拉取失败不阻断主路径。

#### CLI：`insights explore`

使用 `npm run workflows -- insights explore --symbol TSLA.US --window 30d --json`。
返回 envelope 为 `{ ok, command, run_id, status, data }`，其中 `data` 包含
`insight_id`、窗口边界、`react_step_count`、`thesis`、`verification_status`、
`weight_cap`、`evidence_ref_count`、`persisted_candidate`、`scheduled_outcome_id`、
`scheduled_outcome_horizon`。

这是当前最接近 alpha 发现的已实现入口：产出候选 insight，但不完成正式的 alpha 研究与 lite backtest 链路。

### AlphaResearchGraph

状态：已实现 (v0)，任务 [T013](../../.agent-dev/tasks/T013-alpha-research-graph-v0.md)。

`AlphaResearchGraph v0` 是正式 alpha 验证工作流，不是完整 research-agent harness。通过 LangGraph Studio（`alpha_research_graph`）或 `runAlphaResearchGraph()` 运行；**v0 无 CLI 子命令**。

v0 职责：

- 接收标准 `AlphaResearchInput`（`insight_id`、`symbol`、`thesis`、`evidence_refs`、`alpha_seed`、backtest window）；
- 校验失败时以 `input_validation_failed` 停止（与后端 `needs_more_data` 区分）；
- 通过 `POST /api/rule-candidates` 创建 `RuleCandidate`；
- 在 `run_lite_backtest` 节点内编排 evidence → lite backtest → advance → report；
- 返回 `rule_candidate_id`、`lite_backtest_report_id`、最终状态与安全标记。

Studio 输入示例字段：`insight_id`、`symbol`、`thesis`、`evidence_refs`、`alpha_seed`、`backtest_window_start`、`backtest_window_end`。

v0 不做：context hydrate、开放式研究、LLM 补字段、CLI 包装。research-agent 版本见 [AlphaResearchAgent v1](../../project-docs/backlog/later/alpha-research-agent-v1.md)。

## 暂缓拆分候选

### MarketJudgmentGraph

状态：暂缓作为独立 workflow。

市场判断应先作为 `DecisionWorkflow` 与 `FeedbackLearningWorkflow` artifact
之上的 operator-facing view。

预期职责：

- 汇总当前市场 context；
- 产出 `MarketRead`；
- 识别机会偏向（opportunity bias）；
- 构建 watchlist；
- 定义 trigger 与 invalidation；
- 为 CLI/TUI 审查 surfaced 风险警告。

只有当已 review 的 spec 证明它有独立时间节奏、风险、source-of-truth、恢复
或 approval 边界时，才拆成 `MarketJudgmentGraph`。它不能成为另一条 alpha
discovery 路径。

### ModelLearningGraph

状态：暂缓作为独立 workflow。

模型学习是后续 gated capability，不是下一条默认 workflow。

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

首个合理目标仍是 `opportunity_ranking_model`，而非完整交易策略模型。除非
approval、audit、dataset、checkpoint、promotion 边界明确，否则不拆成独立
workflow。

### ReflectionGraph

状态：暂缓作为独立 workflow；后端模块文档已较成熟，但 reflection 应先作为
`FeedbackLearningWorkflow` 的 report / proposal sections。

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
