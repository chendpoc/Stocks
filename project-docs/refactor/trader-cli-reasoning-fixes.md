# trader-cli 推理架构 — 三项修复方案

> Date: 2026-06-16 | Status: ready-to-execute
>
> 修复对象: `apps/trader-cli/src/chat/runChatTurn.ts`
> 关联: `debugTrace.ts`, `permissionGate.ts`, `taskRouter.ts`

---

## 问题 1: debugTrace 缺 ProcessedContext

### 根因

`runChatTurn.ts:97-101` — `buildDebugTrace()` 调用时未传 `processedContext`。
`buildDebugTrace` 签名已接受 `processedContext?: ProcessedContext`（debugTrace.ts:45），
但 `runChatTurn` 未传。`prepareChatTurn()` 内部创建了 `ProcessedContext`（L40）但未暴露给返回值。

### 修复（2 处改动）

1. `prepareChatTurn` 返回值新增 `ctx: ProcessedContext` 字段
2. `runChatTurn` 中 `buildDebugTrace` 调用时传入 `processedContext: prepared.ctx`

```diff
// prepareChatTurn — 在 return 中加 ctx
  return {
    classification,
    processedContextId,
    activeTools: selection.activeTools,
+   ctx,
    frame,
  };

// runChatTurn — debugTrace 调用时传 processedContext
  const debugTraceJson = input.debug
    ? buildDebugTrace({
+       processedContext: prepared.ctx,
        classification: prepared.classification,
        activeTools: prepared.activeTools,
        reactResult: result,
      })
    : undefined;
```

### 预期效果

`contextLayerSummary` 和 `processedContextId` 不再是空对象/空字符串。

---

## 问题 2: permissionGate 未接入 ReAct 执行路径

### 根因

`runChatTurn.ts:85-94` — `chatReAct` 调用前无权限检查。
`permissionGate.ts` 提供了完整的 `evaluateToolPermission()` 和 `assertToolPermitted()` 函数，
但 `runChatTurn` 导入后未使用。

### 修复方案：静默过滤

`chatReAct` 调用前插入权限检查，blocked 工具从 `activeTools` 中移除（但保留在 `tools` 中）：

```diff
// runChatTurn — chatReAct 调用前插入权限过滤
+ const permissionDecisions = prepared.frame.activeTools.map(evaluateToolPermission);
+ const blockedTools = new Set(
+   permissionDecisions.filter(d => !d.allowed).map(d => d.toolName)
+ );
+ const filteredActiveTools = prepared.frame.activeTools.filter(t => !blockedTools.has(t));

  const result = await chatReAct({
    model: input.model,
    system: prepared.frame.system,
    messages: prepared.frame.messages,
    tools: prepared.frame.tools,
-   activeTools: prepared.activeTools,
+   activeTools: filteredActiveTools,
    ...
  });

// debugTrace 中传入 permission decisions
  const debugTraceJson = input.debug
    ? buildDebugTrace({
+       permissionDecisions,
        ...
      })
    : undefined;
```

**关键设计**：只过滤 `activeTools`，不删除 `tools`。SDK 需要完整的工具注册来识别工具调用，
`activeTools` 只是限制本轮可用工具列表。

### 设计决策：静默过滤 vs assertToolPermitted（抛异常）

选**静默过滤**。原因：
- 用户说 "帮我买入 AAPL" 不应因 trade 工具被 blocked 而直接报错
- 应用剩余的 `read_market` 工具回复 "我无法执行交易操作，但可以帮你分析 AAPL 当前走势"
- `assertToolPermitted` 仅在需要强制阻断的场景使用（如下单 API 直接调用）

---

## 问题 3: taskRouter 规则顺序 — "TSLA 走势分析" 被误判为 quick

### 根因

`taskRouter.ts` 中 `QUICK_PATTERNS` 匹配块在 `ANALYSIS_PATTERNS` 之前。
`QUICK_PATTERNS[1]` = `/^(TSLA|AAPL|NVDA|...)/i` 会先于 `/分析|走势|.../i` 匹配到 "TSLA 走势分析"，
导致 `mode: "quick"`。

### 修复

将 `ANALYSIS_PATTERNS` 匹配块移到 `QUICK_PATTERNS` 之前：

```diff
// taskRouter.ts — 规则匹配顺序
  review → decision → analysis → quick → ticker-only fallback → default

+ // ANALYSIS 必须在 QUICK 之前匹配
+ for (const pattern of ANALYSIS_PATTERNS) {
+   if (pattern.test(msg)) { return { mode: "analysis", ... }; }
+ }

  for (const pattern of QUICK_PATTERNS) {
    if (pattern.test(msg) && msg.length < 80) { return { mode: "quick", ... }; }
  }
```

### 验证用例（`taskRouter.test.ts` 补充）

```typescript
assert.strictEqual(classifyTask("TSLA 走势分析").mode, "analysis",
  "ticker + analysis keyword → analysis, not quick");
assert.strictEqual(classifyTask("TSLA").mode, "quick",
  "pure ticker → quick");
assert.strictEqual(classifyTask("TSLA 现在多少").mode, "quick",
  "short quote query → quick");
```

---

## 执行汇总

| 顺序 | 文件 | 改动 | 影响 | 风险 |
|------|------|------|------|------|
| 1 | `taskRouter.ts` | ANALYSIS 匹配块上移到 QUICK 之前 | 规则匹配顺序 | 低 |
| 2 | `runChatTurn.ts` | `prepareChatTurn` 返回值加 `ctx` 字段；`buildDebugTrace` 传 `processedContext` | debugTrace 内容 | 低 |
| 3 | `runChatTurn.ts` | `chatReAct` 前插入 `permissionDecisions` 过滤，blocked 工具从 `activeTools` 移除 | Agent 可用工具集 | 低 |
| 4 | `taskRouter.test.ts` | 补充 3 条测试用例 | 测试覆盖 | 极低 |

### 验证

```bash
npx tsc --noEmit       # 编译通过
npm test               # 所有测试通过
```
