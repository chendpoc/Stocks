# 20. Development Roadmap — 开发路线图与上下文

> 状态: living | 更新: 2026-06-11 | 依赖: 全部 market-agent 文档

## 1. 文档目的

本文档为后续 Agent 开发提供：
1. **已完成功能**清单——避免重复开发
2. **待开发功能**清单——按 Phase 排列，含优先级判定
3. **每个功能的开发上下文**——依赖关系、关键文件、接口约定、验收标准

其他 Agent 接手开发时，**只需要读本文档 + 对应编号的设计文档**即可开始工作。

---

## 2. 已完成功能（不可重复开发）

### 2.1 核心基础设施

| 功能 | 说明 | 关键文件 | 文档 |
|---|---|---|---|
| **Tool Registry 单点注册** | 5 组工具（market/sentiment/longbridge/workflow/memory）+ describeTools 自注册 | `apps/trader-cli/src/llm/toolRegistry.ts` + 各分组文件 | `14_llm_reasoning_strategy.md` §9 |
| **Longbridge 工具迁移** | 22 个工具从 legacy `longbridgeTools.ts` 直迁到 registry | `apps/trader-cli/src/llm/toolRegistry.longbridge.ts` | — |
| **chatReAct SDK 集成** | maxRetries / abortSignal / experimental_repair / activeTools / continueSteps | `apps/trader-cli/src/llm/chatReAct.ts` | `14_llm_reasoning_strategy.md` §3.3a |
| **buildAgentTools 委托** | 统一入口 → bootstrapToolRegistry → resolveTools("chat") | `apps/trader-cli/src/llm/buildAgentTools.ts` | — |
| **Daemon 主循环** | wake() → Gate CoT → Agent 路由 | `apps/trader-cli/src/daemon/marketAgentDaemon.ts` | `14_llm_reasoning_strategy.md` §10 |
| **wakeSchedule** | 节假日动态查询+缓存 + 7时段配置（含 holiday/halfDay） | `apps/trader-cli/src/daemon/wakeSchedule.ts` | — |
| **Backend workflows API** | listWorkflows / runWorkflow / getWorkflowStatus | `apps/trader-agent/backend/app/intel/api/workflows.py` | — |
| **Daemon Gate CoT prompt** | 6 场景 few-shot (normal/pre-market/post-market/holiday/event/weekend) | `apps/trader-cli/src/llm/prompts/daemonGate.ts` | `14_llm_reasoning_strategy.md` §10 |

### 2.2 市场数据与特征

| 功能 | 说明 | 关键文件 | 文档 |
|---|---|---|---|
| **Regime Detection** | 三分类（trending/ranging/volatile）+ ADX/Bollinger/VIX 指标 | `apps/trader-agent/backend/app/intel/market_agent/features.py` | `15_ai_quant_book_reference.md` §3.1 |
| **Regime API 端点** | `GET /market-agent/regime` — 读 DB → 算指标 → 返回 | `apps/trader-agent/backend/app/intel/api/market_agent.py` L429 | — |
| **fetchRegime 工具** | Agent 可调用，注册在 market 组 | `apps/trader-cli/src/llm/toolRegistry.market.ts` L126 | — |
| **ta 库指标计算** | ADXIndicator + BollingerBands 替代手写（35行→15行） | `features.py` `_compute_adx()` + `compute_regime_from_bars()` | `18_memory_and_conversation_design.md` §2 |

### 2.3 Agent 工具与搜索

| 功能 | 说明 | 关键文件 | 文档 |
|---|---|---|---|
| **Web Search（真实实现）** | DuckDuckGo 搜索（duckduckgo_search 库），不再返回占位 | `apps/trader-agent/backend/app/intel/api/tools.py` | — |
| **Fetch URL（真实实现）** | urllib + HTML 纯文本提取，含编码检测 | `tools.py` | — |
| **Sentiment 工具白名单** | 6 个工具（webSearch/searchCnFinance/fetchUrl/searchRecentEvents/extractNewsSignal/analyzeSentiment） | `apps/trader-cli/src/llm/toolRegistry.sentiment.ts` | `14_llm_reasoning_strategy.md` §3.2 |
| **Workflow 工具白名单** | 3 个工具（listWorkflows/runWorkflow/getWorkflowStatus） | `apps/trader-cli/src/llm/toolRegistry.workflow.ts` | — |
| **Memory 工具白名单** | 5 个工具（searchCorpus/getRelatedHypotheses/getLessons/saveHypothesis/queryPatternHistory） | `apps/trader-cli/src/llm/toolRegistry.memory.ts` | — |

### 2.4 设计与规范文档

| 文档编号 | 标题 | 用途 |
|---|---|---|
| `14_llm_reasoning_strategy.md` | LLM 推理策略核心 | Evidence Builder / Contra Generator / Swarm / Daemon Gate / Agent Prompts |
| `15_ai_quant_book_reference.md` | AI Quant Book 参考 | Regime Detection / Risk Gate 强化 / Setup 衰减 / Triple Barrier |
| `16_ai_agent_book_reference.md` | AI Agent Book 参考 | 编排模式 / 工具白名单 / 上下文工程 / 记忆分层 / Handoff / Swarm |
| `17_agent_runtime_sdk_research.md` | Agent Runtime SDK 调研 | Vercel AI SDK v4 特性与 chatReAct 设计 |
| `18_memory_and_conversation_design.md` | 对话记忆设计 | 四层记忆 / 会话管理 / 滑动窗口 / MMR 去重 / LangGraph 对齐 |
| `19_planning_mode_design.md` | Planning 模式设计 | 三阶段 Planning / complexity_score / 四坑对策 |

---

## 3. 待开发功能 — 按 Phase 排列

### Phase 1 — 当前迭代（立即开发）

| # | 功能 | 优先级 | 预计改动量 | 依赖 |
|---|---|---|---|---|
| **P1-1** | 会话记忆 Schema + API | 🔴 高 | 中 | 18 号文档 §4.2-4.3 |
| **P1-2** | 滑动窗口 + 压缩 | 🔴 高 | 中 | 18 号文档 §5.1 |
| **P1-3** | Regime 注入 DecisionEnvelope + RiskGate | 🟡 中 | 中 | T029-S2 spec |

### Phase 2 — 下一迭代

| # | 功能 | 优先级 | 预计改动量 | 依赖 |
|---|---|---|---|---|
| **P2-1** | 自动标题生成 | 🟡 中 | 小 | 18 号文档 §5.2 |
| **P2-2** | Data Quality + Triple Barrier | 🟡 中 | 大 | T030 spec |
| **P2-3** | Agent 工厂 + Handoff | 🟢 低 | 中 | T028-S2 spec |
| **P2-4** | Store 等价物（store_items 表） | 🟢 低 | 小 | 18 号文档 §8.2 |
| **P2-5** | 语义记忆 — sqlite-vec + MMR | 🟢 低 | 中 | 18 号文档 §5.3-6 |

### Phase 3 — 远期

| # | 功能 | 优先级 | 预计改动量 | 依赖 |
|---|---|---|---|---|
| **P3-1** | DecisionGraph LLM Nodes (S1-S3) | 🟡 中 | 大 | T031 spec |
| **P3-2** | Planning 模式实现 | 🟢 低 | 中 | 19 号文档 |
| **P3-3** | 长期记忆（user_preferences + success_patterns） | 🟢 低 | 小 | 18 号文档 §7 |
| **P3-4** | SqliteSaver 升级（checkpoint 持久化） | 🟢 低 | 小 | 18 号文档 §8.2 |

---

## 4. 各功能开发上下文

### P1-1: 会话记忆 Schema + API

**做什么**：让 Chat Agent 的每一次对话都持久化存储，支持历史会话列表、消息分页查询。

**设计文档**：`18_memory_and_conversation_design.md` §4.2-4.3

**SQL Schema**（新增两张表）：

```sql
CREATE TABLE chat_sessions (
    session_id TEXT PRIMARY KEY,
    title TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    message_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    metadata_json TEXT
);

CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES chat_sessions(session_id),
    role TEXT NOT NULL,           -- user / assistant / system / tool
    content TEXT NOT NULL,
    tool_calls_json TEXT,
    tokens INTEGER,
    created_at TEXT NOT NULL,
    step_number INTEGER
);
```

**API 端点**（新增到 Backend）：

```
GET    /api/chat/sessions                          — 列出所有会话
POST   /api/chat/sessions                          — 创建新会话
GET    /api/chat/sessions/{session_id}             — 获取会话元数据
GET    /api/chat/sessions/{session_id}/messages    — 获取消息（分页，?before=&limit=）
POST   /api/chat/sessions/{session_id}/messages    — 追加消息
PATCH  /api/chat/sessions/{session_id}            — 更新标题
```

**关键文件**：

| 文件 | 改动 |
|---|---|
| `apps/trader-agent/backend/app/intel/db/schema.py` | 新增表定义 |
| `apps/trader-agent/backend/app/intel/api/chat.py` | **新建** — Chat API router |
| `apps/trader-agent/backend/app/intel/api/__init__.py` | 注册 chat.router |
| `apps/trader-cli/src/llm/chatSession.ts` | **新建** — ChatSession 类（内存缓存 + API 调用） |
| `apps/trader-cli/src/tui/pages/ChatPage.tsx` | 接入 ChatSession |

**接口约定**：
- ChatSession 类对外暴露：`create(prompt)`, `append(msg)`, `listSessions()`, `loadHistory(sessionId, limit)`
- 所有 API 返回 JSON，session 列表按 `updated_at DESC` 排序
- tool_calls_json 字段存储原始 tool 调用和返回值（不压缩）

**禁止修改**：
- `apps/trader-workflows/**` — 不影响 Workflow
- `apps/trader-agent/backend/app/intel/api/tools.py` — 不影响工具端点

**验收**：
- [ ] 新会话能创建并持久化
- [ ] 消息能逐条追加
- [ ] 历史会话列表按时间排序
- [ ] 消息可分页查询（before + limit）

---

### P1-2: 滑动窗口 + 压缩

**做什么**：当对话超过 20 轮或上下文占用 > 60% 时，自动将早期对话压缩为摘要注入 system prompt。

**设计文档**：`18_memory_and_conversation_design.md` §5.1

**核心逻辑**：

```
完整历史  →  SQLite (chat_messages 表，永不清除)
    ↓ 滑动窗口
最近 N 轮  →  内存缓存（最近 20 轮，直接注入 LLM 上下文）
    ↓ 触发阈值（>60% 上下文占用 或 >20 轮）
压缩历史  →  Flash 模型生成摘要，注入 system prompt
```

**压缩参数**：

| 参数 | 默认值 |
|---|---|
| 活跃窗口大小 | 20 轮 |
| 上下文阈值 | 60% |
| 保留最近 | 5 轮（压缩后仍保留） |
| 摘要模型 | Flash (低成本) |

**压缩格式**：

```
此前讨论摘要:
- 标的: TSLA, NVDA
- 结论: TSLA VWAP Reclaim 确认(conf=0.72)，NVDA RS Pullback 不成立(conf=0.25)
- 待处理: 等待 1D 后回标 TSLA 决策、关注 COIN ORB 信号
```

**关键文件**：

| 文件 | 改动 |
|---|---|
| `apps/trader-cli/src/llm/chatSession.ts` | 新增 `maybeCompress()` 方法 |
| `apps/trader-cli/src/tui/pages/ChatPage.tsx` | 每轮回复后触发 maybeCompress |

**依赖**：P1-1（需要 chatSession.ts 基类）

**接口约定**：
- `maybeCompress()` 在每轮 assistant 回复后调用
- 压缩条件：`recentMessages.length > 20 || estimatedTokens > contextWindow * 0.6`
- 压缩时：保留最近 5 轮，将更早的消息用 Flash 模型生成摘要
- 摘要存储在 `ChatSession.compressedSummary` 字段
- 摘要注入到 system prompt（不占 messages 数组）

**禁止修改**：
- `chatReAct.ts` — 不修改底层 ReAct 循环
- Backend — 不需要新 API（压缩在 CLI 侧完成）

**验收**：
- [ ] 超过 20 轮后自动触发压缩
- [ ] 压缩后摘要正确注入 system prompt
- [ ] 最近 5 轮对话仍然保留原文
- [ ] SQLite 中完整历史不受压缩影响

---

### P1-3: Regime 注入 DecisionEnvelope + RiskGate

**做什么**：将 Backend 计算好的 Market Regime 注入到 DecisionEnvelope 中，RiskGate 在不同状态下自动调整权重。

**设计文档**：`15_ai_quant_book_reference.md` §3.1，T029-S2 spec

**关键文件**：

| 文件 | 改动 |
|---|---|
| `apps/trader-workflows/src/llm/decisionEnvelope.ts` | DecisionEnvelope 类型增加 `market_regime` 字段 |
| `apps/trader-workflows/src/graphs/00-decision/decisionGraph.nodes.ts` | build_evidence 节点前增加 fetchRegime 调用 |
| `apps/trader-workflows/src/graphs/00-decision/decisionGraph.state.ts` | State 增加 `market_regime` 字段 |

**接口约定**：
- `market_regime` 类型：`{ state: "trending"|"ranging"|"volatile", confidence: number, indicators: {...}, transition_risk: number }`
- RiskGate 在 `volatile` 或 `crisis` 状态下自动降低 `confidence_contribution` 权重
- Regime 通过 `fetchRegime` 工具调用 Backend API（走 fetchIntel）

**禁止修改**：
- `apps/trader-agent/backend/**` — Backend 端点已就绪
- `apps/trader-cli/**` — 不涉及 CLI

**验收**：
- [ ] DecisionEnvelope 包含 `market_regime` 字段
- [ ] volatile/crisis 状态下 RiskGate 自动降低置信度
- [ ] build_evidence 的 context 中包含当前 regime 信息

---

### P2-1: 自动标题生成

**做什么**：新会话首次回复后异步生成 ≤30 字的中文标题。

**设计文档**：`18_memory_and_conversation_design.md` §5.2

**核心逻辑**：

```typescript
async function generateSessionTitle(firstMessage: string): Promise<string> {
  const result = await generateText({
    model: getFlashModel(),
    prompt: `为以下对话生成简短标题（≤30 字）：\n${firstMessage.slice(0, 500)}`,
    maxTokens: 50,
  });
  return result.text.trim();
}
```

**关键文件**：

| 文件 | 改动 |
|---|---|
| `apps/trader-cli/src/llm/chatSession.ts` | 新增 `generateTitle()` 方法 |
| `apps/trader-cli/src/tui/pages/ChatPage.tsx` | 首轮回复后异步调用 |

**触发时机**：首轮回复结束 / 会话首次压缩 / 用户手动 `trader chat --title`

**依赖**：P1-1（需要 chatSession.ts 基类 + chat_sessions 表）

**验收**：
- [ ] 新会话首次回复后自动生成标题
- [ ] 标题 ≤30 字中文
- [ ] 标题异步生成，不阻塞对话

---

### P2-2: Data Quality + Triple Barrier

**做什么**：（1）market_bars 表增加数据质量评分字段；（2）decision_outcomes 表增加 Triple Barrier 标签字段；（3）evaluation_reports 增加系统质量评估指标。

**设计文档**：`15_ai_quant_book_reference.md` §3.4-3.6 + `16_ai_agent_book_reference.md` §3.6，T030 spec（3 slices）

**关键文件**：

| Slice | 文件 | 改动 |
|---|---|---|
| **S1: DB Schema** | `apps/trader-agent/backend/app/intel/db/schema.py` | 三张表各扩字段 |
| **S2: Backend** | `data_quality.py`（新建）+ `outcome.py`（新建） | DataQualityGate 阈值检查 + Triple Barrier 标签计算 |
| **S3: Workflow** | `outcomeGraph.ts` + `evaluationGraph.ts` | 回标时写入 barrier_result + 聚合报告 |

**DB 字段新增**：
- `market_bars`：`quality_score` (INTEGER 0-100), `gap_count` (INTEGER)
- `decision_outcomes`：`barrier_result` (TEXT: hit_profit_first/hit_stop_first/hit_time_first/none)
- `evaluation_reports`：`evidence_utility_score` (REAL), `contra_predictive_power` (REAL)

**验收**（分 Slice）：
- S1: DB migration 可执行，不破坏现有数据
- S2: DataQualityGate 完整性 <90% → quality_degraded，<50% → quality_critical
- S3: OutcomeGraph 写入 barrier_result，EvaluationGraph 包含 Triple Barrier 统计

---

### P2-3: Agent 工厂 + Handoff

**做什么**：实现 Agent 工厂模式（agentFactory.spawn）+ Plan IO 声明（Produces/Consumes）+ 上下文交接。

**设计文档**：`16_ai_agent_book_reference.md` §3.7-3.8，T028-S2 spec

**核心概念**：

```
agentFactory.spawn(agentId, context)
  → 新 Agent 实例
  → 声明 Produces: topic + record types
  → 声明 Consumes: topic + record types
  → 从上游 Agent 继承上下文
```

**关键文件**：

| 文件 | 改动 |
|---|---|
| `apps/trader-cli/src/llm/agentFactory.ts` | **新建** — spawn + Produces/Consumes 声明 |
| `apps/trader-cli/src/daemon/marketAgentDaemon.ts` | handleGate() 用 agentFactory.spawn 替代 TODO stub |

**禁止修改**：
- `apps/trader-agent/backend/**`
- `apps/trader-workflows/**`

**验收**：
- [ ] `agentFactory.spawn("daemon")` 返回 Daemon Agent 实例
- [ ] 每个 Agent 可声明 Produces/Consumes
- [ ] Workspace 语义：增量读取 + Topic 订阅

---

### P2-4: Store 等价物

**做什么**：实现跨会话共享的 KV 存储（LangGraph Cloud Store 等价物），支持 namespace 隔离和 TTL。

**设计文档**：`18_memory_and_conversation_design.md` §8.2

**SQL Schema**：

```sql
CREATE TABLE store_items (
    namespace TEXT NOT NULL,
    key TEXT NOT NULL,
    value_json TEXT NOT NULL,
    ttl_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (namespace, key)
);
```

**API 端点**：

```
GET    /api/store/{namespace}/{key}     — 读取
PUT    /api/store/{namespace}/{key}     — 写入（含 TTL）
DELETE /api/store/{namespace}/{key}     — 删除
GET    /api/store/{namespace}           — 列出 namespace 下所有 key
```

**关键文件**：

| 文件 | 改动 |
|---|---|
| `apps/trader-agent/backend/app/intel/db/schema.py` | 新增表定义 |
| `apps/trader-agent/backend/app/intel/api/store.py` | **新建** — Store API router |

**验收**：
- [ ] `PUT /store/user_prefs/default_symbols` → 写入成功
- [ ] `GET /store/user_prefs/default_symbols` → 返回写入值
- [ ] TTL 过期后读取返回 404

---

### P2-5: 语义记忆 — sqlite-vec + MMR

**做什么**：实现跨会话的语义检索——把历史问答、交易经验存入向量数据库，检索时用 MMR 去重。

**设计文档**：`18_memory_and_conversation_design.md` §5.3-6

**起步方案**：`sqlite-vec`（SQLite 向量扩展，零外部进程）。

**备选**：如果暂时不引入向量扩展，用 FTS5 全文检索 + JSON 标签过滤作为轻量起步。

**关键文件**：

| 文件 | 改动 |
|---|---|
| `apps/trader-agent/backend/app/intel/db/schema.py` | 新增 `knowledge_entries` 表（+ `knowledge_vec` 虚拟表） |
| `apps/trader-agent/backend/app/intel/api/knowledge.py` | **新建** — 语义检索 API（Top-K + MMR） |
| `apps/trader-agent/backend/app/intel/market_agent/mmr.py` | **新建** — MMR 重排序算法 |

**MMR 参数**：`lambda_param = 0.7`（0 = max diversity, 1 = max relevance）

**验收**：
- [ ] 知识条目能写入 + 生成 embedding
- [ ] `/api/knowledge/search` 返回 Top-5 去重结果
- [ ] 相同主题的重复片段被 MMR 过滤

---

## 5. 全局架构上下文

```
┌─────────────────────────────────────────────────┐
│  CLI (apps/trader-cli)                          │
│  ├─ ChatPage.tsx — 用户交互                       │
│  ├─ chatReAct.ts — ReAct 循环                    │
│  ├─ chatSession.ts — 会话管理（P1-1/P1-2）        │
│  ├─ agentFactory.ts — Agent 工厂（P2-3）          │
│  └─ daemon/ — Daemon 主循环                       │
├─────────────────────────────────────────────────┤
│  Workflows (apps/trader-workflows)              │
│  ├─ decisionGraph — 决策生成                       │
│  ├─ outcomeGraph — 结果回标 + Triple Barrier(P2-2)│
│  ├─ evaluationGraph — 评估报告                     │
│  └─ decisionEnvelope — 决策信封（P1-3 regime注入）  │
├─────────────────────────────────────────────────┤
│  Backend (apps/trader-agent/backend)            │
│  ├─ api/tools.py — Web Search/Fetch              │
│  ├─ api/chat.py — 会话记忆 API（P1-1）            │
│  ├─ api/store.py — Store API（P2-4）              │
│  ├─ api/knowledge.py — 语义检索（P2-5）            │
│  ├─ api/market_agent.py — Regime 端点             │
│  ├─ market_agent/features.py — 指标计算 + Regime  │
│  └─ db/schema.py — 所有表定义                      │
└─────────────────────────────────────────────────┘
```

**数据流向**：

```
用户输入 → ChatPage → chatReAct (ReAct循环)
                         │
                         ├── 需要搜索？→ webSearch → Backend → tools.py → DuckDuckGo
                         ├── 需要行情？→ fetchRegime → Backend → features.py → ta 库
                         ├── 需要 Workflow？→ runWorkflow → Backend → workflows.py
                         └── 回复完成 → chatSession.persist() → SQLite
                                              │
                                    maybeCompress() (P1-2)
```

---

## 6. 参考

- `14_llm_reasoning_strategy.md` — 所有 LLM 推理策略的源文档
- `15_ai_quant_book_reference.md` — 交易领域参考
- `16_ai_agent_book_reference.md` — Agent 工程参考
- `18_memory_and_conversation_design.md` — 对话记忆完整设计
- `19_planning_mode_design.md` — Planning 模式设计
- `.agent-dev/tasks/` — Task 定义文件（T028-T031）
- `.agent-dev/specs/` — Spec 定义文件
