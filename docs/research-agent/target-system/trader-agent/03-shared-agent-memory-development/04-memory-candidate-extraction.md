# 04 — Memory Candidate Extraction

## 1. 模块目标

Memory Candidate Extraction 负责从 document sections、learning discovery 和人工标记中生成候选金融记忆。

候选记忆不是 active memory。它必须进入管理列表，经人工确认后才能被 Agent 默认使用。

## 2. 非目标

- 不自动写入 active memory。
- 不自动覆盖已有 memory。
- 不把普通新闻事实长期记忆。
- 不从无证据文本生成候选。
- 不把工程开发决策纳入金融 memory。

## 3. Candidate 类型

第一版只保留：

| Type | 描述 | 示例 |
|---|---|---|
| `market_mechanism` | 市场机制或资金行为规律 | 节日前被动减持后节后回流 |
| `trading_rule` | 有触发、等待、失效条件的观察规则 | BTC 波动触发币股延迟反应 |
| `source_pattern_summary` | 从资料中总结出的可复用规律 | 赵哥多次提到财报前涨应减持，财报跌才捡漏 |

## 4. 输入

```text
document_sections
learning_discoveries
user_selected_sections
agent_conversation_nodes
image_artifacts
raw_chat_messages
news_archive
filing_archive
```

## 5. 输出

```text
memory_candidates
memory_sources
memory_events
```

## 6. Candidate Schema

```text
memory_candidates
- id
- candidate_type
- title
- summary
- normalized_rule
- applicability
- trigger_conditions_json
- invalidation_conditions_json
- evidence_refs_json
- symbols_json
- related_symbols_json
- asset_classes_json
- market_scope
- confidence
- candidate_status
- review_flags_json
- created_by
- created_at
- reviewed_at
- review_note
```

## 7. 抽取原则

### 7.1 必须有证据

每个 candidate 必须至少关联一个 EvidenceRef。EvidenceRef 可以指向：

```text
document_section
image_artifact
raw_chat_message
news_archive
filing_archive
```

EvidenceRef 是判别联合。所有类型都包含 common fields：

```text
ref_type
ref_id
artifact_id
artifact_path
artifact_hash
source_date
resolver_status
quote optional
note optional
```

不同 `ref_type` 需要各自字段：

```text
document_section:
- section_key
- text_digest
- heading_path
- line_range

image_artifact:
- perceptual_hash
- related_artifact_id
- ocr_text_digest optional

raw_chat_message:
- message_id
- conversation_id
- message_digest

news_archive / filing_archive:
- archive_id
- source_url optional
- published_at
- content_digest
```

### 7.2 必须可复用

临时判断不进入 candidate，除非它体现可复用规律。

不合格示例：

```text
今天 NVDA 可能先跌后涨。
```

合格示例：

```text
财报后第三天若仍出现杀 call 和量能缩减，需要观察是否出现先反弹再回补缺口的结构。
```

### 7.3 必须可失效

`trading_rule` 类 candidate 应尽量包含：

```text
适用条件
观察条件
触发条件
失效条件
风险提示
```

### 7.4 不直接信任外部事实

新闻、公告、X 内容只作为 source。只有被总结成可复用机制或规则时，才生成 candidate。

## 8. 生成方式

第一版允许三种来源：

### 8.1 Rule-based extraction

基于 heading 和关键词：

```text
核心理论
证据链
交易框架拆解
入场条件
失效条件
风控规则
```

### 8.2 Human marked extraction

用户在 cockpit 中选择 section，手动生成 candidate。

### 8.3 Structured model draft

可选 DeepSeek direct 或 Codex CLI runtime 生成候选草稿，但输出必须符合 schema，并进入人工确认流程。

## 9. 去重与冲突

候选生成时检查：

```text
title similarity
symbols overlap
tags overlap
evidence overlap
normalized_rule similarity
```

发现相似候选时不自动合并，标记为：

```text
review_flags_json: ["possible_duplicate"]
review_flags_json: ["possible_conflict"]
```

## 10. 实现步骤

1. 从 FTS5、用户选择或其他 source 得到 evidence refs。
2. 识别 candidate type。
3. 提取 title、summary、rule、conditions。
4. 写入 `evidence_refs_json`。
5. 检查重复和冲突。
6. 写入 `memory_candidate_created` audit。

## 11. 验收标准

- Candidate 必须有 EvidenceRef。
- Candidate 默认 `candidate_status` 是 `candidate`。
- Agent 不能把 candidate 直接注入上下文。
- 相似候选能写入 `review_flags_json`。
- update candidate 不会覆盖 active memory。
- `prd` 和工程设计资料默认不会进入 candidate extraction。
