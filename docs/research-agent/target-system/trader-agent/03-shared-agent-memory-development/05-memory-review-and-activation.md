# 05 — Memory Review and Activation

## 1. 模块目标

Memory Review and Activation 负责把候选记忆从 candidate list 转成可用 active memory，或者拒绝、合并、标记冲突、废弃。

这是系统防止 memory 污染的核心边界。

## 2. 非目标

- 不允许 Agent 静默确认 memory。
- 不允许 Agent 静默覆盖 active memory。
- 不在第一版做多人审批。
- 不在第一版做复杂权限系统。
- 不把 memory activation 绑定交易执行。

## 3. UI 入口

```text
/cockpit/settings/memory
```

Tabs：

```text
Candidates
Active
Conflicted
Deprecated
Rejected
```

## 4. Candidate Table

字段：

```text
checkbox
type
title
summary
symbols
tags
confidence
evidence_count
created_at
status
actions
```

操作：

```text
Activate
Reject
Remove
Merge
Mark Conflicted
View Evidence
Edit Draft
```

支持批量：

```text
batch activate
batch reject
batch remove
```

批量 activate 必须要求二次确认，并显示将进入 active memory 的条数。

## 5. 状态机

Canonical lifecycle：

| Entity | Status | 含义 |
|---|---|---|
| memory candidate | `candidate` | 待人工处理 |
| memory candidate | `activated` | 已生成 active memory |
| memory candidate | `rejected` | 已拒绝 |
| memory candidate | `removed` | 软移除，保留审计 |
| memory candidate | `merged` | 已合并到其他 candidate 或 memory |
| memory candidate | `conflicted` | 与已有 memory 冲突 |
| memory item | `active` | 可注入上下文 |
| memory item | `conflicted` | 有冲突，不默认注入 |
| memory item | `deprecated` | 已过期或被替代 |

```text
candidate
  -> activated
  -> rejected
  -> removed
  -> merged
  -> conflicted

active
  -> update_candidate
  -> deprecated
  -> conflicted

conflicted
  -> active
  -> deprecated
  -> rejected
```

`removed` 可以是软删除状态，避免审计断链。

## 6. Update Candidate

更新 active memory 必须走：

```text
active memory
  -> update_candidate
  -> human review
  -> merge | replace | reject | mark_conflicted
```

禁止：

```text
Agent directly updates memory_items.rule_text
Agent directly changes active status
```

## 7. Conflict Handling

冲突不自动解决。系统展示：

```text
existing memory
new candidate
evidence refs
source dates
symbols
applicability
invalidation
```

用户可以选择：

```text
keep both with different applicability
merge
replace old
reject new
mark old deprecated
```

## 8. Active Memory Schema

```text
memory_items
- id
- memory_type
- title
- summary
- rule_text
- applicability
- invalidation
- evidence_refs_json
- symbols_json
- related_symbols_json
- asset_classes_json
- market_scope
- confidence
- status
- version
- valid_from
- valid_until
- last_reviewed_at
- created_at
- updated_at
```

`evidence_refs_json` 使用统一 EvidenceRef，不限于 Markdown section。

## 9. 审计事件

必须记录：

```text
memory_candidate_activated
memory_candidate_rejected
memory_candidate_removed
memory_candidate_merged
memory_conflict_marked
memory_update_candidate_created
memory_item_deprecated
```

## 10. 验收标准

- Candidate 可以单条和批量确认。
- Candidate 可以单条和批量拒绝。
- Active memory 必须有 evidence refs。
- Agent 不能静默修改 active memory。
- 冲突候选不会自动覆盖旧 memory。
- 所有状态变化写入 audit。
