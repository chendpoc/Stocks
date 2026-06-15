# Trader Agent — CLI Chat 推理架构设计

> Date: 2026-06-16 | Status: proposed
>
> 参考设计：`project-docs/01_agent_context_architecture.md` — Claude Code 脑架构
> 目标模块：`apps/trader-cli/src/ui/ai/` — CLI Chat ReAct Agent
> 服务层：`apps/trader-agent/backend/` — trader-agent 后端

---

## 0. 设计原则（从 Claude Code 借鉴）

| Claude Code 原则 | trader-agent 映射 |
|------------------|------------------|
| 不依赖一次性超长 prompt | Context Pack 分层注入（不把整个市场分析塞进 prompt） |
| 动态 Tool Registry | 根据当前任务（行情查询 / 决策分析 / 复盘）暴露不同工具 |
| 工作记忆 / 情景记忆分离 | Workspace（当前交易上下文） vs Episodic（历史决策记录） |
| 任务账本 Task Ledger | DecisionRecord + OutcomeRecord — 所有决策可审计 |
| 睡眠式复盘巩固 | 收盘后 Consolator：总结当日决策，提取 lesson，生成次日 watchlist |
| 权限门禁 Permission Gate | 下单/发送消息/写入长期记忆 → 需确认 |
| 调试面板 Debug Panel | Chat Trace：prompt 构成、工具调用链、决策依据溯源 |

---

## 1. 当前现状 vs 目标架构

### 1.1 现状

```text
CLI Chat (chatReAct.ts)
  └── ReAct loop: user message → LLM → tool calls → LLM → response
      └── Tool Registry: all tools always exposed
      └── Context: system prompt + conversation history (无分层)
      └── Memory: 无跨 session 记忆
      └── Debug: 仅 console.log
```

**问题**：
- 所有 23 个工具每次都注入 prompt，token 浪费严重
- 没有任务分类机制——行情查询和深度决策分析走同一条 ReAct 路径
- 会话结束后没有记忆固化——下次打开 "完全不记得上次讨论了什么"
- 没有风险门禁——LLM 可以调用任何暴露的工具

### 1.2 目标架构

```text
┌─────────────────────────────────────────────────────────────┐
│                     Context Pack Builder                     │
│  [Core Contract] + [Market Context] + [Task Contract]       │
│  + [Relevant Tools] + [Retrieved Memory] + [Workspace]      │
│  + [Risk Policy] + [Output Schema]                          │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                    Task Router                               │
│  Classify → Select Mode → Select Tools → Build Context       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Quick    │  │ Analysis │  │ Decision │  │ Review   │   │
│  │ Query    │  │ (CoT)    │  │ (ReAct)  │  │ (Retro)  │   │
│  │ ~500ms   │  │ ~3-5s    │  │ ~10-30s  │  │ ~5-10s   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│              Agent Loop (模式化 ReAct)                        │
│  Observe → Retrieve → Think → Act → Verify → Respond        │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                   Memory & Output                            │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Session      │  │ Episodic     │  │ Decision Record  │   │
│  │ Workspace    │  │ Memory       │  │ + Outcome Ledger │   │
│  └─────────────┘  └──────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Task Router — 四种推理模式

### 2.1 模式分类

| Mode | 触发条件 | 推理策略 | 工具注入 | 延迟预算 | 示例 |
|------|---------|---------|---------|---------|------|
| **Quick** | 单步信息查询 | 1 轮 LLM + 1 次工具调用 | 只注入 query 相关工具 | <500ms | "TSLA 现在多少？" |
| **Analysis** | 多维度分析 | CoT 链式推理 | 注入 market-data + scan + signals | 3-5s | "AAPL 现在适合入场吗？" |
| **Decision** | 决策 + 行动 | 完整 ReAct loop | 注入全量工具 + 权限确认 | 10-30s | "根据当前信号，应该加仓 TSLA 吗？" |
| **Review** | 复盘 + 学习 | Retrospective 总结 | lesson/note 写入工具 | 5-10s | "回顾今天决策" |

### 2.2 TaskRouter 实现路径

```typescript
// src/chat/taskRouter.ts
type TaskMode = "quick" | "analysis" | "decision" | "review";

interface TaskClassification {
  mode: TaskMode;
  confidence: number;
  requiredTools: string[];   // 本轮暴露的工具列表
  contextBudget: number;     // token 预算
}

function classifyTask(userMessage: string, workspace: WorkspaceState): TaskClassification {
  // 阶段一：规则匹配（关键词 + 语法结构）
  if (isQuickQuery(userMessage)) return { mode: "quick", ... };
  if (containsDecisionIntent(userMessage)) return { mode: "decision", ... };
  
  // 阶段二：LLM 分类（小模型，<100 token prompt）
  // "Classify: query | analysis | decision | review"
  return llmClassify(userMessage);
}
```

---

## 3. Context Pack Builder — 分层上下文

### 3.1 七层结构

```typescript
interface ContextPack {
  core: CoreContract;           // 1-2K tokens — trader-agent 身份与约束
  marketContext: MarketContext; // 2-4K tokens — 当前市场环境摘要
  task: TaskContract;           // 0.5-1K tokens — 本轮任务定义
  tools: ToolView[];            // 1-3K tokens — 本轮暴露的工具（动态）
  retrieved: RetrievedMemory;   // 2-8K tokens — 检索到的相关记忆
  workspace: WorkspaceState;    // 1-3K tokens — 当前上下文状态
  riskPolicy: RiskPolicy;       // 0.5-1K tokens — 本轮权限约束
}
```

### 3.2 各层内容

#### [0] Core Contract（~2K tokens）

```text
你是 trader-agent，一个专注于市场交易的 AI 助手。
- 你可以查询行情、分析信号、评估决策、进行复盘
- 你不会在没有用户确认的情况下执行交易操作
- 你的分析必须有数据和证据支撑
- 不确定时你会明确说明
- 你使用中文回复
```

#### [1] Market Context（~3K tokens，动态更新）

```json
{
  "regime": "high_volatility",
  "focus_symbols": ["TSLA", "QQQ"],
  "key_events_today": ["Fed speech 14:00", "TSLA earnings after close"],
  "market_summary": "SPX -0.3%, VIX 18.2, 10Y 4.2%",
  "updated_at": "2026-06-16T10:00:00Z"
}
```

#### [2] Task Contract（~1K tokens）

```json
{
  "task_type": "decision",
  "symbol": "TSLA",
  "user_question": "现在的回调是买入机会还是止损信号？",
  "success_criteria": "给出有证据支撑的建议（含风险提示）",
  "output_schema": { "recommendation": "string", "evidence": "EvidenceRef[]", "risk_note": "string" }
}
```

#### [3] Tool View（动态注入）

```
Decision 模式：注入 8-10 个工具 — getQuote, getBars, getSignals, runScan, getContext, getNews, getOptionsFlow, getPortfolio
Quick 模式：注入 1-2 个工具 — getQuote, (maybe) getBars
Review 模式：注入 lesson/create, note/save, memory/recall
```

#### [4] Retrieved Memory（从记忆系统检索）

```json
{
  "related_decisions": [
    { "date": "2026-06-10", "action": "TSLA buy 245", "outcome": "pending", "lesson": "追高后回调中加仓，注意分批" }
  ],
  "signal_history": [
    { "date": "2026-06-15", "type": "volume_spike", "symbol": "TSLA" }
  ],
  "relevant_notes": [
    "用户上次提到 TSLA 如果回调至 200 以下会考虑买入"
  ]
}
```

#### [5] Workspace State（会话内工作记忆）

```json
{
  "session_id": "sess_20260616_001",
  "current_topic": "TSLA 回调分析",
  "open_questions": ["支撑位在哪？", "成交量是否配合？"],
  "pending_actions": [],
  "step_count": 3,
  "last_step": "查询了 TSLA 日线数据"
}
```

#### [6] Risk Policy（每轮注入）

```text
- 只读操作：自动执行
- 写入操作（保存笔记、更新 watchlist）：执行并记录
- 发送消息（推送通知）：需确认
- 执行交易：强制拒绝（聊天界面不执行交易）
```

---

## 4. Memory System — 三层记忆

### 4.1 Workspace Memory（会话内）

- 存储：ChatSession 对象的 `workspaceState` 字段
- 生灭：会话创建 → 会话结束 / compaction
- 内容：当前话题、已执行步骤、待解决问题、临时假设

### 4.2 Episodic Memory（跨会话）

- 存储：`episodic_events` 表（trader-agent backend）
- 每条记录：`{ session_id, task_type, summary, decisions[], outcome, lesson, importance }`
- 检索策略：
  - 同 symbol 最近 10 次决策
  - 重要性 > 0.5 的 lesson
  - 最近 30 天的重要事件

```sql
-- 检索相关情景记忆
SELECT * FROM episodic_events
WHERE symbol = :symbol
  AND created_at > datetime('now', '-30 days')
  AND importance > 0.3
ORDER BY created_at DESC
LIMIT 10;
```

### 4.3 Semantic Memory（知识存储）

- 存储：用户的交易原则、经验总结、关键认知
- 格式：`{ concept: "分批加仓优于一次性满仓", source: "lesson_from_tsla_trade_0610", confidence: 0.85 }`
- 检索：向量相似度 + 关键词匹配

---

## 5. Permission Gate — 权限门禁

| Action | Policy | Reasoning |
|--------|--------|-----------|
| `getQuote`, `getBars`, `getSignals` | ✅ Auto | 只读，零风险 |
| `saveNote`, `updateWatchlist` | ✅ Auto + Log | 低风险写入 |
| `sendNotification` | ⚠️ Confirm | 外部通知 |
| `placeTrade` | 🚫 Blocked | 聊天界面禁止交易 |
| `writeLongTermMemory` | ⚠️ Confirm | 控制记忆质量 |

---

## 6. Debug Panel — 调试面板

### 6.1 P0 必做 Trace

| Trace 页面 | 内容 |
|-----------|------|
| Current Context Pack | 显示七层的实际 token 用量和内容摘要 |
| Tool Calls | 工具名、参数、返回值、耗时、状态 |
| Memory Events | 检索到的记忆、提议写入的记忆 |
| Decision Trace | 决策链路：observation → classification → tools → final response |

### 6.2 实现路径

在 `ChatSession` 中注入 `DebugTrace` 对象，每步执行后追加 trace event。面板在 `chatReAct.ts` 中按 `debug` flag 渲染。

```typescript
interface ChatTrace {
  contextPack: ContextPack;
  steps: Array<{
    step: number;
    type: "think" | "tool_call" | "response" | "memory";
    content: string;
    tokens: number;
    durationMs: number;
  }>;
}
```

---

## 7. Sleep Consolidator — 会话复盘

每次 Chat 会话结束后：

```
1. Summarize — LLM 总结本次对话的核心主题和结论
2. Decide — 判断哪些内容应该写入 Episodic Memory（重要性 ≥0.5）
3. Extract — 提取 lesson learned（如果有交易决策）
4. Update — 更新用户偏好（如果有新认知）
5. Schedule — 生成 follow-up 提醒（如"TSLA 回调破支撑位时通知我"）
```

---

## 8. 实施路线图

### Phase C1: Context Pack Builder（~3 天）

| Step | 内容 | 文件 |
|------|------|------|
| C1.1 | 定义 `ContextPack` 类型和七层结构 | `src/chat/contextPack.ts` |
| C1.2 | 实现 `buildContextPack(task, workspace, memory)` | 同上 |
| C1.3 | 修改 `chatReAct.ts` — 用 ContextPack 替代 raw system prompt | 修改 |
| C1.4 | 添加 token 预算追踪 | 修改 |

### Phase C2: Task Router（~2 天）

| Step | 内容 | 文件 |
|------|------|------|
| C2.1 | 实现四种模式的规则匹配 + LLM 分类 | `src/chat/taskRouter.ts` |
| C2.2 | 动态工具注入 — 根据 TaskMode 选择工具集 | `src/chat/toolSelector.ts` |
| C2.3 | 集成到 ChatSession 启动流程 | 修改 `chatReAct.ts` |

### Phase C3: Memory System（~4 天）

| Step | 内容 | 文件 |
|------|------|------|
| C3.1 | Workspace Memory — ChatSession 内状态管理 | 修改 `chatReAct.ts` |
| C3.2 | Episodic Memory API — 读写 `episodic_events` 表 | backend + `src/chat/memory/episodic.ts` |
| C3.3 | Semantic Memory API — 向量检索 | backend + `src/chat/memory/semantic.ts` |
| C3.4 | 会话结束时触发 Consolidator | `src/chat/consolidator.ts` |

### Phase C4: Permission + Debug（~2 天）

| Step | 内容 | 文件 |
|------|------|------|
| C4.1 | Permission Gate — 工具调用前拦截 | `src/chat/permissionGate.ts` |
| C4.2 | Debug Trace — 每步 append trace event | `src/chat/debugTrace.ts` |
| C4.3 | Debug Panel UI — `--debug` flag 渲染 trace | `src/chat/debugPanel.tsx` |

---

## 9. 与其他重构任务的关系

| 任务 | 状态 | 本设计的影响 |
|------|------|------------|
| T035 Commander | 🔄 S1 done | 不冲突 — CLI 命令树和 Chat Agent 是两个独立功能 |
| Architecture Refactoring | 🔄 Phase A done | Chat 模块受益于干净的 api/ data/ 分层 |
| Utils Extraction | 📄 planned | ContextPack Builder 会用到 `utils/` 中的函数 |
| Node.js 生态现代化 | 📄 planned | pino 替换 console.log 用于 debug trace |

---

## 10. 工作量估算

| Phase | Est. Days | Relative Risk |
|-------|-----------|---------------|
| C1 Context Pack | 3 | Low（纯文本构造，不改变 agent 行为） |
| C2 Task Router | 2 | Medium（改变工具注入逻辑，影响 agent 行为） |
| C3 Memory System | 4 | High（跨 session 状态，后端 + 前端联动） |
| C4 Permission + Debug | 2 | Low（叠加层，不影响核心流程） |
| **Total** | **11 days** | |
