# 16. AI Agent Book Reference — Agent 工程原则与候选增强

> 状态: reference | 依赖: `00_README.md`, `02_architecture_overview.md`, `09_pattern_memory_and_learning.md`, `14_llm_reasoning_strategy.md`, `15_ai_quant_book_reference.md`
>
> **执行边界**: 本文是外部参考，不是当前 Market Agent source-of-truth。本文中的候选增强只有被 `12_development_phases.md`、`13_acceptance_tests.md` 或 `.agent-dev/tasks/T021`-`T027` 明确采纳后，才可以进入 worker 实现。

## 1. 文档目的

本文档沉淀深度阅读 [AI Agent Architecture: From Concept to Production](https://github.com/waylandzhang/ai-agent-book)（Wayland Zhang 著）后的 Agent 工程原则和架构参考，并转化为 Market Agent 系统的候选增强建议。

与 `15_ai_quant_book_reference.md`（聚焦金融领域策略和风控）不同，本文档聚焦**通用 Agent 工程原则**——编排模式、上下文管理、记忆分层、工具设计、评估体系和生产架构。

参考源为书籍全部 9 部分 33 章。重点提取与我们系统直接相关的 Part 3（上下文与记忆）、Part 4（单 Agent 模式）、Part 5（多 Agent 编排）、Part 7（生产架构）。

---

## 2. ai-agent-book 全局结构

| 部分 | 主题 | 章节 | 与我们系统的相关性 |
|---|---|---|---|
| Part 1 | Agent 基础 | 2 章 — Agent 本质、ReAct 循环 | 基础概念，已内化 |
| Part 2 | 工具与扩展 | 4 章 — Function Calling、MCP、Skills、Hooks | Longbridge 工具已有、MCP 在 roadmap 中 |
| **Part 3** | **上下文与记忆** | **3 章 — 上下文工程、记忆架构、多轮对话** | **直接映射到我们的 context/build 和 PatternMemory** |
| **Part 4** | **单 Agent 模式** | **3 章 — Planning、Reflection、CoT** | **映射到我们的 DecisionGraph 内部推理** |
| **Part 5** | **多 Agent 编排** | **4 章 — 编排基础、DAG、Swarm、Handoff** | **映射到我们的 Graph 编排体系** |
| Part 6 | 高级推理 | 4 章 — ToT、Debate、Research、Self-Improve | Tree of Thoughts 已在 14_llm 中应用 |
| **Part 7** | **生产架构** | **3 章 — 三层架构、Temporal、可观测性** | **映射到我们的 Backend/Workflow/CLI 三层** |
| Part 8 | 企业特性 | 5 章 — Token Budget、OPA、WASI Sandbox | 远期参考 |
| Part 9 | 前沿实践 | 5 章 — Computer Use、Agentic Coding | 远期参考 |

**核心原则**：不照搬 Shannon 框架（书中参考实现），而是提取框架无关的 Agent 工程原则，映射到我们已有的 LangGraph + CLI + Backend 架构上。

**术语与边界**：
- 使用根目录 `UBIQUITOUS_LANGUAGE.md` 中的 **Workflow**、**Native LangGraph Graph**、**Service Wrapper Workflow**、**CLI**、**Outcome**、**Agent Node**、**Agent Subgraph**、**Workflow Owner** 等术语。
- 本文中引用外部书籍的 "Agent"、"Graph"、"Swarm"、"Handoff" 时，只表示参考模式；落到项目实现时必须映射到上述统一术语。
- 当前 CLI source-of-truth 是 `apps/trader-workflows/src/index.ts`，命令入口为 `npm run workflows -- <command>`；不得重新引入旧顶层 CLI 口径。
- Workflow/CLI 测试目录为 `apps/trader-workflows/src/**/*.test.ts`，不得新建或推荐独立 tests 目录作为默认路径。

---

## 3. 12 个高价值参考点 → 候选增强

---

### 🔴 第一梯队：直接可落地的工程增强（P0）

#### 3.1 编排模式显式化 — 为每个 Native LangGraph Graph 标注编排模式

**书中设计**（Part 5 第 13-16 章）：多 Agent 编排有三种范式——DAG（确定性依赖）、Swarm（动态 Worker 分配）、Handoff（任务交接）。选择哪一种取决于任务的依赖关系和不确定性。好的编排文档让团队知道"谁在什么时候做什么决定"。

**Market Agent 现状**：
- 系统有 5 个 **Native LangGraph Graph**（Decision / Outcome / Evaluation / InsightExploration / AlphaResearch），编排关系只在代码中隐式存在。
- `02_architecture_overview.md` 列出了模块关系图，但没有标注每个 **Workflow** / **Native LangGraph Graph** 的编排模式和状态流转方向。

**缺失的是什么**：
- DecisionGraph 是什么编排模式？（链式 Pipeline：data → quality → feature → setup → evidence → risk → decision）
- Native LangGraph Graph 之间如何流转？（Decision → Outcome 是串行触发；InsightExploration 和 AlphaResearch 可并行）
- 每个 Workflow 的触发条件、停止条件和失败恢复策略是什么？

**候选增强**：

| 任务 | 位置 | 说明 |
|---|---|---|
| **编排模式标注** | `02_architecture_overview.md` 或新建参考章节 | 为每个 Workflow / Native LangGraph Graph 标注：模式类型（Pipeline / DAG / Loop）、触发条件、依赖、输出、失败策略 |
| **Native Graph 间流转图** | 同上 | 画出 5 个 Native LangGraph Graph 之间的触发关系、数据流向和状态传递 |
| **接口契约文档** | `apps/trader-workflows/src/graphs/` 各目录下的 README（候选） | 每个 Native LangGraph Graph 的输入 schema、输出 schema、side effects |

**示例**：

```text
DecisionGraph
  模式: Pipeline（10 个节点顺序执行）
  触发: CLI `npm run workflows -- market-monitor run ...` 或 MarketMonitorGraph 定时触发
  依赖: 行情数据就绪 + 股票池配置
  输出: DecisionEnvelope → 写入 model_decisions 表
  失败: 任一节点 fail → 整个 run 标记 failed，写入 audit event
  下游: OutcomeGraph（延时触发，1D/3D/5D 后回标）
  Produces: model_decisions（topic: decisions）
  Consumes: market_bars（topic: market_data）、setup_definitions（topic: patterns）

OutcomeGraph
  模式: Loop（按时间周期自动运行，扫描待回标的决策）
  触发: 定时器（每日收盘后）或 CLI 手动触发
  依赖: model_decisions 表中有未回标记录
  输出: decision_outcomes 写入
  失败: 单条回标失败不影响其他记录
  Produces: decision_outcomes（topic: outcomes）
  Consumes: model_decisions（topic: decisions）
```

**验收标准**：
- 每个 Native LangGraph Graph 有明确的编排模式标注
- Native LangGraph Graph 间流转图清晰可读
- 新加入的开发者能在 10 分钟内理解 Graph 之间的关系

**对应书中章节**：Part 5 第 13 章「编排基础」+ 第 14 章「DAG 工作流」

---

#### 3.2 LLM 工具白名单矩阵 — 分级、显式、可审计

**书中设计**（Part 2 第 3-5 章）：工具是 Agent 与外部世界的桥梁。好的工具设计遵循：原子化（一个工具做一件事）、按风险分级（只读/低风险/高风险）、显式白名单。每个 Agent/节点应该只暴露它需要的工具，而非全部。

**Market Agent 现状**：
- `14_llm_reasoning_strategy.md` 已为 `build_evidence` 节点定义了 3 个工具白名单（`fetch_market_bars`、`fetch_benchmark_bars`、`search_recent_events`），设计正确。
- 但后续 Operator Surface 可能调用多个 Longbridge 只读工具，`generate_contra` 节点的工具白名单未在文档中定义。

**缺失的是什么**：
- 每个 LLM 调用点的工具白名单没有全局视图（哪些工具在哪些节点可用？）
- 未来可能新增数据写入工具（保存 pattern、更新 RulePack），缺少风险分级和确认机制

**候选增强**：

| 任务 | 位置 | 说明 |
|---|---|---|
| **工具白名单矩阵** | `14_llm_reasoning_strategy.md` 补充章节 | 为每个 LLM 调用点（Chat、build_evidence、generate_contra、复盘报告生成）定义允许使用的工具集合 |
| **工具风险分级** | 同上 | 所有工具标注风险等级：`read_only` / `low_risk`（内部读写）/ `high_risk`（外部写入、规则变更） |
| **高风险工具确认** | `apps/trader-workflows/src/` | `high_risk` 工具需要二次确认（用户审批或 Policy Check node 通过） |

**建议的工具白名单矩阵**：

| LLM 调用点 | 可用工具 | 风险等级 | 说明 |
|---|---|---|---|
| Chat（CLI 第 2 页） | 22 Longbridge 只读工具 | read_only | 全部只读，无风险 |
| build_evidence | fetch_market_bars、fetch_benchmark_bars、search_recent_events | read_only | 仅 3 个（已定义） |
| generate_contra | 与 build_evidence 相同 + fetch_option_flow | read_only | 反对意见可能需要更多数据 |
| 复盘报告生成 | 无工具调用 | n/a | 仅基于已有结构化数据生成自然语言报告 |

**验收标准**：
- `14_llm_reasoning_strategy.md` 包含完整的工具白名单矩阵
- 每个工具的 `risk_level` 已标注
- 任何新增 LLM 调用点必须在矩阵中有对应行

**对应书中章节**：Part 2 第 3 章「工具调用基础」+ 第 5 章「Skills 技能系统」

---

#### 3.3 上下文工程四大策略 — 当前只用了"写入"，缺"压缩"和"隔离"

**书中设计**（Part 3 第 7 章）：上下文工程有四大策略——**写入**（哪些内容进入上下文）、**选择**（从诸多候选中选出最重要的）、**压缩**（对长内容进行摘要）、**隔离**（将不同任务的上下文分开避免干扰）。Prompt Cache 是上下文工程的加速层。

**Market Agent 现状**：
- **写入**：`context/build` API 按需组装（✅ 已实现）
- **选择**：15 号文档 3.5 节 compact 模式设计中（⚠️ 计划中）
- **压缩**：❌ 未设计。当前 `evidence_text ≤200 tokens` 是输出约束，不是输入压缩。输入侧的原始特征数据、新闻全文、语料片段未经摘要直接注入。
- **隔离**：❌ 未设计。后续 Operator Surface 和 DecisionGraph 的 LLM 调用如果共用同一个上下文窗口，可能互相干扰。

**候选增强**：

| 任务 | 位置 | 说明 |
|---|---|---|
| **输入压缩** | `context/build` 或 `build_evidence` 节点 | 对注入 LLM 的原始数据（新闻全文、语料片段 >500 tokens）先做本地摘要再注入 |
| **上下文隔离** | `apps/trader-workflows/src/` | Operator Surface messages 与 DecisionGraph 的 build_evidence 上下文物理隔离——不共享 session |
| **Prompt Cache 利用** | 所有 LLM 调用点 | 将稳定前缀（系统提示、工具定义）放在请求前面，最大化 cache hit |

**验收标准**：
- `build_evidence` 注入的每条数据源都有长度上限（新闻 ≤300 tokens、语料片段 ≤200 tokens）
- Operator Surface session 和 DecisionGraph run 不共享上下文状态
- 系统提示和工具定义的字节级稳定性被维护（不随意修改顺序或措辞）

**对应书中章节**：Part 3 第 7 章「上下文工程」+ 第 9 章「多轮对话设计」

---

### 🟡 第二梯队：中期架构增强（P1）

#### 3.4 记忆分层显式化 — 短期/工作/长期三层边界

**书中设计**（Part 3 第 8 章）：Agent 记忆分三层：
- **短期记忆**：当前对话的上下文窗口。容量小、速度快、会话结束后消失。
- **工作记忆**：当前任务的状态变量（如当前分析的标的、当前 setup）。跨 LLM 调用保持，任务结束后清理。
- **长期记忆**：持久化的知识（向量存储、关系数据库）。跨会话持久，检索需时间。

每层有明确的容量、生命周期和检索策略。

**Market Agent 现状**：
- 短期记忆：后续 Operator Surface 的短期 messages（候选设计，无当前 MVP 实现要求）
- 工作记忆：LangGraph checkpoint / state（隐式存在，随 run 结束自动清理）
- 长期记忆：PatternMemory + FailureMemory + `session_context_packs`（已设计）
- **缺失**：三层没有统一的文档定义。当 PatternMemory 条目增多时，CLI 启动时全量加载可能成为瓶颈。

**建议的记忆分层定义**：

```text
┌─────────────────────────────────────────┐
│ 短期记忆（会话级）                        │
│ 容量: ≤20 轮 messages                   │
│ 生命周期: 当前 CLI session               │
│ 检索: 无需检索，LLM 直接读取             │
├─────────────────────────────────────────┤
│ 工作记忆（任务级）                        │
│ 容量: 当前 run 的 state dict             │
│ 生命周期: 单个 Graph run                 │
│ 检索: 通过 LangGraph checkpoint 恢复     │
├─────────────────────────────────────────┤
│ 长期记忆（持久级）                        │
│ 容量: pattern_memories + failure_memories│
│ 生命周期: 永久（直到显式退役）            │
│ 检索: session_context_packs 启动时加载   │
└─────────────────────────────────────────┘
```

**候选增强**：

| 任务 | 位置 | 说明 |
|---|---|---|
| **记忆分层文档** | `09_pattern_memory_and_learning.md` 或新建 `memory-layers.md` | 显式定义三层记忆的容量、生命周期、检索策略 |
| **长期记忆检索优化** | `session_context_packs` 模块 | 当 PatternMemory 条目 > 100 时，改为按标的+Regime+近期胜率检索 top-K（而非全量加载） |
| **记忆转换规则** | 同上 | 定义何时信息从短期→长期转移：人工确认 + 复盘回标验证通过 |

**验收标准**：
- 三层记忆的定义、边界、检索策略有文档
- `session_context_packs` 的加载逻辑支持 top-K 检索
- 记忆条目 > 50 时加载时间不超过 2 秒

**对应书中章节**：Part 3 第 8 章「记忆架构」

---

#### 3.5 Reflection + CoT + Planning 确定性护栏 — 已吸收进 14 号文档

**深度阅读结果**（Part 4 第 10-12 章）：三章共同指向一个核心设计哲学——**LLM 的判断（覆盖度/置信度/质量评分）不可信，必须用确定性规则覆盖。** 关键证据：

- **Planning 第 10.5 节**：Coverage Evaluation 有 4 条硬性护栏（迭代 1 + 覆盖度 < 0.5 → 强制继续；有关键缺口 → 继续；达最大迭代 → 强制停止；短合成 + 高覆盖度 → 不可信）
- **Reflection 第 11.3 节**：Reflection 是优化不是核心依赖——失败了返回原始结果而非报错；阈值设在 0.7 而非 0.95
- **CoT 第 12.6 节**：置信度通过确定性字符串统计计算（步骤数/逻辑词数/结构标记/明确结论），**不调 LLM**

**已落实**（`14_llm_reasoning_strategy.md` 3.5 节 + 4.5 节 + 7 节）：

| 书中模式 | 吸收的设计 | 14 号文档落地位置 |
|---|---|---|
| Planning 覆盖度护栏 | 4 条确定性规则覆盖 LLM 自评 confidence | 3.5 节「确定性护栏」规则 A-D |
| CoT 置信度计算 | Judge 输出 `quality_score` + `criteria_scores` | 4.3 节输出格式 + 4.5 节「确定性评分覆盖」规则 E-G |
| Reflection 成本分层 | 按信号强度/Regime/历史胜率分层决定 contra 深度 | 7 节「成本分层策略」规则 P1-P3 |
| CoT 确定性置信度公式 | `confidence_contribution = min(evidence_confidence, judge_quality)` | 4.5 节最终公式 |

**剩余候选增强**（P2）：

| 任务 | 位置 | 说明 |
|---|---|---|
| **Operator Surface Reflection** | 后续 Operator Surface；不属于当前 Market Agent MVP，且不得默认引用旧 CLI 实现路径 | 当用户在交互式界面中提问交易研究问题时，可选启用"先回答 → 自我批判 → 修正"的三步 Reflection 流程 |
| **低置信度重试** | `generate_contra` 节点 | 当 `quality_score < 0.4` 时，可选触发一次带反馈的重生成（成本较高，默认关闭） |
| **Reflection 质量回标** | `EvaluationGraph` | Judge 的 `criteria_scores` 分项评分可在复盘时回标——哪些维度准确预测了结果 |

**验收标准**：
- 确定性护栏（3.5）和评分覆盖（4.5）已写入 `14_llm_reasoning_strategy.md`
- 成本分层预判（7）已写入 `14_llm_reasoning_strategy.md`
- 后续 Operator Surface 有可选 Reflection 开关（P2）

**对应书中章节**：Part 4 第 10 章「Planning」+ 第 11 章「Reflection」+ 第 12 章「Chain-of-Thought」

---

#### 3.6 评估体系分层 — 从业务指标扩展到系统质量指标

**书中设计**（Part 7 第 22 章 + Part 4 第 11 章）：Agent 系统需要三层评估：
- **单元评估**：单个工具/节点是否正确执行
- **集成评估**：端到端流程是否正确
- **生产评估**：系统的延迟、成本、可用性

评估结果应可量化、可追踪趋势。

**Market Agent 现状**：
- 已有 `EvaluationGraph`（评估 setup 表现）和 `OutcomeGraph`（回标决策结果）——这些是**业务评估**。
- 缺少**系统质量评估**——`build_evidence` 生成的证据是否有用？`generate_contra` 是否真的发现了风险？

**候选增强**：

| 任务 | 位置 | 说明 |
|---|---|---|
| **Evidence 效用评分** | `EvaluationGraph` 扩展 | 回标时关联 evidence_text 与决策结果——计算证据与结果的语义一致性评分 |
| **Contra 预测力评分** | `EvaluationGraph` 扩展 | 当 `contra_text` 标记的风险真的发生时，给该节点加分；未发生时减分 |
| **回归测试基线** | `apps/trader-workflows/src/**/*.test.ts` | 保存一批已验证的 DecisionEnvelope 作为 golden dataset，修改 RiskGate/FeatureEngine 后自动回归 |

**验收标准**：
- `evaluation_reports` 表包含 `evidence_utility_score` 和 `contra_predictive_power` 字段
- 至少有 10 条 golden dataset 用于回归测试

**对应书中章节**：Part 7 第 22 章「可观测性」

---

### 🟢 第三梯队：长远方向（P2-P3）

#### 3.7 Handoff 机制 — 从 DB 间接传递到显式 Plan IO 声明

**书中设计**（Part 5 第 16 章）：Handoff 有三层交接方式，按复杂度递增：

| 层次 | 机制 | 适用场景 | 复杂度 |
|---|---|---|---|
| **依赖注入** | `previous_results` 上下文（把前序结果直接塞入后续 Agent 上下文） | 简单链式依赖 | 低 |
| **工作空间** | `Workspace` + `Topic`（发布-订阅式的共享数据层，支持增量读取 `SinceSeq`） | 主题驱动的数据共享 | 中 |
| **P2P 消息** | `Mailbox` + 5 种协议（Request/Offer/Accept/Delegation/Info） | Agent Node 间协商、竞标 | 高 |

核心设计原则：**Plan IO** — 每个子任务声明 `Produces`（产出哪些 Topic）和 `Consumes`（消费哪些 Topic），让编排器理解数据依赖关系。大部分场景用前两层就够，P2P 是给真正需要双向通信的场景。

**Market Agent 现状**：

对比三层交接方式：

| 书中层次 | 我们有没有 | 实现方式 | 缺口 |
|---|---|---|---|
| **依赖注入** | ✅ 有 | Native LangGraph Graph 内部：LangGraph state 传递；Workflow 间：DB 表（`model_decisions` → `decision_outcomes`） | 缺少 Plan IO 声明——不知谁消费谁的数据 |
| **工作空间** | ⚠️ 隐式有 | `session_context_packs` 全量加载 PatternMemory → 注入 Operator Surface 上下文 | 无 Topic 语义、无增量读取、无 TTL 清理 |
| **P2P 消息** | ❌ 没有 | — | 当前不需要（Workflow 间无需协商） |

核心缺口：**Plan IO 声明**——当前 Workflow 之间的数据依赖关系完全依赖 DB 表名推断，没有显式的 Produces/Consumes 文档。新开发者无法快速理解数据流。

**候选增强**：

| 任务 | 位置 | 优先级 | 说明 |
|---|---|---|---|
| **Plan IO 声明** | 3.1 编排模式标注中的 Native LangGraph Graph 模板 | P0 | 每个 Native LangGraph Graph 显式声明 Produces/Consumes（topic 语义） |
| **Workspace 语义借鉴** | `session_context_packs` 模块 | P2 | 借鉴 Workspace 的增量读取思想——当 PatternMemory 条目 > 100 时，基于 `updated_at` 增量加载而非全量 |
| **Topic 标注** | `market_intel.db` 表的文档注释 | P2 | 为核心 DB 表标注所属 Topic（`market_data` / `decisions` / `outcomes` / `patterns`），让数据依赖关系可视化 |

**验收标准**：
- 5 个 Native LangGraph Graph 均有 Produces/Consumes 声明（在 3.1 编排模式标注中完成）
- `session_context_packs` 支持基于时间戳的增量加载
- 核心 DB 表有 Topic 标注文档

**对应书中章节**：Part 5 第 16 章「Handoff 机制」（Plan IO + Workspace + P2P）

---

#### 3.8 Swarm 模式 — 当前不需要，但 human_input 事件值得中期吸收

**书中设计**（Part 5 第 15 章）：Swarm 是 **Lead Agent 事件驱动** + **Worker Agent 独立 ReAct 循环**的编排模式。核心特征：

- **Lead 三阶段**：初始规划（spawn Worker）→ 事件循环（监听 idle/completed/checkpoint/human_input）→ 关闭合成
- **idle → reassign**：Worker 完成任务后不退出，Lead 可以分配新任务
- **human_input 事件**：用户在运行中实时介入（不等流程结束）
- **收敛检测**：Worker 陷入循环时自动 idle，交由 Lead 决定

书中也明确指出 Swarm vs DAG 的选择线：**任务结构是否固定**。DAG 适合"你能提前画好依赖图"的场景；Swarm 适合"执行中可能需要加人、调整、响应人类反馈"的场景。

**与我们的对照**：

| Swarm 特征 | 我们系统 | 判定 |
|---|---|---|
| Lead Agent 事件驱动编排 | 预定义的 Workflow 触发器（CLI 命令 / 定时器） | ❌ 不需要 — 我们的 Native LangGraph Graph 数量和触发规则固定 |
| 动态 spawn Worker | Native LangGraph Graph 是静态注册的，不能运行时动态创建 | ❌ 不需要 — 固定 8 只标的 + 5 类 setup，分析范围确定 |
| idle → reassign | Native LangGraph Graph 执行完就退出，不能复用 | ❌ 不需要 — Workflow 职责确定，OutcomeGraph 不能被 reassign 去跑 DecisionGraph |
| human_input 事件 | Operator Surface 可以在 Workflow 运行前后介入，不能中途干预 | ⚠️ 中期可吸收 — 用户如果在 DecisionGraph 运行中能实时插入提示（如"不要参考昨天的新闻"）会提升体验 |
| 收敛检测 | 无显式检测机制 | ❌ 不需要 — ReAct 循环 max 3 steps 已限定迭代次数 |

**核心判断**：Swarm 解决的是"任务不确定性高、需要动态调整"的编排问题。我们当前系统"确定性 Workflow 优先"的设计哲学与 Swarm 的 Lead Agent 动态路由有本质差异。对于 MVP（固定标的池 + 固定 setup + 固定 Workflow 触发规则），静态的 DAG/Pipeline 编排完全足够。

**中期可吸收的元素**：

| 元素 | 何时需要 | 落地方式 |
|---|---|---|
| **human_input 事件** | 当用户希望在 Workflow 运行中途插入提示时 | 在 `Stage1Runtime` 中加入 `human_input` 事件通道，Native LangGraph Graph 节点在关键 checkpoints（如 build_evidence 完成后）暂停等待 |
| **收敛检测** | 当 LLM 调用的 ReAct 步骤超出当前 3 步限制时 | 在 `build_evidence` 的 ReAct 循环中加入重复 tool 调用检测 |

**对应书中章节**：Part 5 第 15 章「Swarm 模式」

**Swarm 落地**（14_llm_reasoning_strategy.md §12）:

Mid-Day Deep Agent 已采用 Swarm 编排——当 Daemon gate 判断 `complexity_score >= 0.3` 且多个标的同时有信号时，启动 Lead + parallel Workers 模式。每个 Worker 是独立的 `chatReAct` 调用（独立上下文窗口），Worker 返回压缩结论给 Lead，Lead 综合后调 generate_contra 做 Debate 反向验证。

```
Swarm (Mid-Day Deep Agent)
  ├─ Worker-TSLA  → chatReAct (独立 ReAct)
  ├─ Worker-NVDA  → chatReAct (独立 ReAct)
  ├─ Worker-COIN  → chatReAct (独立 ReAct)
  └─ Lead → generate_contra (Debate + ToT)
```

单个标的场景（complexity < 0.3）不走 Swarm，直接用 build_evidence + generate_contra。

---

#### 3.9 Deep Research for Macro — 周末宏观分析

**书中设计**（Part 9 第 27 章）：Deep Research = Plan → Search → Evaluate → Verify → Synthesize。核心设计决策: 搜索-验证分离、覆盖率驱动停止、多语言搜索策略、引用质量分级。

**Market Agent 应用 — Macro Agent（每周末 1 次）**:

| 书中模式 | 映射到 Macro Agent | 工具 |
|---|---|---|
| **Plan — 拆解维度** | 拆为 5 个子任务: 技术面/板块轮动/宏观事件/跨市场/历史 Regime | `fetchMarketBars("SPY","1w",52)` / `fetchBenchmarkBars` |
| **Search — 并行探索** | 5 个 Sub-agent 并行搜索，每个有独立的上下文窗口 | `webSearch` / `searchCnFinance` |
| **Verify — 交叉验证** | 搜索到的宏观数据用 `fetchUrl` 验证原文 | `fetchUrl` — 防止"幻觉式引用" |
| **Evaluate — 覆盖度** | 5 个维度覆盖率达到 85% → 停止 | 确定性护栏（借鉴 Planning 10.5 节） |
| **Synthesize** | 综合输出为 MacroReport: Regime 判定 + 当周关注列表 | Structured output via `experimental_output` |

**与现有设计的衔接**:

Macro Agent 的搜索阶段复用 `chatReAct` 的 ReAct 封装——每个 Sub-agent 是独立的 `chatReAct` 调用。Libinage 组（22 个 Longbridge 工具）在周末场景中可用（费非实时，成本可控）。

**对应书中章节**: Part 9 第 27 章「Deep Research」

---

#### 3.10 复杂度分层调度 — 从「固定模式」到「按需选择」

**书中设计**（ai-agent-book 第 27 章 + 第 31 章）:

- **任务复杂度决定 Agent 架构**: 简单任务用单 Agent ReAct，复杂任务用 Swarm 或 Deep Research
- **分层模型策略**: Small (50%) → Medium (40%) → Large (10%) 的成本分布
- **复杂度评分**: 启发式规则（关键字/长度/工具数）+ 模型判断

**Market Agent 落地 — Daemon Gate 复杂度路由**（14_llm_reasoning_strategy.md §11）:

Daemon gate 调用输出 `{ complexity_score, recommended_agent, recommended_pattern }`:

| complexity | Agent | Pattern | 成本 |
|---|---|---|---|
| < 0.3 | Mid-Day Deep | `single_react` | ~$0.04 |
| 0.3-0.6 | Mid-Day Deep | `swarm` | ~$0.10 |
| > 0.6 | Mid-Day Deep | `swarm` + `debate` | ~$0.20 |
| 收盘后 | Post-Market | `planning` → `reflection` | ~$0.05 |
| 周末 | Macro | `deep_research` | ~$0.50 |
| 周末 | Alpha Research | `planning` → `dag` | ~$0.50 |

**设计哲学**: 书中的"分层模型策略"是为单个 LLM 调用选择模型。我们扩展为"分层 Agent 调度"——不只是选择模型，还选择编排模式和 Agent 类型。Gate 的 complexity_score 同时路由 model tier 和 pattern。

**与现有设计的衔接**: 路由矩阵**不是替代** 14_llm 的 §5（分层模型路由）。§5 负责"同一个 Agent 内部用 Flash 还是 Pro"，§11 负责"多个 Agent 之间选哪个"。两层路由独立:

```
Layer 1 — Agent 路由（14_llm §11）
  Gate complexity_score → 选择 Agent (Mid-Day / Post-Market / Macro)

Layer 2 — Model 路由（14_llm §5）
  Agent 内部 → 选择 Model (Flash / Pro + thinking)
```

**对应书中章节**: 第 27 章「Deep Research」— 复杂度决定架构; 第 31 章「分层模型策略」— complexity_score → tier

---

#### 3.11 Planning 模式 — 前置规划能力

**书中设计**（Part 4 第 10 章）：Planning 模式让 Agent 在行动前先制定计划——分解任务、评估依赖、分配步骤。

**对我们的启发**：当前 `npm run workflows -- market-monitor run ...` / `npm run workflows -- decide ...` 是有界 CLI 调用，没有"分步执行"的概念。未来如果引入多标的顺序扫描、分批处理，可能需要 Planning 模式。

**判定**：当前单次扫描的用户场景不需要 Planning。待多标的自动监控上线后再评估。

---

#### 3.12 Token Budget — 成本控制

**书中设计**（Part 8 第 24 章）：企业级 Agent 系统需要 Token 预算管理——为每次 LLM 调用设定 Token 上限、追踪累计使用量、设置日/周预算上限。

**候选增强**：`apps/trader-workflows/src/` 中为每个 LLM 调用点加入 Token 计数和日志。远期可加入日预算上限（如每天不超过 100K tokens）。

**对应书中章节**：Part 8 第 24 章

---

#### 3.11 可观测性三支柱 — Logging / Metrics / Tracing

**书中设计**（Part 7 第 22 章）：生产级 Agent 系统需要三层可观测性：
- **Logging**：每个节点/工具的输入输出日志
- **Metrics**：延迟、成功率、Token 消耗趋势
- **Tracing**：跨 Workflow 的完整调用链追踪

**Market Agent 现状**：现有 `Stage1Runtime` 已有 run/checkpoint/audit 记录（✅ Logging）。缺少 Metrics 和 Tracing。

**候选增强**：在 `trader-workflows` 的 Runtime 中加入：
- 每个 Native LangGraph Graph 节点的执行延迟（p50/p95/p99）
- 每次 LLM 调用的 Token 消耗
- 跨 Workflow 的 run_id 关联

**对应书中章节**：Part 7 第 22 章「可观测性」

---

#### 3.12 三层架构对齐 — 确认我们的架构与书中模式一致

**书中设计**（Part 7 第 20 章）：推荐的三层架构——Orchestrator（编排层，Go）、Agent Core（执行层，Rust）、LLM Service（推理层，Python）。原则是：编排和执行解耦，推理层可独立扩展。

**我们的三层对比**：

| 书中层 | 我们的层 | 技术栈 | 职责 |
|---|---|---|---|
| Orchestrator (Go) | Workflow Runtime | TypeScript + LangGraph | 编排 Graph、状态管理、审批流程 |
| Agent Core (Rust) | Agent Core Backend | Python + FastAPI | 数据拉取、特征计算、风险门禁、复盘 |
| LLM Service (Python) | CLI + Vercel AI SDK | TypeScript | LLM 调用、Tool 集成 |

**差异**：书中将 LLM 调用放在服务端（Python），我们将 LLM 调用放在客户端（CLI/TypeScript）。这个差异是刻意的——我们的设计原则是"后端零 LLM 依赖"。

**判定**：✅ 架构分层方向正确，差异是设计选择而非缺陷。

**对应书中章节**：Part 7 第 20 章「三层架构设计」

---

## 4. 与 15 号文档的衔接

| 领域 | 15 号文档（ai-quant-book） | 16 号文档（ai-agent-book） | 关系 |
|---|---|---|---|
| **编排** | 多 Agent 协作模式（Chain/DAG/Debate） | 编排模式显式化（Pipeline/DAG/Swarm）、Graph 流转图、Plan IO | 互补：15 号讲"做什么"，16 号讲"怎么组织" |
| **Handoff** | — | 三层交接方式（依赖注入/Workspace/P2P）、Plan IO 声明 | 16 号专属 |
| **Swarm** | — | human_input 事件、收敛检测（中期吸收） | 16 号专属 |
| **上下文** | Compact Evidence 模式 | 上下文工程四大策略（写入/选择/压缩/隔离） | 互补：15 号是目标，16 号是方法 |
| **记忆** | PatternMemory + FailureMemory 设计 | 记忆分层（短期/工作/长期）、Workspace 增量读取借鉴 | 互补：15 号是内容，16 号是架构 |
| **风控** | Risk Gate 强化（熔断/事件/仓位） | — | 15 号专属 |
| **Regime** | Regime Detection + 编排级影响 | — | 15 号专属 |
| **评估** | Triple Barrier 标签 | 评估体系分层（Evidence 效用/Contra 预测力） | 互补：15 号是回标方法，16 号是系统质量 |
| **工具** | — | 工具风险分级、白名单矩阵 | 16 号专属 |
| **架构** | Modular Monolith 确认 | 三层架构对齐 | 互补 |

**阅读顺序**：先读 15 号文档（领域增强），再读本文档（工程原则）。

---

## 5. 候选采纳顺序

以下是候选采纳顺序，不是当前执行计划。进入实现前必须同步到 `12_development_phases.md`、`13_acceptance_tests.md` 或 `.agent-dev/tasks/T021`-`T027`：

```text
Phase 1（P0 候选）：
  1. 编排模式显式化 — 标注每个 Native LangGraph Graph 的模式和流转 (3.1)
     └─ 含 Plan IO 声明（Produces/Consumes）(3.7)
  2. LLM 工具白名单矩阵 (3.2)
  3. 上下文工程压缩+隔离 (3.3)

Phase 2（下一迭代，P1）：
  4. 记忆分层显式化 + 检索优化 (3.4)
  5. Reflection 模式文档化 (3.5)
  6. 评估体系分层 (3.6)
  7. Swarm human_input 事件通道 (3.8)

Phase 3（远期，P2-P3）：
  8. Token Budget (3.10)
  9. 可观测性三支柱 (3.11)
  10. Workspace 语义借鉴 — session_context_packs 增量加载 (3.7)

不紧急/已足够：
  - Planning 模式 (3.9) — 当前场景不需要
  - 三层架构对齐 (3.12) — 当前架构已对齐
  - Swarm 全量模式 — 与确定性 Workflow 哲学冲突，仅吸收 human_input 和收敛检测
```

P0 候选项可与 15 号文档的 P0 候选项（Regime Detection、Risk Gate 强化、Setup 衰减监控）独立评估。进入实现前仍需同步到正式 phase 或 task。

---

## 6. 与现有模块的衔接

| 参考点 | 新增/修改的模块 | 不影响 |
|---|---|---|
| 编排模式显式化 + Plan IO | `02_architecture_overview.md`（改）、各 Native LangGraph Graph 目录 README（候选） | Native LangGraph Graph 代码不变 |
| 工具白名单矩阵 | `14_llm_reasoning_strategy.md`（改） | Longbridge 工具注册不变 |
| 上下文压缩+隔离 | `context/build`（改）、`build_evidence` 节点（改） | DecisionGraph 流程不变 |
| 记忆分层 | `09_pattern_memory_and_learning.md`（改）、`session_context_packs`（改） | PatternMemory 表结构不变 |
| Reflection 文档化 | `14_llm_reasoning_strategy.md`（改） | DecisionGraph 逻辑不变 |
| 评估体系分层 | `EvaluationGraph`（改）、`evaluation_reports` 表（改） | OutcomeGraph 逻辑不变 |
| Handoff Plan IO + Workspace | `session_context_packs`（改）、DB 表文档注释 | Workflow 间流转逻辑不变 |
| Swarm human_input | `Stage1Runtime`（改） | 现有 Native LangGraph Graph 节点逻辑不变 |

---

## 7. 风险与边界

- **编排模式文档化不改代码**：编排模式标签是文档层面的描述，不改变任何 Native LangGraph Graph 的执行逻辑。避免为了"标准化"而重构已有 Workflow。
- **工具白名单收紧需谨慎**：后续 Operator Surface 可能调用多个 Longbridge 只读工具，收紧白名单可能影响用户交互体验。建议先文档化矩阵，再逐节点收紧，最后才考虑 Operator Surface。
- **上下文隔离不能破坏 Operator Surface 体验**：DecisionGraph 和 Operator Surface 保持上下文隔离，但 Operator Surface 需要能读取当前 run 的结果（通过 DB，而非共享上下文）。
- **评估指标是增量，不是替代**：新的系统质量指标（Evidence 效用、Contra 预测力）是现有业务指标（胜率、盈亏比）的补充，不替代。
- **长期记忆检索优化需性能测试**：改为 top-K 检索后需验证检索精度不低于全量加载。
- **Swarm 全量模式不适配当前哲学**：Swarm 的 Lead Agent 动态路由与"确定性 Workflow 优先"的设计哲学冲突。仅吸收 human_input 事件和收敛检测两个独立元素，不走完整的 Lead-based Swarm 架构。

---

## 8. 验收标准（全局）

若 Phase 1 候选被采纳：
- [ ] 每个 Native LangGraph Graph 有明确的编排模式标注（含 Produces/Consumes）
- [ ] Native LangGraph Graph 间流转图清晰可读
- [ ] `14_llm_reasoning_strategy.md` 包含完整的工具白名单矩阵和风险等级
- [ ] `build_evidence` 注入的每条数据源有长度上限
- [ ] Operator Surface session 和 DecisionGraph run 上下文物理隔离

若 Phase 2 候选被采纳：
- [ ] 三层记忆的边界和检索策略有文档
- [ ] `session_context_packs` 支持 top-K 检索（条目 > 50 时自动切换）
- [ ] Reflection 模式在 14_llm 文档中显式标注
- [ ] `evaluation_reports` 表包含系统质量指标
- [ ] `Stage1Runtime` 具备 human_input 事件通道基础架构

若 Phase 3 候选被采纳：
- [ ] 每个 LLM 调用点有 Token 消耗日志
- [ ] Native LangGraph Graph 节点延迟有 p50/p95/p99 统计
- [ ] `session_context_packs` 支持基于 updated_at 的增量加载

---

## 9. 参考源

- **书籍主体**：`D:\workspace\06-knowledge\ai-agent-book-main\zh\` 全部 33 章
- Part 1：Agent 本质、ReAct 循环
- Part 2：工具调用、MCP、Skills、Hooks
- **Part 3**：上下文工程（四大策略）、记忆架构（三层设计）、多轮对话
- **Part 4**：Planning、Reflection、Chain-of-Thought
- **Part 5**：编排基础、DAG 工作流、Swarm 模式、Handoff 机制
- Part 6：高级推理（ToT、Debate、Research）
- **Part 7**：三层架构设计、Temporal 工作流、可观测性
- Part 8：Token Budget、OPA 策略引擎、WASI 沙箱
- Part 9：Computer Use、Agentic Coding
- 参考实现：Shannon（三层多 Agent 系统）+ ShanClaw（Agent Harness）
