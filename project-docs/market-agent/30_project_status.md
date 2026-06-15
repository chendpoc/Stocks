# 30. Project Status — 文档覆盖与实现状态总览

> 状态: living | 更新: 2026-06-11

## 1. 文档目的

29 篇设计文档覆盖了从基础架构到远期规划的完整蓝图。本文档标记每篇文档的实现状态——**哪些已经在代码中运行，哪些停留在设计层面**。

**使用方式**：接手开发的 Agent 先读本文档，了解整体进度，再跳转到具体设计文档和代码文件。

---

## 2. 全局状态

```
29 篇文档:
  ✅ 已实现       8 篇 (28%)
  ⚠️ 部分实现     4 篇 (14%)
  📋 已设计未实现  11 篇 (38%)
  📚 参考/调研    6 篇 (21%)

代码层面:
  4 个 app 子项目 (cli / workflows / agent-backend / chart)
  200+ TypeScript/Python 文件
  35 个注册工具
```

---

## 3. 逐篇状态

### 基础架构 (00-13)

| # | 文档 | 状态 | 关键代码 | 说明 |
|---|---|---|---|---|
| 00 | README | 📚 入口 | — | 路由到其他文档 |
| 01 | 系统目标与范围 | ✅ 已实现 | — | 定义层面，代码遵循 |
| 02 | 架构概述 | ⚠️ 部分 | `apps/` 三个子项目 | DecisionGraph 管道已实现；Swarm/Planning 未实现 |
| 03 | 记忆系统设计 | ✅ 已实现 | `pattern_memories`, `failure_memories`, `session_context_packs` 表 | PatternMemory 状态机 + SessionContextBootstrap |
| 04 | 数据库 Schema | ✅ 已实现 | `apps/trader-agent/backend/app/intel/db/schema.py` | market_bars / model_decisions / decision_outcomes / pattern_memories 等 |
| 05 | 市场数据服务 | ✅ 已实现 | `market_data.py`, `ingestion/market_data.py` | Ingestion + QualityGate + TTL 缓存 |
| 06 | 市场监控 Graph | ⚠️ 部分 | `MarketMonitorService` | 监控服务已有，但定时触发靠 Daemon，不靠 MonitorGraph |
| 07 | DecisionEnvelope | ✅ 已实现 | `decisionEnvelope.ts` | RiskGate 已设计，但 RiskGate 强化（连续亏损熔断/事件窗口）未实现 |
| 08 | Outcome & Evaluation | ✅ 已实现 | `outcomeGraph.ts`, `evaluationGraph.ts` | OutcomeGraph 回标 + EvaluationGraph 聚合已实现；Triple Barrier 标签未实现 |
| 09 | PatternMemory & Learning | ✅ 已实现 | `pattern_memories` 表 + `PatternMemoryService` | 状态机 + 事件溯源已实现 |
| 10 | CLI Context Bootstrap | ✅ 已实现 | `SessionContextBootstrap` class | 每次 CLI 启动加载 context pack |
| 11 | API & CLI Spec | ✅ 已实现 | `agent.py`, CLI commands | 已实现：/api/intel/* 端点 + trader CLI |
| 12 | 开发阶段 | 📚 规划 | — | Phase 1-4 阶段划分，代码按此推进 |
| 13 | 验收测试 | ⚠️ 部分 | `test/` 目录 | 核心 workflow 有测试，但覆盖不完整 |

### 核心推理与参考 (14-17)

| # | 文档 | 状态 | 关键代码 | 说明 |
|---|---|---|---|---|
| 14 | LLM 推理策略 | ⚠️ 部分 | `decisionGraph.llmNodes.ts`, `chatReAct.ts` | **已实现**: Evidence Builder, Contra Generator, Daemon Gate CoT, Agent Prompts, 工具白名单矩阵, chatReAct SDK 集成。**未实现**: Swarm 多标的并行分析, Planning 复杂度路由, 全部 Few-Shot Prompts 落地 |
| 15 | AI Quant Book 参考 | 📚 参考 | — | 12 个参考点 → 开发行动的映射。其中 Regime Detection 已实现（ta 库替换完成），其余未实现 |
| 16 | AI Agent Book 参考 | 📚 参考 | — | 11 个参考点 → 开发行动。其中编排模式已落地（DecisionGraph Pipeline），其余未实现 |
| 17 | Agent Runtime SDK 调研 | 📚 参考 | `chatReAct.ts` | Vercel AI SDK v4 特性分析——chatReAct 已落地 |

### 核心设计 (18-19)

| # | 文档 | 状态 | 关键代码 | 说明 |
|---|---|---|---|---|
| 18 | 对话记忆架构 | 📋 已设计未实现 | 无 | 四层记忆（工作/会话/语义/长期）+ 滑动窗口 + 压缩 + 自动标题 + MMR 去重。全部未实现。**P1-1/P1-2 任务** |
| 19 | Planning 模式 | 📋 已设计未实现 | 无 | 三阶段 Planning（复杂度评分 → 计划生成 → 步骤执行）+ 四坑对策。全部未实现。**Phase 2 任务** |

### 规划与路线图 (20-21)

| # | 文档 | 状态 | 说明 |
|---|---|---|---|
| 20 | Development Roadmap | 📚 规划 | 已完成/待开发功能全集。9 项待开发（P1-1~P3-4） |
| 21 | Factor Discovery Pipeline | 📋 已设计未实现 | 因子挖掘流水线（SQL 聚合 + 验证 + 晋升）。**Phase 2 任务** |

### 外部参考与需求池 (22-24)

| # | 文档 | 状态 | 说明 |
|---|---|---|---|
| 22 | Agent 外部框架参考 | 📚 参考 | 14 个框架的对比与借鉴点——不对应代码 |
| 23 | Cache-First Loop | 📚 参考 | Reasonix 缓存优化——**Phase 3 任务**。Phase 1 有 3 个立即优化项未实现 |
| 24 | Anthropic 差距分析 | 📚 需求池 | 8 项已对齐 + 10 项差距（G1-G10）→ 需求池。G1-G3 需立即修复 |

### 界面与架构 (25-29)

| # | 文档 | 状态 | 关键代码 | 说明 |
|---|---|---|---|---|
| 25 | Web & Desktop 界面 | 📋 已设计未实现 | 无 | Web UI (Vite+React+useChat) + Electron 桌面 + Slack/Feishu Bot + 后台服务。全部未实现。**支线任务** |
| 26 | Kocoro 架构参考 | 📚 参考 | — | 垂直 vs 通用定位分析。Phase 3+ 可借鉴 Token budget/Human approval |
| 27 | Order Agent | 📋 已设计未实现（placeholder） | 无 | Phase 4 交易执行层——Signal Generator + Risk Engine + Human Approval + Order Executor |
| 28 | Bridge Monitor | 📋 已设计未实现 | `longbridgeAgent.ts` 有基础连接检测 | Phase 2——Longbridge 连接/持仓/账户监控 + 三级熔断 |
| 29 | LLM-Native Workflow Composition | 📋 已设计未实现 | `decisionGraph.ts` 当前为 LangGraph | PSEV + 三明治架构 + Temporal。Phase 2c-4 渐进替换路线 |

---

## 4. 已实现功能全景

### 4.1 数据管道

```
✅ market_bars 表 (1d/5m K 线)
✅ Ingestion (yfinance → DB → QualityGate)
✅ TTL 缓存 (避免重复拉取)
✅ 数据完整性检查 (quality_score + gap_count 字段部分实现)
```

### 4.2 特征与 Regime

```
✅ Regime Detection (ADX/VIX/Bollinger → trending/ranging/volatile)
✅ ta 库替换手写指标 (ADXIndicator + BollingerBands)
✅ Regime API 端点 (GET /market-agent/regime)
✅ fetchRegime 工具 (Agent 可调用)
✅ compute_regime_from_bars (从 SPY K 线计算)
```

### 4.3 决策与评估

```
✅ DecisionGraph (10 节点 Pipeline, LangGraph)
✅ build_evidence (ReAct 5 steps + 工具白名单)
✅ generate_contra (Debate+ToT 三角色)
✅ DecisionEnvelope (结构化决策)
✅ OutcomeGraph (回标 1D/3D/5D 结果)
✅ EvaluationGraph (按 setup 聚合评估报告)
✅ RiskGate 基础版 (仓位/回撤/相关性检查)
```

### 4.4 记忆与学习

```
✅ PatternMemory (active → degraded → retired 状态机)
✅ FailureMemory (失败教训)
✅ SessionContextPack (CLI 启动时加载)
✅ InsightExplorationGraph (人工探索模式)
✅ 模式事件溯源 (pattern_status_events 表)
```

### 4.5 Agent 基础设施

```
✅ Tool Registry (5 组 35 个工具: market/sentiment/longbridge/workflow/memory)
✅ Longbridge 工具 (22 个, 行情/基本面/期权/持仓)
✅ chatReAct (SDK 原生: maxRetries/abortSignal/experimental_repair/activeTools/continueSteps)
✅ describeTools/describeTool (Agent 自发现工具)
✅ resolveTools(scope) (按场景暴露工具子集)
✅ Daemon 主循环 (wakeSchedule → Gate CoT → Agent 路由)
✅ wakeSchedule (节假日查询+缓存 + 7 时段配置)
✅ Web Search (DuckDuckGo 真实实现)
✅ Fetch URL (urllib 真实实现)
```

### 4.6 CLI 与 UI

```
✅ trader CLI (20+ 命令)
✅ Ink TUI (Chat/Ops/Dashboard/MarketPlane 页面)
✅ ChatPage (TUI 聊天界面)
✅ WorkflowStatusPanel (Chat 页面内嵌 workflow 进度)
✅ trader workflow (独立 workflow 管理命令)
✅ trader daemon start/stop/status
✅ Daemon Gate CoT prompt (6 场景 few-shot)
```

### 4.7 Backend API

```
✅ FastAPI (:8000)
✅ /api/intel/* (market/signals/context/corpus/events/hypotheses/lessons)
✅ /api/intel/market-agent/* (regime/memory/pattern-memory/context/market-data)
✅ /api/intel/tools/* (web-search/fetch-url/search-cn-finance/recent-events/analyze-sentiment/extract-news-signal)
✅ /api/intel/workflows/* (list/run/status)
✅ SQLite 存储 (market_intel.db)
```

---

## 5. 已设计未实现功能清单（按优先级）

### Phase 1（当前迭代 — 立即开发）

| # | 功能 | 文档 | 改动量 | 说明 |
|---|---|---|---|---|
| P1-1 | **会话记忆 Schema + API** | 18 §4 | 中 | chat_sessions + chat_messages 表 + CRUD API + ChatSession 类 |
| P1-2 | **滑动窗口 + 压缩** | 18 §5.1 | 中 | 超 20 轮/60% 上下文 → Flash 摘要注入 system prompt |
| P1-3 | **Regime 注入 DecisionEnvelope + RiskGate** | 15 §3.1, T029-S2 | 中 | DecisionEnvelope 增加 market_regime 字段，RiskGate 自适应 |
| P1-G1 | **工具错误统一格式** | 24 §G1 | 小 | intel 工具统一返回 `{ ok, code, message }` |
| P1-G2 | **System prompt 稳定性** | 24 §G2, 23 §5 | 小 | 骨架+变量段分离；压缩摘要从 SP → system message |
| P1-G3 | **缓存命中率埋点** | 24 §G3, 23 §6 | 极小 | 3 行日志 |

### Phase 2（下一迭代 — 中期优化）

| # | 功能 | 文档 | 改动量 | 说明 |
|---|---|---|---|---|
| P2-1 | **自动标题生成** | 18 §5.2 | 小 | Flash 异步生成 ≤30 字标题 |
| P2-2 | **Data Quality + Triple Barrier** | 15 §3.4-3.6, T030 | 大 | DB 字段扩展 + Backend 计算 + Workflow 集成 |
| P2-3 | **Agent 工厂 + Handoff** | 16 §3.7-3.8, T028-S2 | 中 | agentFactory.spawn + Produces/Consumes + 上下文交接 |
| P2-4 | **Store 等价物** | 18 §8.2 | 小 | store_items 表 + API |
| P2-5 | **语义记忆** | 18 §5.3-6 | 中 | sqlite-vec + MMR 重排序 |
| P2-G4 | **上下文窗口显式预算** | 24 §G4 | 中 | 10%/30%/50%/10% 四段预算 |
| P2-G5 | **Evaluator-Optimizer 迭代** | 24 §G5 | 中 | Judge 不通过 → 退回重新收集证据 |
| P2-G6 | **工具结构化输出统一** | 24 §G6 | 中 | 标准化 `{ ok, data, error }` |
| P2-G10 | **Reflection 模式** | 24 §G10 | 中 | ChatAgent 分析回复后自评 + 带反馈重生成 |
| — | **Bridge Monitor 基础** | 28 | 中 | 连接/持仓/账户监控 + 三级熔断 |
| — | **Factor Discovery Pipeline** | 21 | 中 | SQL 聚合 + 验证 + 晋升 |

### Phase 3（远期 — 架构升级）

| # | 功能 | 文档 | 改动量 | 说明 |
|---|---|---|---|---|
| P3-1 | **DecisionGraph LLM Nodes (S1-S3)** | T031 | 大 | build_evidence / generate_contra / Swarm Workers 完整实现 |
| P3-2 | **Planning 模式实现** | 19 | 中 | 三阶段 Planning + complexity_score 路由 |
| P3-3 | **长期记忆** | 18 §7 | 小 | user_preferences + success_patterns |
| P3-4 | **SqliteSaver 升级** | 18 §8.2 | 小 | checkpoint 持久化 |
| P3-G8 | **MCP 集成** | 24 §G8 | 大 | 新建 mcp/ 模块 |
| P3-G9 | **四段式上下文架构** | 24 §G9, 23 §4 | 大 | Foundation/Project/Session/Turn |
| — | **Skill Auto-generation** | 22 §4.1 (Hermes) | 中 | 从对话自动提炼新工具 |
| — | **Middleware-based Harness** | 22 §3.1 (DeepAgents) | 大 | Tool Registry → Middleware |

### 支线任务（与主线并行）

| # | 功能 | 文档 | 改动量 | 说明 |
|---|---|---|---|---|
| web-1 | **Web UI (Vite+React)** | 25 §4 | ~440 行 | useChat hook + SSE 流式端点 |
| web-2 | **Electron 桌面** | 25 §5 | ~180 行 | 系统托盘 + 快捷键 |
| web-3 | **Slack/Feishu Bot** | 25 §10.3 | ~50 行 | Socket Mode |
| web-4 | **Daemon → 系统服务** | 25 §10.2 | ~30 行 | macOS launchd / Windows Service |

### Phase 4（交易执行层 — 远期 placeholder）

| # | 功能 | 文档 | 改动量 | 说明 |
|---|---|---|---|---|
| P4a | **Paper Trading** | 27 §7 | 大 | Signal Generator + Risk Engine 基础版 |
| P4b | **Human Approval** | 27 §7 | 中 | 审批 UI + TTL |
| P4c | **实盘对接** | 27 §7 | 大 | Longbridge 下单 API |
| — | **Temporal 执行引擎** | 29 §7 | 大 | Order Agent 用 Temporal Workflow |

---

## 6. 触手可及的速赢（< 1 小时即可完成的）

| 改动 | 文档 | 代码量 | 说明 |
|---|---|---|---|
| 缓存命中率埋点 | 23 §6, 24 §G3 | 3 行 | `chatReAct.ts` onStepFinish 加日志 |
| System prompt 分离骨架 | 23 §5.3, 24 §G2 | ~10 行 | `tools.ts` 拆分固定文本 + 变量 |
| 压缩摘要改为 system message | 23 §5.3 | ~5 行 | `chatSession.ts` maybeCompress |
| 工具错误统一格式 | 24 §G1 | ~15 行 | 3 个 intel 工具包装异常 |
