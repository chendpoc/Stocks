# 15. AI Quant Book Reference — 外部设计参考与开发行动

> 状态: design | 依赖: `00_README.md`, `02_architecture_overview.md`, `07_decision_envelope.md`, `08_outcome_and_evaluation.md`, `09_pattern_memory_and_learning.md`, `14_llm_reasoning_strategy.md`

## 1. 文档目的

本文档沉淀深度阅读 [AI Quantitative Trading: From Zero to One](https://github.com/waylandzhang/ai-quant-book)（Wayland Zhang 著）后的设计参考，并转化为 Market Agent 系统的具体开发行动。

参考源为书籍全部 5 部分（22 课 + 30 篇背景知识 + 4 篇附录），重点提取与 Multi-Agent 架构、Regime Detection、Risk Control、Context Engineering、Data Pipeline 和 Strategy Lifecycle 相关的设计决策。

**核心原则**：不是照搬书的策略（趋势/均值回归/统计套利），而是将书的架构方法论映射到 Market Agent 现有模块骨架上进行增量开发。

---

## 2. 两套系统的定位关系

| 维度 | ai-quant-book | Market Agent（我们） |
|---|---|---|
| **Alpha 来源** | 市场数据信号 + ML 模型 | 交易员语料认知 + 市场数据验证 |
| **LLM 角色** | 辅助（Regime 解读、自然语言报告） | 认知核心（语料理解、假说生成、复盘解释） |
| **决策权** | Risk Agent 一票否决 | RiskGate 确定性门禁（已设计） |
| **标的池** | 可扩展 | 固定股票池 |
| **频率** | 中频（日内到周级） | 日级别（盘前/盘中/收盘） |
| **策略进化** | 在线学习 + 策略衰减检测 | PatternMemory 规律记忆 + 复盘回标 |

**两套系统互补**：书的架构偏「市场信号→策略→执行」的传统量化路线，Market Agent 是「交易员认知→市场验证→假说→机会」的认知路线。书的工程架构在 Regime Detection、Risk Gate 强化、Setup 衰减监控等方面直接可用。

---

## 3. 书中 12 个高价值参考点 → 开发行动

以下按优先级分为三个梯队，每个梯队内的条目按投入产出比排序。

---

### 🔴 第一梯队：直接落地的架构增强（P0）

#### 3.1 Regime Detection — 市场状态识别

**书中设计**（第12课）：Meta Agent 持续判断市场处于 趋势/震荡/危机 三种状态，并根据状态路由信号到不同的专家策略 Agent。

**Market Agent 现状**：
- `DecisionGraph` 已有 `market_state`（见 `07_decision_envelope.md` 第4节），但当前只是一个简单的 `trending | ranging | volatile` 枚举，缺少量化的 Regime 判定逻辑。
- `RiskGate` 已设计（`07_decision_envelope.md` 第3节），但未考虑 Regime 上下文的下游影响。

**开发行动**：

| 任务 | 位置 | 说明 |
|---|---|---|
| **Regime Detector 模块** | `apps/trader-agent/backend/app/intel/features/regime_detector.py`（新建） | 实现三类市场状态的量化判定逻辑 |
| **判定规则** | 同上 | 趋势市：ADX > 25 + 价格在 20MA 上方 + VIX < 20；震荡市：ADX < 20 + 布林带收窄 + 价格在区间内；危机/恐慌市：VIX > 30 + 广度指标恶化 |
| **注入 DecisionEnvelope** | `apps/trader-workflows/src/llm/decisionEnvelope.ts` | 将 `regime` 字段从枚举扩展为结构体：`{ state, confidence, indicators, transition_risk }` |
| **下游影响** | `RiskGate`、`setup_detector` | 不同 Regime 下自动调整扫描灵敏度（危机市降低信号阈值，趋势市提高） |
| **LLM 上下文注入** | `build_evidence` 节点（`14_llm_reasoning_strategy.md` 第3节） | Evidence Builder 的输入增加 `market_regime` 字段 |

**验收标准**：
- `regime_detector.py` 输出结构化 `RegimeResult(state, confidence, indicators, transition_risk)`
- `DecisionEnvelope` 包含 `market_regime` 字段
- RiskGate 在 `volatile` 或 `crisis` 状态下自动降低 `confidence_contribution` 权重

**对应书中章节**：第12课「市场状态识别」+ 第13课「Regime误判与系统性崩溃模式」

---

#### 3.2 Risk Gate 强化 — 从单层门禁到多层风控

**书中设计**（第11/15课）：Risk Agent 对所有交易决策拥有一票否决权，独立于任何信号 Agent。三层决策仲裁机制：层级结构、投票机制、一票否决。

**Market Agent 现状**：
- `RiskGate` 已在 `07_decision_envelope.md` 第3节设计，但当前仅覆盖 `position_size_check`、`max_drawdown_check`、`correlation_check`。
- 缺少**连续亏损熔断**和**事件窗口过滤**。

**开发行动**：

| 任务 | 位置 | 说明 |
|---|---|---|
| **连续亏损熔断** | `RiskGate` 节点扩展 | 连续 N 笔 `decision_outcomes.is_loss = true` 后暂停新 `DecisionEnvelope` 生成，状态机: `active → cooling_off → active` |
| **事件窗口过滤** | `RiskGate` 节点扩展 | FOMC 会议 / 财报日前后 ±30min 自动降低信号权重 50%；重大事件期间标记 `elevated_event_risk` |
| **仓位风控** | `RiskGate` 节点扩展 | 单标的仓位上限、组合总敞口上限；从 `model_decisions` 表计算当前活跃仓位 |
| **信号相关性检查** | `RiskGate` 节点扩展 | 当同一方向出现 3+ 个信号时自动标记 `concentration_warning`；计算活跃信号的隐式 Beta 暴露（对 QQQ/SPY 的回归） |
| **RiskVerdict 结构化输出** | `decisionEnvelope.ts` | RiskGate 输出必须是结构化的 `{ pass | warn | block, reasons[], risk_score }`，不能只是日志 |

**验收标准**：
- 模拟连续 5 笔亏损后，系统自动进入 `cooling_off`，暂停输出新 DecisionEnvelope
- FOMC 日 DecisionEnvelope 的 `confidence_contribution` 自动打折
- 同一方向 3+ 信号时 `DecisionEnvelope.risk_flags` 包含 `concentration_warning`
- `RiskGate` 输出为 TypedDict/interface，可被 Audit 追踪

**对应书中章节**：第11课「为什么需要多智能体」+ 第15课「风险控制与资金管理」+ 第16课「组合构建与风险暴露管理」

---

#### 3.3 Setup 衰减监控 — 策略生命周期管理

**书中设计**（第01课 + 第17课）：策略有明确生命周期 `发现→验证→部署→衰减→退役`，系统持续监控策略衰减信号。

**Market Agent 现状**：
- `PatternMemory` 已设计（`09_pattern_memory_and_learning.md`），包含规律状态机 `active → degrading → retired`。
- 但**衰减触发**是手工的（依赖于 `EvaluationGraph` 的周期性评估），缺少自动的统计监控。

**开发行动**：

| 任务 | 位置 | 说明 |
|---|---|---|
| **Setup 胜率追踪** | `apps/trader-agent/backend/app/intel/postmortem/` | 为每个活跃 setup（VWAP Reclaim / RS Pullback / ORB / Gap Hold / Daily Breakout Retest）持续计算滚动胜率（最近 N=20 笔） |
| **衰减判定规则** | 同上 | 当滚动胜率 < 历史均值 -1σ → 标记 `degrading`；< 历史均值 -2σ 且持续 ≥5 笔 → 标记 `retired` |
| **自动触发 Rule Discovery** | `AlphaResearchGraph` 扩展 | 当一个 setup 被标记 `degrading` 时，自动触发一次 `RuleCandidate` 生成（基于近期复盘数据寻找新的有效条件组合）。不走自动上线——仍走 `LiteBacktest → 人工审批` 流程 |
| **衰减状态写入 PatternMemory** | `pattern_memories` 表 | `status` 字段的变更必须记录 `status_changed_at` 和 `status_change_reason` |

**验收标准**：
- `EvaluationGraph` 运行后自动更新每个 setup 的滚动胜率
- 任一 setup 满足衰减条件时，`pattern_memories.status` 自动更新为 `degrading` 或 `retired`
- `degrading` 触发后在 `AlphaResearchGraph` 的待处理队列中出现对应的 `RuleCandidate` 草稿

**对应书中章节**：第01课「策略生命周期」+ 第17课「在线学习与策略进化」

---

### 🟡 第二梯队：中期增强（P1）

#### 3.4 复盘引入 Triple Barrier 标签

**书中设计**（第09课）：Triple Barrier 标签方法——标签必须反映可执行的交易决策。上盈 barrier、止损 barrier、时间 barrier 嵌入标签定义。

**Market Agent 现状**：
- `OutcomeGraph` 评估 1D/3D/5D 结果（`08_outcome_and_evaluation.md`），但标签定义较粗（涨了/跌了/横盘）。

**开发行动**：

| 任务 | 位置 | 说明 |
|---|---|---|
| **Triple Barrier 标签定义** | `apps/trader-workflows/src/graphs/01-outcome/` | 为每个 DecisionEnvelope 定义三个 barrier：`profit_barrier`（1R/2R）、`stop_barrier`（最大可接受亏损）、`time_barrier`（最长持有期） |
| **Outcome 评估增强** | `OutcomeGraph` | 回标结果时同时报告三个 barrier 的触及情况：`hit_profit_first | hit_stop_first | hit_time_first | none` |
| **区分"好信号运气差"与"坏信号运气好"** | 同上 | 触及上盈 barrier 但在时间 barrier 内回撤到止损 → 信号好但时机差；连续多次 hit_time_first → 信号方向对但持有期过长 |

**验收标准**：
- `decision_outcomes` 表新增 `barrier_result` 字段
- `EvaluationGraph` 报告中包含 Triple Barrier 维度的统计（上盈率/止损率/时间到率）
- 复盘报告能区分"好信号运气差"和"坏信号运气好"

**对应书中章节**：第09课「监督学习在量化中的应用」→ Triple Barrier 背景知识

---

#### 3.5 Context Engineering — compact 模式

**书中设计**（第14课 + Anhtropic context engineering 原则）：LLM 不应接收完整市场数据，而应接收 compact evidence summary。Agent 需要更多信息时通过 scoped tool 调用加载。

**Market Agent 现状**：
- `14_llm_reasoning_strategy.md` 已有输出长度约束（`evidence_text ≤200 tokens`），但输入侧未做 compact 优化。
- `build_evidence` 节点的输入目前是完整 `features + market_state + setup_name`。

**开发行动**：

| 任务 | 位置 | 说明 |
|---|---|---|
| **Compact Evidence 模式** | `build_evidence` 节点 | 默认只注入：top-3 信号 + top-5 相关语料片段 + 摘要级市场快照 + regime 判定 |
| **按需扩展** | `build_evidence` 工具白名单（`14_llm_reasoning_strategy.md` 3.2节） | LLM 觉得信息不够时，通过 `fetch_market_bars` / `search_recent_events` 主动请求更多上下文 |
| **原始数据回溯** | artifact store | 原始 K 线、全文新闻、回测明细通过 `EvidenceRef` 链接引用，不入 LLM 上下文 |

**验收标准**：
- `build_evidence` 节点的输入 token 数降至当前的 50% 以下
- LLM 仍能通过工具调用获取所需补充信息
- 所有原始数据引用均有 `EvidenceRef` 可追溯

**对应书中章节**：第14课「LLM在量化中的应用」+ 08-agent-engineering-principles-proposal.md 第5-6节

---

#### 3.6 数据质量标记 — 防御性数据管道

**书中设计**（第06课）：API 调用的防御性编程范式——指数退避重试、NaN 检测、数据完整性验证。数据管道三原则：不可变性、可追溯性、冗余备份。

**Market Agent 现状**：
- `DataQualityGate` 已设计（`02_architecture_overview.md`），负责数据延迟/缺失/冲突检查。
- 但缺少数据完整性阈值检查和质量评分字段。

**开发行动**：

| 任务 | 位置 | 说明 |
|---|---|---|
| **数据完整性阈值** | `DataQualityGate` | 当实际数据点 < 预期 90% 时标记 `quality_degraded`，< 50% 时标记 `quality_critical` |
| **质量评分字段** | `market_bars` 表 | 新增 `quality_score` (0-100)、`gap_count`、`source` 字段 |
| **防御性拉取审查** | `ingestion/` | 审查现有数据拉取代码，确保有：指数退避重试、NaN 检测与前值填充、多异常类型分治处理 |

**验收标准**：
- `DataQualityGate` 的输出包含 `quality_score` 和 `gap_count`
- 低于 90% 完整性的数据批次自动标记，不出现在 `DecisionEnvelope` 的 feature 计算中
- 所有 `ingestion/` 拉取器使用统一的 `RetryConfig` (max_retries=3, backoff_factor=2)

**对应书中章节**：第06课「数据工程的残酷现实」

---

### 🟢 第三梯队：长远方向（P2-P3）

#### 3.7 最低交易成本估算

**书中设计**（第18课）：Gross Alpha ≠ Net Alpha。成本四层金字塔：佣金 + 滑点 + 市场冲击 + 机会成本。

**开发行动**：`OutcomeGraph` 评估中加入最低成本估算——即使不实盘，也在复盘报告中标注"假设成交成本 X%，净收益调整为 Y%"。当任何信号在 1% 滑点下就变负时，自动标记 `liquidity_risk`。

**对应书中章节**：第18课「交易成本建模与可交易性」

---

#### 3.8 执行幻觉预防

**书中设计**（第19课）："如果你把行情价格当成成交价格，你训练出来的不是交易系统，而是幻觉。"

**开发行动**：`OutcomeGraph` 评估中引入 ±滑点敏感度分析——报告信号 P&L 对 ±0.5%/±1% 滑点的敏感性。

**对应书中章节**：第19课「执行系统 - 从信号到真实成交」

---

#### 3.9 生产运维健康检查

**书中设计**（第20课）：监控覆盖数据延迟、信号健康、执行质量、系统资源四层。

**开发行动**：在 `apps/trader-agent/backend/app/intel/api/` 下新增 `health.py`，暴露 `GET /api/health`，返回：数据新鲜度、信号生成状态、DB 连接状态、最近复盘完成时间。CLI `/ops` 面板可展示。

**对应书中章节**：第20课「生产运维」

---

#### 3.10 Modular Monolith 确认

**书中设计**（第21课 + 第01课注释）：推荐从 Modular Monolith 起步——所有模块在同一进程内运行，通过清晰接口通信。

**开发行动**：审查 `apps/trader-agent/backend/app/intel/` 子模块（ingestion/features/context/trade/postmortem/api）之间的公开接口是否清晰（通过 `__init__.py` 暴露 vs 内部实现直接引用）。如不清，收紧模块边界。

**对应书中章节**：第21课「项目实战」

---

### 设计理念对齐（不需要额外代码开发，但需要在后续设计中持续遵守）

| 原则 | 书中表达 | Market Agent 现状 | 判定 |
|---|---|---|---|
| LLM 不直接交易 | Agent 是工具，Alpha 来自策略设计和风控纪律 | RiskGate > LLM，14_llm_reasoning_strategy.md 已约束 | ✅ 已对齐 |
| 风控独立且有否决权 | Risk Agent 一票否决 | RiskGate 已设计，本次强化后更完整 | ✅ 强化中 |
| 持续进化 | 策略生命周期 + 在线学习 | PatternMemory + EvaluationGraph + AlphaResearchGraph | ✅ 已设计 |
| 固定战场 | 中频、聚焦特定策略类型 | 固定股票池 + 固定 setup 类型 | ✅ 已对齐 |
| 从简单开始 | Modular Monolith 起步 | intel 子系统内部模块化 | ⚠️ 待确认边界清晰度 |

---

## 4. 实施顺序

推荐按以下顺序推进，前一步不阻塞后一步的独立模块可并行：

```text
Phase 1（当前迭代，P0）：
  1. Regime Detector 模块 (3.1)
  2. Risk Gate 强化 — 连续亏损熔断 + 事件窗口 (3.2)
  3. Setup 衰减监控 (3.3)

Phase 2（下一迭代，P1）：
  4. Triple Barrier 标签 + Outcome 增强 (3.4)
  5. Context compact 模式 (3.5)
  6. 数据质量评分字段 (3.6)

Phase 3（远期，P2-P3）：
  7. 最低成本估算 (3.7)
  8. 滑点敏感度分析 (3.8)
  9. 健康检查 API (3.9)
  10. Modular Monolith 边界审查 (3.10)
```

---

## 5. 与现有模块的衔接

| 参考点 | 新增/修改的模块 | 不影响 |
|---|---|---|
| Regime Detection | `features/regime_detector.py`（新）、`decisionEnvelope.ts`（改） | `RiskGate`、`SetupDetector`、`FeatureEngine` |
| Risk Gate 强化 | `RiskGate` 节点（改）、`decisionEnvelope.ts`（改） | `DecisionGraph` 整体流程 |
| Setup 衰减 | `postmortem/`（新）、`AlphaResearchGraph`（改） | `PatternMemory` 状态机本身 |
| Triple Barrier | `OutcomeGraph`（改）、`decision_outcomes` 表（改） | `DecisionGraph` 生成逻辑 |
| Context compact | `build_evidence` 节点（改） | LLM 工具白名单不变 |
| 数据质量 | `DataQualityGate`（改）、`market_bars` 表（改） | `ingestion/` 拉取器 |

---

## 6. 风险与边界

- **Regime Detection 不能替代 RiskGate**：Regime 是输入信息，RiskGate 是决策门禁。即使 Regime 判断错误，RiskGate 也必须拦住危险操作。书中也明确指出 Regime 误判是系统性崩溃的主要来源（第13课）。
- **衰减监控不自动上线新规则**：满足衰减条件后自动生成 RuleCandidate 草稿，但仍必须走 `LiteBacktest → 人工审批` 流程。不违反 `08-agent-engineering-principles-proposal.md` 第3节"Agent Autonomy 受控"原则。
- **Triple Barrier 不改变现有信号生成逻辑**：Triple Barrier 是回标方法，不是信号生成方法。不影响 `DecisionGraph` 的 setup 判定逻辑。
- **成本估算仅为标注，不用作决策**：不实盘阶段，成本估算只是复盘参考值。当 `liquidity_risk` 标记出现后，仅降低复盘报告的置信度说明，不阻止信号生成。

---

## 7. 验收标准（全局）

完成 Phase 1 后：
- [ ] `regime_detector.py` 可独立运行，输出三类市场状态及置信度
- [ ] `DecisionEnvelope` 包含 `market_regime` 字段
- [ ] RiskGate 在连续 5 笔亏损后触发 `cooling_off`
- [ ] RiskGate 在 FOMC 日自动降低信号权重
- [ ] Setup 滚动胜率低于 -2σ 时自动标记 `retired`

完成 Phase 2 后：
- [ ] `decision_outcomes` 表包含 Triple Barrier 结果字段
- [ ] `build_evidence` 输入 token 量降至当前 50%
- [ ] `market_bars` 表包含 `quality_score` 字段

完成 Phase 3 后：
- [ ] 复盘报告包含 ±1% 滑点敏感度分析
- [ ] `GET /api/health` 返回系统状态快照

---

## 8. 参考源

- **书籍主体**：`D:\workspace\05-finance\ai-quant-book-main\manuscript\cn\` 全部 22 课
- **Part 1**：量化交易全景图、多智能体协作模式
- **Part 2**：数据工程、回测陷阱、Beta/对冲
- **Part 3**：监督学习在量化中的应用、从模型到 Agent
- **Part 4**：多智能体架构、Regime Detection、LLM 应用、风控、组合构建、在线学习
- **Part 5**：交易成本、执行系统、生产运维、项目实战
