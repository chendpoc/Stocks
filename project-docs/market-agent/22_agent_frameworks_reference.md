# 22. Agent Frameworks Reference — 外部 Agent 框架设计参考

> 状态: living | 更新: 2026-06-11 | 依赖: 全部 market-agent 文档

## 1. 文档目的

在构建 Market Agent 系统的过程中，我们调研对比了 14 个外部 Agent 框架/项目。本文档记录每个框架中**值得我们借鉴的设计点**，作为后续开发的设计参考。

**使用方式**：开发新功能时，先查本文档——看是否有成熟的参考实现。

---

## 2. 全览

| # | 框架 | 定位 | 与我们的关系 | 借鉴优先级 |
|---|---|---|---|---|
| 1 | DeepAgents (LangChain) | 通用 Agent Harness | 理念对齐 | ⭐⭐⭐ |
| 2 | deepagentsjs | TypeScript 版 DeepAgents | 同语言 | ⭐⭐⭐ |
| 3 | microsoft/RD-Agent (Q) | 因子 R&D 自动化 | **互补品** | ⭐⭐⭐ |
| 4 | TradingAgents (Tauric) | 多 Agent 模拟交易公司 | 学术验证 | ⭐⭐ |
| 5 | Hermes (NousResearch) | 自我进化 AI 助手 | 学习闭环参考 | ⭐⭐ |
| 6 | Pydantic AI | 类型安全 Python Agent SDK | 不同栈 | ⭐⭐ |
| 7 | CrewAI | 角色扮演式多 Agent | 不同范式 | ⭐ |
| 8 | AutoGen (Microsoft) | 对话式多 Agent | 不同范式 | ⭐ |
| 9 | OpenAI Agents SDK | 轻量 Agent SDK | 太薄 | ⭐ |
| 10 | OpenClaw | 聊天渠道网关 | 不同层 | ⭐ |
| 11 | oh-my-pi | AI Coding Agent | 不同领域 | ⭐ |
| 12 | anthropics/financial-services | Claude 金融企业套件 | 不同赛道 | ⭐ |
| 13 | HKUDS/AI-Trader | Agent-Native 交易 | 核心闭源 | ❓ |
| 14 | YUHAI0/fin-agent | 金融问答 Bot | 个人项目 | ❓ |

---

## 3. 高优先级借鉴

### 3.1 DeepAgents / deepagentsjs — Agent Harness 架构

**好设计**：

| 设计点 | 说明 | 我们是否已有 |
|---|---|---|
| **Planning 中间件** | `write_todos` 工具——Agent 自动分解复杂任务为 checklist，逐项标记完成 | `19_planning_mode_design.md`（已设计，未实现） |
| **Filesystem 上下文管理** | Agent 用 `read_file/write_file/ls/glob/grep` 管理超长上下文——不塞进 prompt，而是存到文件中按需读取 | ❌ 我们的替代：`SessionContextPack` + `chat_messages` 表 |
| **Sub-agent spawning** | `task` 工具——Agent 可以 spawn 子 Agent 处理独立子任务，结果异步返回主会话 | 📋 Swarm（14 号文档 §12）已设计 |
| **Persistent Memory Files** | 跨会话的持久记忆文件（编码风格、偏好、约定）——Agent 每次醒来读取 | 📋 `18_memory_and_conversation_design.md` §7 长期记忆 |
| **Middleware 架构** | Agent 能力通过中间件叠加（PlanningMiddleware / FilesystemMiddleware / SubAgentMiddleware）——正交、可插拔 | ❌ 我们的 Tool Registry 是 scope-based，不是 middleware |

**借鉴要点**：
- **Middleware 架构值得在我们 Phase 3 引入**：当前 Tool Registry 按 scope 分组，但不同 scope 之间的能力复用不够灵活。Middleware 模式可以实现"Chat Agent = Planning Middleware + Tools Middleware + Memory Middleware"的声明式组合。
- **Filesystem 上下文管理对超长对话有效**：当 Chat 对话超过 100 轮时，将历史存入文件再按需读取，比全部塞进 prompt 更经济。

---

### 3.2 microsoft/RD-Agent (Q) — 因子 R&D 自动化闭环

**好设计**：

| 设计点 | 说明 | 我们是否已有 |
|---|---|---|
| **因子自动生成** | LLM 生成 Python 代码（因子公式），在沙箱中执行，收集回测结果 | `21_factor_discovery_pipeline.md`（刚设计） |
| **Research → Development 闭环** | 发现阶段（Research）提出假设 → 开发阶段（Development）验证并生成可部署代码 → 反馈到下一轮发现 | ❌ 我们的闭环是"Decision → Outcome → Evaluation"，不等同 |
| **成本控制** | 每轮自动发现 < $10，数千次迭代筛选有效因子 | ✅ 我们的设计是 $0（纯 SQL） |
| **隔离执行** | 生成的因子代码在 sandbox 中运行——不污染主系统 | ❌ 不需要：我们不用代码生成，用 SQL |

**借鉴要点**：
- **"先验证后解释"的设计哲学已写入 21 号文档**——这是最重要的借鉴。
- **沙箱执行不是我们当前需要的**：RD-Agent 生成代码才需要沙箱，我们生成的是 SQL 条件组合。

---

### 3.3 TradingAgents (TauricResearch) — 多角色 Agent 验证

**好设计**：

| 设计点 | 说明 | 我们是否已有 |
|---|---|---|
| **5 种角色 Agent** | Fundamental Analyst / Sentiment Analyst / Technical Analyst / Trader / Risk Manager | ❌ 我们按"任务"而非"角色"拆分 |
| **结构化辩论协议** | Agent 间通过结构化消息通信——减少信息丢失 | ⚠️ `generate_contra` 的 Proposer → Opponent → Judge 三层辩论 |
| **投票机制** | 多 Agent 对同一标的投票决定操作方向 | ❌ 我们用的是"Judge 综合评分"，非简单投票 |

**论文结论**（arxiv 2412.20138）：
- 多 Agent 框架在股票交易中**显著优于单 Agent 和传统 ML 基线**
- 不同角色 Agent 之间的辩论能提高决策质量
- **但**角色拆分带来的提升来自"多视角验证"，而非"角色扮演本身"

**借鉴要点**：
- 论文结论验证了我们 `build_evidence → generate_contra → Judge` 三层架构的正确性——"多视角验证优于单一判断"。
- 但我们**不需要**拆分为 Fundamental/Sentiment/Technical 三个独立 Agent——论文的核心洞察是"多方验证"，不是"多角色"。我们的 Evidence Builder（行情 + 舆情 + 记忆三方证据）已经完成了多方验证。

---

## 4. 中优先级借鉴

### 4.1 Hermes (NousResearch) — 自动技能生成

**好设计**：

| 设计点 | 说明 | 我们是否已有 |
|---|---|---|
| **从对话中自动学习技能** | 当用户反复做一件事时，Hermes 自动把它提炼成一个"技能"（可复用的工具/workflow） | ❌ **我们最该借鉴的** |
| **Persistent Memory** | 跨会话记忆——不是简单的聊天历史，而是结构化的用户偏好和行为模式 | 📋 `18_memory_and_conversation_design.md` §7 |
| **Closed Learning Loop** | 记忆 → 技能 → 用户模型 → 辩证交互 | ⚠️ PatternMemory 有学习闭环，但不生成新工具 |

**借鉴要点**：
- **"自动生成新工具"是 Phase 3 最值得做的功能**（已在 20_development_roadmap.md 中标注）。
- 具体场景：当系统检测到用户连续 3 次在 trending 市场问"TSLA VWAP Reclaim 现在怎么样"，自动生成一个 `check_TSLA_VWAP` 快捷工具。
- 实现方式：Daemon 分析 chat_sessions 中的重复模式 → 生成 tool prompt → 注册到 Tool Registry 的 `auto_generated` 组。

---

### 4.2 Pydantic AI — 类型安全的 Agent 编程

**好设计**：

| 设计点 | 说明 | 我们是否已有 |
|---|---|---|
| **结构化输出** | `Agent("gpt-4o", result_type=StockSignal)` — LLM 返回 Pydantic 模型实例，编译期类型安全 | ✅ `experimental_output` + Zod schema（chatReAct.ts） |
| **依赖注入** | `@agent.system_prompt` 装饰器 + Depends() — 系统 prompt 支持动态注入运行时依赖 | ❌ 我们用函数拼接，无 DI 框架 |
| **多 Provider 透明切换** | 同一个 Agent 代码，改一行换模型 | ✅ `getModel()` 支持多种 provider |

**借鉴要点**：
- **依赖注入在 Backend 端有价值**：当前 Backend 的 `tools.py` 中 LLM 端点返回 mock 数据。用 Pydantic AI 的 DI 替代后，可以优雅地注入 LLM client 和 API key——不需要改函数签名。
- **但 Agent 核心层（TypeScript）不需要**——Vercel AI SDK + Zod 已经提供了等价能力。

---

## 5. 低优先级 / 不适合的借鉴

### 5.1 CrewAI — 角色扮演不适合我们的 Pipeline

CrewAI 的 Agent 定义是"角色 + 目标 + 背景故事"。适合需要创意协作的场景（写报告、头脑风暴），不适合我们的确定性 Pipeline（DB 读写 + 数据校验 + 指标计算）。

**不借鉴的原因**：我们的 10 节点 DecisionGraph 中只有 2 个节点调 LLM，其余 8 个是确定性操作——角色扮演模型会把这些确定性操作也变成 LLM 调用，浪费 Token 且引入幻觉。

---

### 5.2 AutoGen — 对话式编排对交易场景过重

AutoGen 的核心抽象是"Agent 之间的对话"。适合需要复杂协商的场景，但我们的 workflow 有明确的依赖关系（拓扑排序），不需要 Agent 之间协商。

**不借鉴的原因**：对话式编排的不可预测性与交易决策的确定性要求冲突。

---

### 5.3 OpenAI Agents SDK — 太薄

只提供 Agent 循环 + 工具调用，不提供 Planning、Memory、Multi-Agent 编排。我们已经在 Vercel AI SDK 上实现了同等能力。

---

### 5.4 OpenClaw — 不同层级

OpenClaw 是聊天渠道网关——把 Discord/Telegram/WhatsApp 的消息路由到 Agent。这个功能我们现在不需要（只有 TUI + 企微 webhook）。

---

### 5.5 oh-my-pi — 编码 Agent，无关

oh-my-pi 是终端里的 AI 编程助手（类比 Claude Code / Cursor / Aider）。它的 hash-anchored edits、LSP 集成、Python execution 对交易分析毫无帮助。

---

## 6. 架构模式对比矩阵

从各框架中提取的通用架构模式，按与我们的适配度排列：

| 模式 | 来源 | 说明 | 我们是否已用 | 建议 |
|---|---|---|---|---|
| **Single Agent + Tool Calling** | 所有框架 | Agent 循环 + 工具 | ✅ chatReAct | — |
| **Plan-then-Execute** | DeepAgents, RD-Agent, LangGraph | 先规划再分步执行 | 📋 19 号文档 | Phase 2 |
| **Research → Development 闭环** | RD-Agent (Q) | 假设 → 验证 → 部署 → 反馈 | 📋 21 号文档 | Phase 2 |
| **Multi-Agent Debate** | TradingAgents, DeepAgents | 多方 Agent 各自给出观点后辩论 | ✅ generate_contra (Debate+ToT) | — |
| **Middleware-based Harness** | DeepAgents | 能力通过中间件叠加 | ❌ | Phase 3 |
| **Role-based Agent** | CrewAI, TradingAgents | 按角色分工 | ❌ | 不需要 |
| **Conversation-based Orchestration** | AutoGen | Agent 间对话协商 | ❌ | 不需要 |
| **Skill Auto-generation** | Hermes | 从对话中自动学习新工具 | ❌ | Phase 3 |
| **Filesystem Context Management** | DeepAgents, oh-my-pi | 超长上下文写入文件再按需读取 | ❌ | Phase 3（超长对话场景） |
| **Type-safe Structured Output** | Pydantic AI | Agent 返回编译期类型安全的模型 | ✅ experimental_output + Zod | — |
| **Dependency Injection** | Pydantic AI | 系统 prompt 和工具支持动态依赖注入 | ❌ | Phase 3 (Backend) |
| **Channel Gateway** | OpenClaw | 多渠道接入 | ⚠️ 企微 webhook | 不需要 |

---

## 7. 借鉴优先级路线图

```text
Phase 2（下一迭代）：
  1. Plan-then-Execute          ← DeepAgents, LangGraph
  2. Factor R&D 闭环           ← RD-Agent (Q)

Phase 3（远期）：
  3. Skill Auto-generation     ← Hermes
  4. Middleware-based Harness  ← DeepAgents
  5. Filesystem Context Mgmt   ← DeepAgents（仅在超长对话 >100轮时启用）
  6. Dependency Injection      ← Pydantic AI（仅 Backend 的 LLM 端点）

明确不引入（Phase 3+）：
  - Role-based Agent           ← 我们的任务式拆分已足够
  - Conversation Orchestration ← 不适合确定性交易 Pipeline
  - Channel Gateway            ← 企微 webhook 已覆盖当前需求
```

---

## 8. 与现有系统模块的衔接

| 借鉴点 | 影响的模块 | 改动量 |
|---|---|---|
| Plan-then-Execute | `chat.ts` + 新建 `planGenerator.ts` + `planExecutor.ts` | 中 |
| Factor R&D 闭环 | 新建 `factorDiscovery.ts` + DB 查询 | 中 |
| Skill Auto-generation | `Tool Registry` + `chatSession.ts` | 中 |
| Middleware Harness | `toolRegistry.ts` → 升级为 middleware 架构 | 大 |
| Filesystem Context | `chatSession.ts` + 新建 `contextStore.ts` | 中 |
| Backend DI | `tools.py` → Pydantic AI | 小 |

---

## 9. 参考源

- **DeepAgents**: https://github.com/langchain-ai/deepagents
- **deepagentsjs**: https://github.com/langchain-ai/deepagentsjs
- **RD-Agent (Q)**: https://github.com/microsoft/RD-Agent
- **TradingAgents**: https://github.com/TauricResearch/TradingAgents
- **Hermes**: https://github.com/NousResearch/hermes-agent
- **Pydantic AI**: https://github.com/pydantic/pydantic-ai
- **CrewAI**: https://github.com/crewAIInc/crewAI
- **AutoGen**: https://github.com/microsoft/autogen
- **OpenAI Agents SDK**: https://github.com/openai/openai-agents-python
- **OpenClaw**: https://docs.openclaw.ai
- **oh-my-pi**: https://github.com/can1357/oh-my-pi
- **anthropics/financial-services**: https://github.com/anthropics/financial-services
- **YUHAI0/fin-agent**: https://github.com/YUHAI0/fin-agent
