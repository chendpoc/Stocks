# 23. Cache-First Loop — Reasonix 前缀缓存优化参考

> 状态: reference | 来源: Reasonix (esengine/reasonix) | 更新: 2026-06-11

## 1. 文档目的

Reasonix 是专为 DeepSeek API 设计的终端编码 Agent，其核心创新是 **Cache-First Loop**——通过三个原则（不可变性、追加性、隔离性）将上下文分区管理，达到 99.82% 的缓存命中率，成本降低 5 倍。

本文档记录其设计原理和优化方案，作为我们后续缓存优化的参考。**当前不实现**——留到 Phase 3。

---

## 2. 核心原理：前缀缓存的经济学

DeepSeek API（和我们用的 V4 模型）对缓存命中的 token 给予约 90% 的成本折扣：

```
cache_hit token:  ~$0.014/M  （约 10% 原价）
cache_miss token: ~$0.14/M   （全价）
```

**关键约束**：缓存以 128-token 为粒度，要求**字节完全相同**。任何修改——哪怕加一个空格——都会从修改点开始使缓存全部失效。

Reasonix 的设计就是围绕这一约束展开：**让 prompt 的开头部分尽可能稳定不变**。

---

## 3. 三个核心原则

### 3.1 不可变性 (Immutability)

```
Once set, stable sections NEVER change — not even whitespace.

Stable 段（永不改变）：
  ├─ System Prompt 骨架
  ├─ Tool Definitions（JSON schema）
  ├─ Project Rules / Conventions
  └─ Persistent Memory Files

Volatile 段（每次变化）：
  ├─ 用户消息（每轮不同）
  ├─ 工具调用结果（每次不同）
  └─ Assistant 回复（每轮不同）
```

**如果 Stable 段需要更新**（比如加了新规则）：Reasonix 接受一次 cache miss，更新后下一次又恢复命中。关键是不让高频变化的内容污染 Stable 段。

### 3.2 追加性 (Appendability)

```
只向末尾追加，绝不插入中间。

正确:                           错误:
[System Prompt]                 [System Prompt]
[Message 1]                     [Message 1]
[Message 2]                     [新插入的 Message]  ← 破坏了对齐
[Message 3]                     [Message 2]
[新 Message 4] ← append         [Message 3]
```

任何插入操作都会使后续所有 128-token 块重新对齐，缓存全部失效。只有 append 能保持对齐。

### 3.3 隔离性 (Isolation)

```
将不同变化频率的信息隔离到不同的段中。

高频变化（每轮）:
  └─ 对话轮次 → 放入 messages 数组末尾

中频变化（每小时/每天）:
  ├─ 市场摘要 → 放入 system prompt 末尾（独立段）
  └─ 压缩历史 → 放入最后一条 system message

低频变化（每周/每月）:
  └─ 关注列表 → 放入 system prompt 末尾

几乎不变:
  └─ 角色定义 + 规则 → 放入 system prompt 最前
```

---

## 4. 四段式上下文架构

Reasonix 将 prompt 分为四个段，按变化频率从低到高排列：

```
┌─────────────────────────────────────────────────────────┐
│ Segment A: Foundation（几乎不变）                          │
│   System Prompt 骨架 + 编码规则 + 输出格式                  │
│   占比: ~40%  |  变化频率: 版本更新时                      │
│   缓存策略: 长期命中                                       │
├─────────────────────────────────────────────────────────┤
│ Segment B: Project Context（低频变化）                     │
│   项目规则 + 技术栈约定 + 持久记忆文件                     │
│   占比: ~30%  |  变化频率: 每天/每周                       │
│   缓存策略: 按天命中                                       │
├─────────────────────────────────────────────────────────┤
│ Segment C: Session Context（中频变化）                     │
│   当前任务上下文 + 压缩历史                                 │
│   占比: ~15%  |  变化频率: 每次会话                        │
│   缓存策略: 会话内命中                                     │
├─────────────────────────────────────────────────────────┤
│ Segment D: Turn Context（高频变化）                        │
│   当前轮的用户消息 + 工具调用结果 + Assistant 回复            │
│   占比: ~15%  |  变化频率: 每轮                            │
│   缓存策略: 极少命中                                       │
└─────────────────────────────────────────────────────────┘
```

---

## 5. 我们的现状 vs Reasonix 理想态

### 5.1 当前架构的问题

| 做法 | 对缓存的影响 | 违反原则 |
|---|---|---|
| system prompt 固定文本 | ✅ 促进缓存 | — |
| `PREFERRED_SYMBOLS_LABEL` 注入 system prompt | ❌ 每次可能变 | 不可变性 |
| 压缩摘要注入 system prompt | ❌ 每次压缩后变了 | 不可变性 |
| tool definitions 固定 | ✅ 促进缓存 | — |
| messages 数组 append | ✅ 符合追加性 | — |
| 新消息插入历史中间 | ❌ 不存在此场景 | —（天然符合） |

### 5.2 优化方案

| 阶段 | 优化 | 预期缓存提升 | 改动量 |
|---|---|---|---|
| **立即**（当前迭代） | system prompt 分离：骨架（永不变）+ 变量段（偶尔变）| 60% → 75% | ~10 行 |
| **立即** | 压缩摘要从 system prompt → 最后一条 system message | 75% → 80% | ~5 行 |
| **立即** | 缓存命中率埋点 | 可视化当前命中率 | ~3 行 |
| **Phase 2** | `PREFERRED_SYMBOLS` 从 system prompt → 动态 context 注入 | 80% → 85% | ~15 行 |
| **Phase 3** | 四段式上下文架构（Foundation / Project / Session / Turn） | 85% → 90%+ | ~100 行 |

### 5.3 立即改的实现细节

```typescript
// 当前（破坏缓存）:
const system = `${BASE_SYSTEM_PROMPT}\n关注列表: ${PREFERRED_SYMBOLS_LABEL}`;

// 优化后:
const SYSTEM_FOUNDATION = `你是 Forward Market Intelligence Agent...（纯文本，无变量）`;
const variables = `关注列表: ${PREFERRED_SYMBOLS_LABEL}`;
const system = `${SYSTEM_FOUNDATION}\n---\n${variables}`;
// SYSTEM_FOUNDATION 永远命中缓存，只有 variables 部分可能 miss
```

```typescript
// 当前（破坏缓存）:
const system = `${BASE}\n此前讨论摘要: ${compressedSummary}`;

// 优化后:
const system = BASE;  // 永不变
messages = [
  ...history,
  { role: "system", content: `此前讨论摘要: ${compressedSummary}` },
  { role: "user", content: latestUserMessage },
];
// system prompt 永远命中缓存，摘要作为额外 system message 追加
```

---

## 6. 缓存命中率埋点

```typescript
// chatReAct.ts onStepFinish 中:
onStepFinish: async ({ text, toolCalls, toolResults, usage }) => {
  const cacheHit = usage?.promptCacheHitTokens ?? 0;
  const cacheMiss = usage?.promptCacheMissTokens ?? 0;
  const totalPrompt = cacheHit + cacheMiss;
  const hitRate = totalPrompt > 0 ? (cacheHit / totalPrompt * 100).toFixed(1) : "?";
  
  console.log(`[cache] ${cacheHit}/${totalPrompt} hit (${hitRate}%)`);
  // ...
}
```

---

## 7. 四段式架构的远期设计（Phase 3 参考）

```typescript
interface ContextSegments {
  foundation: string;   // Segment A: 永不变。system prompt 骨架
  project: string;      // Segment B: 低频。规则 + 记忆文件
  session: string;      // Segment C: 中频。当前任务上下文 + 压缩历史
  // Segment D 不在此处——它是每轮的 messages 数组
}

function buildPrompt(segments: ContextSegments, messages: Message[]): string {
  // 按稳定性排序: A → B → C → D
  return [
    segments.foundation,     // 缓存命中率: ~100%
    segments.project,        // 缓存命中率: ~90%
    segments.session,        // 缓存命中率: ~60%
    ...messages,             // 缓存命中率: ~10%
  ].join("\n---\n");
}
```

---

## 8. 关键数据

| 指标 | Reasonix 达到 | 我们当前（估计） | 我们的 Phase 1 目标 |
|---|---|---|---|
| 缓存命中率 | 99.82% | ~60% | 80% |
| 成本 vs 无缓存 | 5x 降低 | ~2x 降低 | ~3.5x 降低 |
| 每轮 LLM 费用 | ~$0.002 | ~$0.005 | ~$0.003 |

---

## 9. 不实现的原因

**Phase 1 优先级高于缓存优化**：

1. 会话记忆 + 滑动窗口 —— 用户直接可感知
2. Regime 注入 DecisionEnvelope —— 功能完整性
3. Web Search 真实 API —— 工具可用性

缓存优化在 Phase 3 做——当系统稳定运行、Token 消耗成为可见成本时再优化。优化过早是浪费。

---

## 10. 参考源

- **Reasonix GitHub**: https://github.com/esengine/reasonix
- **Reasonix Architecture**: https://esengine.github.io/DeepSeek-Reasonix/architecture.html
- **Cache-First Loop DeepWiki**: https://deepwiki.com/esengine/reasonix/2.1-cachefirstloop
- **四支柱 DeepWiki**: https://deepwiki.com/esengine/reasonix/1.2-four-architectural-pillars
- **DeepSeek API Prefix Cache**: https://api-docs.deepseek.com/zh-cn/quick_start/pricing
