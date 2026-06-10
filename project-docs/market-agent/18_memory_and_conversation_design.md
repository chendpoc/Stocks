# 18. Memory & Conversation Architecture — 对话记忆与会话管理

> 状态: design | 依赖: `03_memory_system_design.md`, `09_pattern_memory_and_learning.md`, `14_llm_reasoning_strategy.md`

## 1. 文档目的

`03_memory_system_design.md` 定义了**市场数据记忆**（6 层：Raw Market → Feature → Decision → Outcome → Pattern → Failure）。本文档补齐**对话层面**的记忆架构，覆盖：

1. **指标计算**：引入 `ta` 库替代手写 ADX / 布林带
2. **对话记忆分层**：工作记忆 / 会话记忆 / 语义记忆 / 长期记忆
3. **会话管理机制**：滑动窗口 + 压缩 + 自动标题 + 语义去重（MMR）
4. **LangGraph Cloud 对齐**：借鉴 Threads / Assistants / Runs / Store 设计

---

## 2. ta 库引入 — 替代手写指标计算

### 2.1 现状

`features.py` 中的 ADX、MA20、布林带宽度、区间位置均为纯 Python 手写：

```python
# 手写版 — 约 30 行
def _compute_adx(highs, lows, closes, period=14) -> float | None:
    # 手工计算 TR, +DM, -DM, ATR, +DI, -DI, DX...
```

### 2.2 方案

引入 `ta`（PyPI: `ta`），纯 Python 勿编译，与现有 `pandas` 兼容。

| 指标 | 手写行数 | ta / pandas 替代 |
|---|---|---|
| ADX (14) | ~30 行 | `ta.trend.ADXIndicator(high, low, close, 14).adx()` |
| MA20 | ~1 行 | `close.rolling(20).mean()` — pandas 直算 |
| Bollinger Band width | ~5 行 | `ta.volatility.BollingerBands(close, 20, 2)` → `.bollinger_hband()` / `.bollinger_lband()` |
| 区间位置 | ~2 行 | pandas `(close[-1] - min) / (max - min)` — 不需要 ta |

### 2.3 改动范围

- **文件**：`features.py`（仅 `_compute_adx` 和布林带计算部分）
- **依赖**：`pyproject.toml` 增加 `ta>=0.11,<1`
- **API 契约不变**：`compute_regime_from_bars()` 输入输出不变
- **测试**：现有手写版作为基准验证 `ta` 输出的合理性（允许微小浮点差异）

---

## 3. 对话记忆架构 — 四层设计

```
┌──────────────────────────────────────────────────┐
│ Layer 0  工作记忆 (Working Memory)   秒-分钟级      │
│ 上下文窗口内活跃内容：当前代码、当前分析标的、      │
│ 最近 N 轮对话                                           │
│ 存储: 内存 (LLM 上下文窗口)                             │
├──────────────────────────────────────────────────┤
│ Layer 1  会话记忆 (Session Memory)   分钟-小时级        │
│ 本次对话完整历史：消息列表、tool calls、中间状态        │
│ 存储: SQLite (chat_sessions + chat_messages 表)       │
│       + LangGraph checkpointer (graph state)           │
├──────────────────────────────────────────────────┤
│ Layer 2  语义记忆 (Semantic Memory)   永久             │
│ 跨会话的历史问答、知识片段、交易经验                      │
│ 存储: SQLite + sqlite-vec 向量扩展（起步）              │
│       或 ChromaDB / pgvector（远期）                     │
├──────────────────────────────────────────────────┤
│ Layer 3  长期记忆 (Long-term Memory)   天-月级          │
│ 用户偏好、成功模式、高频标的、自定义配置                  │
│ 存储: SQLite JSON 列（短期）                             │
│       PostgreSQL（远期，多用户场景）                      │
└──────────────────────────────────────────────────┘
```

**与市场记忆的关系**：市场数据记忆（`03_memory_system_design.md`）管"市场发生了什么"，对话记忆管"用户说了什么、系统学到了什么"。两者并行，通过 `session_context_packs` 和 `knowledge_entries` 在检索层交汇。

---

## 4. 会话记忆 — 存储选型

### 4.1 SQLite vs Redis

| 维度 | Redis | SQLite + JSON |
|---|---|---|
| **部署复杂度** | 新增进程 + 配置 | **零**（已有 sqlite3） |
| **持久化** | 需配置 RDB/AOF | **默认持久化** |
| **查询能力** | KV only | SQL + JSON 字段 |
| **当前架构匹配** | 全新依赖 | **已有连接池和 engine** |
| **性能（读 100 条）** | <1ms | 3-10ms |

**结论：SQLite 足够。** 会话记忆的访问频率（分钟-小时级）全量在 SQLite 能力边缘以内。

### 4.2 表设计

```sql
-- 会话元数据
CREATE TABLE chat_sessions (
    session_id TEXT PRIMARY KEY,
    title TEXT,                    -- 自动生成标题
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    message_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    metadata_json TEXT             -- { symbols, taskTypes, tags }
);

-- 消息完整历史
CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES chat_sessions(session_id),
    role TEXT NOT NULL,            -- user / assistant / system / tool
    content TEXT NOT NULL,
    tool_calls_json TEXT,           -- [{ toolName, args, result }]
    tokens INTEGER,
    created_at TEXT NOT NULL,
    step_number INTEGER
);

CREATE INDEX idx_chat_messages_session ON chat_messages(session_id, id);
```

### 4.3 读写 API

```
GET    /api/chat/sessions                          — 列出所有会话（含标题、时间、消息数）
POST   /api/chat/sessions                          — 创建新会话
GET    /api/chat/sessions/{session_id}             — 获取单个会话元数据
GET    /api/chat/sessions/{session_id}/messages    — 获取会话消息（分页）
POST   /api/chat/sessions/{session_id}/messages    — 追加消息（单条或批量）
PATCH  /api/chat/sessions/{session_id}            — 更新标题/元数据
```

---

## 5. Chat 会话管理机制

### 5.1 滑动窗口 + 压缩

**问题**：LLM 上下文窗口有限（128K-200K tokens），对话持续增长会超限。

**方案**：三层策略：

```
完整历史  →  SQLite (chat_messages 表，永不清除)
    ↓ 滑动窗口
最近 N 轮  →  内存缓存（最近 20 轮，直接注入 LLM 上下文）
    ↓ 触发阈值（>60% 上下文占用 或 >20 轮）
压缩历史  →  摘要注入 system prompt（不占用 messages 数组位置）
```

**压缩参数**：

| 参数 | 默认值 | 说明 |
|---|---|---|
| 活跃窗口大小 | 20 轮 | 消息数组直接保留 |
| 上下文阈值 | 60% | 超过后触发压缩 |
| 保留最近 | 5 轮 | 压缩后仍然保留原始对话 |
| 摘要模型 | Flash (低成本) | 生成 ≤200 token 结构化摘要 |

**压缩格式**：

```
此前讨论摘要:
- 标的: TSLA, NVDA
- 结论: TSLA VWAP Reclaim 确认(conf=0.72)，NVDA RS Pullback 不成立(conf=0.25)
- 待处理: 等待 1D 后回标 TSLA 决策、关注 COIN ORB 信号
```

压缩后的摘要注入 system prompt（不占消息数组），活跃窗口继续追加新消息。

### 5.2 会话识别（自动标题）

方案：第一条 assistant 回复完成后异步调用 Flash 模型生成标题。

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

三种触发时机：首轮回复结束 / 会话首次压缩 / 用户手动 `trader chat --title`。

### 5.3 语义去重 — MMR 重排序

从语义记忆中检索时，多条相似知识片段可能重复。用 MMR 平衡相关性和多样性。

```python
def mmr_rerank(
    query_embedding: list[float],
    candidates: list[tuple[str, list[float]]],
    top_k: int = 5,
    lambda_param: float = 0.7,  # 0 = max diversity, 1 = max relevance
) -> list[str]:
    selected = []
    remaining = list(candidates)
    
    for _ in range(min(top_k, len(candidates))):
        if not selected:
            idx = max(range(len(remaining)),
                      key=lambda i: cosine_sim(query_embedding, remaining[i][1]))
        else:
            idx = max(range(len(remaining)),
                      key=lambda i: (
                          lambda_param * cosine_sim(query_embedding, remaining[i][1]) -
                          (1 - lambda_param) * max(cosine_sim(remaining[i][1], sel[1]) for sel in selected)
                      ))
        selected.append(remaining.pop(idx))
    
    return [s[0] for s in selected]
```

在 Backend 的语义检索层（`GET /api/chat/knowledge/search`）中内置，调用者无感。

---

## 6. 语义记忆 — 向量方案

### 6.1 起步方案：sqlite-vec

`sqlite-vec` 是 SQLite 向量扩展，零外部进程，API 为纯 SQL。

**优点**：
- 与现有 SQLite 完全同构（同一个 db 文件）
- 无需安装 Docker / 额外服务
- 远期可平滑迁移到 pgvector（改连接即可）

**表设计（起步）**：

```sql
-- sqlite-vec 模式
CREATE VIRTUAL TABLE knowledge_vec USING vec0(
    embedding FLOAT[768],  -- embedding 向量（768 维，取决于模型）
);

-- 关联表
CREATE TABLE knowledge_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    source_session_id TEXT,
    tags TEXT,
    created_at TEXT NOT NULL
);
```

**备选**：如果暂时不引入任何向量扩展，用 **全文检索 (FTS5) + JSON 标签过滤** 作为语义记忆的轻量起步——全文搜索 + 标签过滤已经可以覆盖大部分"找回历史问答"的场景。

### 6.2 检索流程

```
用户提问 → Embedding Model → query vector
    → sqlite-vec 检索 Top-10
    → MMR 重排序 → Top-5
    → 注入 system prompt
```

---

## 7. 长期记忆

### 7.1 当前方案（SQLite JSON 列）

```sql
CREATE TABLE user_preferences (
    user_id TEXT PRIMARY KEY,
    preferred_symbols TEXT,        -- JSON: ["TSLA","NVDA"]
    risk_profile TEXT,             -- conservative / moderate / aggressive
    custom_context_json TEXT,      -- 用户自定义的注入内容
    updated_at TEXT NOT NULL
);
```

### 7.2 成功模式

存储用户过去决策的成功模式（setup + 进出场条件 + 胜率），CLI 启动时加载。

```sql
CREATE TABLE success_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    pattern_type TEXT NOT NULL,    -- setup / entry / exit / risk
    pattern_json TEXT NOT NULL,
    success_count INTEGER DEFAULT 0,
    last_used_at TEXT,
    created_at TEXT NOT NULL
);
```

---

## 8. LangGraph Cloud 对齐分析

### 8.1 概念对照

| LangGraph Cloud | 我们 | 对齐度 | 改进点 |
|---|---|---|---|
| **Threads** | `thread_id` + `MemorySaver` | ⚠️ 部分 | MemorySaver 内存级。需持久化层 |
| **Assistants** | Chat Agent / DecisionGraph / Daemon | ✅ 已对齐 | system prompt + tools = Assistant |
| **Runs** | `run_id` + `Stage1Runtime` | ✅ 已对齐 | 有 run 状态 + 审计日志 |
| **Cron Jobs** | Daemon `wakeSchedule` | ✅ 已对齐 | 定时醒来 + Gate CoT + 路由 |
| **Store** | — | ❌ 缺失 | 跨 Thread KV 存储 |
| **Streaming** | `chatReAct` + `onStep` | ✅ 已对齐 | 每步 Thought/Action/Observation |

### 8.2 可借鉴点

**Store — 跨会话共享存储**：LangGraph Cloud Store 是跨 Thread 的 KV，支持 namespace 隔离、TTL、JSON。我们的等价实现：

```sql
CREATE TABLE store_items (
    namespace TEXT NOT NULL,       -- 隔离域: "user_prefs", "feature_flags"
    key TEXT NOT NULL,
    value_json TEXT NOT NULL,
    ttl_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (namespace, key)
);
```

用途：用户偏好 / 功能开关 / 会话元数据 / 临时缓存。

**MemorySaver → 持久化 Checkpoint**：当前 DecisionGraph 用 `MemorySaver()`，重启丢失。当 Daemon 和 CLI 需共享 graph state 时，升级 `SqliteSaver`（`@langchain/langgraph-checkpoint-sqlite`）。**暂不引入**，按需升级。

**Cron 的 Thread 关联**：借鉴 `create_for_thread()` 模式——相同主题的多次 Daemon wake 共享同一个 thread_id，累积上下文。例如 Daily Recap 当天共享 `thread_id = daily-recap-2026-06-11`。

---

## 9. 实现优先级

```text
Phase 1（当前迭代）：
  1. ta 库引入 — 替换手写 ADX / 布林带 (2.3)
  2. 会话记忆 Schema — chat_sessions + chat_messages 表 + API (4.2-4.3)
  3. 滑动窗口 + 压缩 — ChatSession 类 + 内存缓存 (5.1)

Phase 2（下一迭代）：
  4. 自动标题 — Flash 异步生成 (5.2)
  5. 语义记忆 — sqlite-vec + MMR 重排序 (6)
  6. Store 等价物 — store_items 表 + API (8.2)

Phase 3（远期）：
  7. 长期记忆 — user_preferences + success_patterns (7)
  8. SqliteSaver 升级 — checkpoint 持久化 (8.2，按需)
  9. PostgreSQL 迁移 — 多用户场景 (7.1)
```

---

## 10. 关键决策汇总

| 决策 | 选型 | 理由 |
|---|---|---|
| 指标计算 | `ta` (PyPI) | pandas 兼容、纯 Python、无编译 |
| 会话记忆存储 | SQLite | 零依赖，毫秒级够用，已有引擎 |
| 语义记忆向量 | `sqlite-vec` 起步 | 零进程，同 db 文件，远期迁 pgvector |
| 长期记忆存储 | SQLite JSON | 单用户够用，远期迁 PostgreSQL |
| 压缩模型 | Flash (低成本) | ≤200 token 摘要，不阻塞对话 |
| MMR λ 参数 | 0.7 | 偏重相关性（0.7）同时保持多样性 |
| Message Saver | 保持 MemorySaver | 单次 run 够用，按需升级 |
| Chat API 端点 | Backend FastAPI | 复用现有 Backend 架构 |

---

## 11. 与现有模块的衔接

| 新增/修改 | 位置 | 影响范围 |
|---|---|---|
| `ta` 库 | `pyproject.toml` + `features.py` | 仅 `_compute_adx` 和布林带计算 |
| `chat_sessions` + `chat_messages` 表 | `apps/trader-agent/backend/app/intel/db/schema.py` | 新增表，不影响现有 |
| Chat API router | `apps/trader-agent/backend/app/intel/api/chat.py`（新建） | 独立路由，不影响现有 API |
| `ChatSession` 类 | `apps/trader-cli/src/llm/chatSession.ts`（新建） | ChatPage.tsx 引用 |
| `knowledge_entries` 表（Phase 2） | schema.py | 新增表 |
| `store_items` 表（Phase 2） | schema.py | 新增表 |
| MMR 重排序（Phase 2） | Backend knowledge retrieval | 检索层透明 |

---

## 12. 验收标准

### Phase 1 完成后：

- [ ] `features.py` 中 `_compute_adx()` 改为调用 `ta` 库，输出与原手写版一致（可容忍微小浮点差异）
- [ ] `pyproject.toml` 包含 `ta` 依赖
- [ ] `chat_sessions` 和 `chat_messages` 表在 Backend 可通过 API 读写
- [ ] ChatPage 支持滑动窗口——超过 20 轮后自动压缩，摘要注入 system prompt

### Phase 2 完成后：

- [ ] 新会话首次回复后自动生成标题（≤30 字中文）
- [ ] 语义检索支持 Top-K + MMR 去重
- [ ] `store_items` 支持 namespace/key/ttl 读写

### Phase 3 完成后：

- [ ] `user_preferences` 可通过 CLI 读取/更新
- [ ] `success_patterns` 在 CLI 启动时自动加载相关 pattern
