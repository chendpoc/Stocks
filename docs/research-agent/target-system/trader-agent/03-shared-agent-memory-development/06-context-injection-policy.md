# 06 — Context Injection Policy

## 1. 模块目标

Context Injection Policy 定义 Agent 在回答、解释、生成 signal explanation 或抽取规则候选时，如何选择相关 active memory 注入上下文。

目标是让 Agent 继承已确认的金融规律，但不被无关或过期记忆污染。

## 2. 非目标

- 不注入 candidate memory。
- 不注入 rejected/deprecated memory。
- 不把所有 active memory 每次全量塞入模型。
- 不用 memory 直接触发交易。
- 不隐藏 memory 来源。

## 3. 输入

```text
task_type
page_context
conversation_context
symbols
related_symbols
asset_classes
market_scope
tags
time_context
```

示例：

```text
task_type = market_intent_explanation
page_context = dashboard_live
symbols = [SPY, QQQ]
tags = [option_day, macro_risk]
market_scope = US
```

## 4. 输出

```text
selected_memory_refs
context_payload
excluded_memory_summary
selector_version
selected_reasons_json
excluded_reasons_json
injected_context_hash
audit_event
```

## 5. 选择策略

第一版采用混合选择：

```text
status == active
AND market_scope matches
AND symbol/related_symbol/tags/task/page has overlap
AND (valid_until is null OR valid_until >= now)
ORDER BY relevance_score DESC
LIMIT context_budget
```

评分因素：

| Factor | 权重方向 |
|---|---|
| symbol 命中 | 高 |
| related_symbol 命中 | 中 |
| tag 命中 | 高 |
| task_type 匹配 | 高 |
| page_context 匹配 | 中 |
| confidence | 中 |
| last_reviewed_at | 中 |
| valid_from / valid_until | 中 |
| evidence_count | 中 |
| conflicted/deprecated | 排除 |

## 6. Context Budget

第一版限制注入数量：

```text
max_active_memories: 5
max_chars_per_memory: 800
max_total_chars: 3000
```

超过预算时只保留摘要和引用，不塞完整证据。

## 7. 引用要求

如果 memory 影响了 Agent 的结论，回答中必须能展示：

```text
memory title
memory id
evidence source
source date
heading path
```

Cockpit UI 可以显示为：

```text
Used Memory
- 节日前被动减持与节后回流
  source: 2026-05-07 每日总结 > 仓位/操作策略
```

## 8. 低置信度与冲突

默认不注入：

```text
confidence below threshold
conflicted
deprecated
candidate
rejected
```

用户明确询问“有哪些冲突看法”时，可以查询 conflicted memory，但必须标注状态。

## 9. 审计

每次注入 active memory 时记录：

```text
memory_context_selected
- selector_version
- run_id
- model_call_id
- task_type
- page_context
- selected_memory_ids
- selected_reasons_json
- excluded_reasons_json
- injected_context_hash
- symbols
- tags
- created_at
```

## 10. 验收标准

- Agent 默认只使用 active memory。
- Context selection 可解释。
- 不相关 memory 不进入上下文。
- 注入结果有数量和字符预算。
- 影响结论的 memory 可引用 evidence。
- 每次注入写入 audit，并包含 selector version、选择/排除理由和 injected context hash。
