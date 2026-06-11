# 24. Anthropic Engineering Gap Analysis — 差距分析与优化需求池

> 状态: requirements-backlog | 来源: Anthropic Engineering Blog | 更新: 2026-06-11

## 1. 文档目的

深度分析 Anthropic 工程团队的 SOTA 实践，逐项对比我们的系统，标记差距并生成优化需求。

**使用方式**：后续开发时，从本文档的"差距表"中选取条目，转化为 Task/Spec 实现。

---

## 2. Anthropic 工程文章清单

| 文章 | 核心主题 | 发布 | 与我们的相关性 |
|---|---|---|---|
| **Building Effective Agents** | 五模式分类法 + "Workflow 优先"哲学 | 2024.12 | ⭐⭐⭐ 核心参考 |
| **Prompt Caching** | 服务端前缀缓存经济学 | 2024.08 | ⭐⭐⭐ Reasonix 已覆盖 |
| **Tool Use Best Practices** | 工具设计原则 | 2024-2025 | ⭐⭐ 大部分已对齐 |
| **Context Window Engineering** | 上下文窗口显式预算管理 | 2025 | ⭐⭐ Phase 2 参考 |
| **MCP (Model Context Protocol)** | 工具/数据接入标准协议 | 2024.11 | ⭐ 远期参考 |

---

## 3. 差距分析总表

### 3.1 已对齐（8 项）

| # | Anthropic 实践 | 我们的实现 | 证据 |
|---|---|---|---|
| A1 | Prompt Chaining | DecisionGraph 10 节点 Pipeline | `decisionGraph.ts` |
| A2 | Routing | `complexity_score` → ReAct/Planning/Swarm | `14_llm_reasoning_strategy.md` §11 |
| A3 | Parallelization | Swarm 同层 Worker、Planning 同层步骤 | `14_llm_reasoning_strategy.md` §12、`19_planning_mode_design.md` |
| A4 | Orchestrator-Worker | Swarm Lead + Workers | `14_llm_reasoning_strategy.md` §12 |
| A5 | Evaluator-Optimizer（双层面） | Evidence→Contra→Judge + Outcome→Eval→Pattern | `14_llm_reasoning_strategy.md` §4、`08_outcome_and_evaluation.md` |
| A6 | Tool 精确描述 | Tool Registry `description` + `summary` + `describeTools` | `toolRegistry.ts` |
| A7 | Tool 最小权限 | `resolveTools(scope)` 按场景暴露子集 | `toolRegistry.ts` |
| A8 | "Workflow 优先"哲学 | DecisionGraph 是 Workflow，ChatAgent 才是 Agent | 架构选择 |

### 3.2 有差距 — 需立即修复（3 项）

| # | Anthropic 实践 | 我们的差距 | 优先级 | 改动量 |
|---|---|---|---|---|
| **G1** | **工具错误统一格式** `{ ok: false, code, message }` | intel 工具直接抛异常，长桥工具已统一但 intel 未对齐 | 🔴 P1 | 小 |
| **G2** | **System prompt 稳定性** — 可变信息不放 system prompt | `PREFERRED_SYMBOLS_LABEL` + 压缩摘要在 system prompt 中 | 🔴 P1 | 小 |
| **G3** | **缓存命中率埋点** | 零可见性 | 🔴 P1 | 极小 |

### 3.3 有差距 — 中期优化（4 项）

| # | Anthropic 实践 | 我们的差距 | 优先级 | 改动量 |
|---|---|---|---|---|
| **G4** | **上下文窗口显式预算** 10%/30%/50%/10% | 只用 60% 一刀切触发压缩 | 🟡 P2 | 中 |
| **G5** | **Evaluator-Optimizer 迭代** — "不通过则退回重新收集" | Judge 只是一次性评分，不触发重试 | 🟡 P2 | 中 |
| **G6** | **工具结构化输出** — tool 返回标准化 schema | 部分工具返回裸 JSON，无统一 schema | 🟡 P2 | 中 |
| **G7** | **"从简单开始"** — 能用 Workflow 不上 Agent | 当前所有新功能都考虑 Agent 模式（Planning/Swarm），可能有过度设计 | 🟡 P2 | 0（设计阶段约束） |

### 3.4 完整缺失 — Reflection 模式（1 项）

| # | 模式 | 我们的差距 | 优先级 | 改动量 |
|---|---|---|---|---|
| **G10** | **Reflection** — LLM 自我评估 + 迭代改进 | 零实现。ChatAgent 无自我评估，Plan 拆分无质量审查，build_evidence 无完整性自评 | 🟡 P2 | 中 |

### 3.5 有差距 — 远期（2 项）

| # | Anthropic 实践 | 我们的差距 | 优先级 | 改动量 |
|---|---|---|---|---|
| **G8** | **MCP 集成** — 标准工具接入协议 | 全部自定义接入 | 🟢 P3 | 大 |
| **G9** | **四段式上下文架构** — Foundation/Project/Session/Turn | 不分段 | 🟢 P3 | 大 |

---

## 4. 差距详细说明

### G1 — 工具错误统一格式

**Anthropic 标准**：所有 tool 返回 `{ ok: false, code: "RATE_LIMIT", message: "..." }`。

**当前问题**：

```typescript
// intel 工具 (toolRegistry.market.ts) — 直接 throw:
execute: async () => {
  try {
    return fetchIntel("/market/ingest", { method: "POST" });
  } catch (e) {
    // 异常直接抛给 Agent——Agent 拿到的是 unhandled error
  }
}

// 长桥工具 (toolRegistry.longbridge.ts) — 正确格式:
execute: async () => {
  const result = await runLongbridgeJson("quote", args);
  return result; // { ok: false, code: "ERROR", message: "..." }
}
```

**修复方案**：intel 工具统一包装 fetchIntel 异常为 `{ ok: false, code, message }`。

---

### G2 — System Prompt 稳定性

**Anthropic 标准**：system prompt 是最高优先级的缓存段，必须保持字节稳定。

**当前问题**：

```typescript
// tools.ts — 破坏缓存:
export const SYSTEM_PROMPT = `你是 Forward Market Intelligence Agent...
预设关注列表: ${PREFERRED_SYMBOLS_LABEL}`;
// PREFERRED_SYMBOLS 可能在代码更新时变化 → system prompt 整个失效

// chatSession.ts — 破坏缓存（设计阶段，未实现）:
const system = `${BASE}\n此前讨论摘要: ${compressedSummary}`;
// 每次压缩摘要变 → system prompt 整个失效
```

**修复方案**（已在 23 号文档详述）：

1. `PREFERRED_SYMBOLS_LABEL` 从 system prompt 移到动态 context 注入
2. 压缩摘要从 system prompt 移到最后一条 system message
3. System prompt 骨架文件化——永不运行时拼接变量

---

### G3 — 缓存命中率埋点

**Anthropic 建议**：追踪 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`。

**当前问题**：`chatReAct.ts` 的 `onStepFinish` 中没有缓存指标日志。

**修复方案**（已在 23 号文档详述）：在 `onStepFinish` 中添加 3 行日志。

---

### G4 — 上下文窗口显式预算

**Anthropic 建议**：

```
System Prompt:  ~10%  角色定义 + 规则
Context:        ~30%  数据、检索结果
Conversation:   ~50%  对话历史
Reserve:        ~10%  留给推理 + tool 结果
```

**当前实现**：只用 60% 一刀切触发压缩——没有区分各段的预算。

**优化方案**（Phase 2）：

```typescript
// chatSession.ts — 显式预算管理:
const BUDGET = {
  system: 0.10,      // 角色定义 + 规则
  context: 0.30,     // 行情摘要 + 检索结果
  conversation: 0.50, // 对话历史
};

function allocateContext(systemTokens: number, contextData: string, history: Message[]): ContextAllocation {
  const total = 128_000;
  const systemBudget = total * BUDGET.system;
  const contextBudget = total * BUDGET.context;
  const convBudget = total * BUDGET.conversation;
  
  return {
    systemPrompt: fitToBudget(systemText, systemBudget),
    contextInjection: fitToBudget(contextData, contextBudget),
    conversationHistory: fitToBudget(trimHistory(history), convBudget),
  };
}
```

---

### G5 — Evaluator-Optimizer 迭代

**Anthropic 标准**：`Evaluate → 不通过 → 退回重新 Generate → 再次 Evaluate → 循环直到通过或达到上限`。

**当前实现**：`generate_contra` 的 Judge 只是一次性评分——不通过时只标记 `needs_review`，不触发重新生成。

**优化方案**（Phase 2）：

```typescript
// generate_contra — 当前:
const contraResult = await runJudge(evidence);
// 一次性评分结束。

// generate_contra — 优化后:
let contraResult;
for (let round = 0; round < MAX_EVAL_ROUNDS; round++) {
  contraResult = await runJudge(evidence);
  if (contraResult.quality_score >= PASS_THRESHOLD) break;
  // 不通过 → 带着 Judge 的反馈重新收集证据:
  evidence = await runEvidenceBuilder({ previousJudgeFeedback: contraResult.critique });
}
```

---

### G6 — 工具结构化输出

**Anthropic 建议**：每个 tool 返回标准化的结构化 schema——Agent 不需要解析不同格式。

**当前问题**：不同 tool 返回格式不统一——有的有 `ok` 字段，有的直接抛异常，有的裸返回 JSON。

**优化方案**（Phase 2）：

```typescript
// 统一 tool 返回值格式:
interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}

// 工具注册时自动包装:
function wrapTool(impl: CoreTool): CoreTool {
  // 拦截 execute，统一返回格式
}
```

---

### G10 — Reflection 模式（来源：AI Agent Book 第 11 章）

**核心定义**（第 11 章 §11.1-11.2）：

```
生成 → LLM 自我评估 → 评分 (0.0-1.0) + 反馈 → 不达标 → 带反馈重生成 → 重复直到达标或 maxRetries
```

**五个关键特征**：

| 特征 | 说明 | 我们的实现 |
|---|---|---|
| **生成者 = 评估者** | LLM 评估自己的输出，不是外部评判 | ❌ `generate_contra` 是外部对抗，不是自我评估 |
| **量化评分 + 反馈** | 0.0-1.0 score + 具体可操作的改进建议 | ❌ `contraResult` 有 score 但来自外部 Judge |
| **迭代改进** | 不达标 → 带反馈重新生成 → 再评估 | ❌ `build_evidence → generate_contra` 是一次性的 |
| **复杂度门控** | 只有复杂任务才触发 Reflection | ⚠️ 有 `complexity_score` 但不用在 Reflection 上 |
| **优雅降级** | Reflection 失败 → 返回初始结果 | ✅ 所有 LLM 节点已有降级 |

**我们的根本差距**：

```
当前流程（无 Reflection）:

  ChatAgent: 用户提问 → ReAct 推理 → 回复 → 结束
                               ↑ 从不自问"我答得好吗？"

  DecisionGraph: build_evidence → generate_contra → Judge 评分 → 结束
                                                        ↑ 一次性，不触发重试

  Planning: 复杂度评分 → 生成 Plan → 执行
                                    ↑ 从不自问"拆分合理吗？粒度合适吗？"
```

**参考章节的关键参数**（§11.3-11.6）：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| `maxRetries` | 1-2 | 不是越多越好——成本翻倍 |
| `confidenceThreshold` | 0.7 | 0.95 几乎不可能达到 |
| 评估模型 | Flash / 小模型 | 评估任务简单，不需要大模型 |
| 反馈粒度 | 具体可操作 | "缺少创始团队背景" 而非 "质量不够好" |
| 降级策略 | 返回初始结果 | Reflection 失败不是任务失败 |

**三个建议落地点**：

| 位置 | 触发时机 | 评估内容 | 成本 | 价值 |
|---|---|---|---|---|
| **ChatAgent 分析回复后** | 每次分析类回复后 | 覆盖度 + 准确性 + 可验证性 | Flash 评估 ~$0.001 | 高 |
| **Plan 分解后** | Planning 生成 Plan 后 | 步骤粒度合理性 + 依赖完整性 + 范围重叠检查 | Flash 评估 ~$0.001 | 中 |
| **build_evidence 后** | 证据收集完成后 | 来源多样性 + 维度覆盖 + 数据新鲜度 | Flash 评估 + 可能追加 ReAct | 高 |

**五个常见坑的对照**（§11.6）：

| 坑 | 参考建议 | 我们应遵守 |
|---|---|---|
| 阈值太高 | 建议 0.7 | ✅ 用 0.7，不追求 0.9+ |
| 评估用贵模型 | 小模型评估 | ✅ 用 Flash |
| 反馈不具体 | 引导 LLM 给出可操作点 | ✅ Prompt 中要求具体改进点 |
| 失败就报错 | 优雅降级 | ✅ 返回初始结果 |
| 无限循环 | maxRetries=1-2 | ✅ maxRetries=1 |

**实施优先级**：Phase 2。理由——Reflection 是锦上添花（原文：不是核心依赖），Phase 1 先做功能完整性（会话记忆、Regime 注入）。

---

### G7 — "从简单开始" 设计约束

**Anthropic 核心哲学**：**"能用 Workflow 解决的，不要上 Agent。"**

**当前倾向**：我们在 Planning、Swarm、Handoff 等复杂 Agent 模式上投入了大量设计精力。但这些模式在实际使用中的触发频率可能很低（大多数对话不需要多步规划）。

**约束方案**（设计阶段）：

在新功能设计前，先回答三个问题：
1. 这能用固定 Pipeline（Workflow）实现吗？→ 能 → 用 Workflow
2. 这能用 Routing 实现吗？→ 能 → 用 Routing
3. 以上都不行 → 才考虑 Agent（Planning/Swarm）

---

## 5. 优化需求池

按优先级排列的待实现需求：

```
Phase 1（当前迭代）— 立即修复:
  [P1-G1] 工具错误统一格式        ← 3 个 intel 工具改 ~15 行
  [P1-G2] System prompt 稳定性     ← 分离骨架 + 变量段 ~10 行
  [P1-G3] 缓存命中率埋点           ← 3 行日志

Phase 2（下一迭代）— 中期优化:
  [P2-G4] 上下文窗口显式预算        ← chatSession.ts + ~50 行
  [P2-G5] Evaluator-Optimizer 迭代  ← generate_contra 改 ~30 行
  [P2-G6] 工具结构化输出统一        ← toolRegistry 包装层 ~40 行
  [P2-G7] "从简单开始"设计约束      ← 设计文档 + code review checklist
  [P2-G10] Reflection 模式 — ChatAgent 分析回复后自评  ← chat.ts + ~20 行

Phase 3（远期）— 架构升级:
  [P3-G8] MCP 集成                  ← 新建 mcp/ 模块
  [P3-G9] 四段式上下文架构           ← chatSession.ts 重构 ~100 行
```

---

## 6. 与之前文档的关系

| 本文档的需求 | 来源 | 已有设计文档 |
|---|---|---|
| G1 工具错误格式 | Anthropic Tool Design | — 新增需求 |
| G2 System prompt 稳定性 | Anthropic Prompt Caching + Reasonix | `23_cache_first_loop_reasonix.md` |
| G3 缓存命中率埋点 | Anthropic + Reasonix | `23_cache_first_loop_reasonix.md` |
| G4 上下文窗口预算 | Anthropic Context Window Engineering | `18_memory_and_conversation_design.md` §5.1 |
| G5 Evaluator-Optimizer 迭代 | Anthropic Building Effective Agents | `14_llm_reasoning_strategy.md` §4 |
| G6 工具结构化输出 | Anthropic Tool Design | — 新增需求 |
| G7 "从简单开始" | Anthropic Building Effective Agents | `19_planning_mode_design.md`、`20_development_roadmap.md` |
| G8 MCP | Anthropic MCP | `22_agent_frameworks_reference.md` §5.4 |
| G9 四段式上下文 | Anthropic + Reasonix | `23_cache_first_loop_reasonix.md` §4 |
| G10 Reflection 模式 | AI Agent Book 第 11 章 | `16_ai_agent_book_reference.md` §3.5 |

---

## 7. 参考源

- **Building Effective Agents**: https://www.anthropic.com/engineering/building-effective-agents
- **Anthropic Engineering Blog**: https://www.anthropic.com/engineering
- **Prompt Caching**: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- **Tool Use**: https://docs.anthropic.com/en/docs/build-with-claude/tool-use
- **MCP**: https://modelcontextprotocol.io
- **23_cache_first_loop_reasonix.md** — Reasonix 缓存优化参考
