# 03A — Shared Agent Memory PRD

版本：`v0.1`

状态：目标系统补充 PRD

文档定位：定义 trader-agent 的本地资料库索引、候选记忆、长期金融记忆、上下文注入和审计重建机制。

上游依据：

- [00-system-overview.md](./00-system-overview.md)
- [01-agent-core-backend-prd.md](./01-agent-core-backend-prd.md)
- [02-web-agent-cockpit-prd.md](./02-web-agent-cockpit-prd.md)
- [03-shared-platform-roadmap-prd.md](./03-shared-platform-roadmap-prd.md)

并行边界参考：

- [04-ai-rag-mcp-platform-roadmap-prd.md](./04-ai-rag-mcp-platform-roadmap-prd.md)：用于确认 AI/RAG/MCP 不应提前变重，不作为本 PRD 的前置实现依赖。

## 1. 结论

Shared Agent Memory 不是通用多 Agent 记忆系统，也不是把所有聊天记录直接塞进模型上下文。它是 trader-agent 项目内的金融知识沉淀层，负责把本地 Markdown、图片、聊天记录和市场学习结果转成可检索、可引用、可人工确认的长期金融记忆。

第一版采用轻量本地方案：

```text
文件系统保存原始资料
SQLite 保存 catalog / chunks / memory 状态
SQLite FTS5 保存本地全文索引
JSONL 保存 append-only 审计流水
```

不在第一版引入 Pinecone、Milvus、Qdrant、LlamaIndex、LangChain Memory、远程 SaaS 文档库或通用向量数据库。

## 2. 第一性原理

Agent 需要的不是“能存很多东西”的数据库，而是四类能力：

1. 找得到：能从大量历史总结中找到相关片段。
2. 引得出：回答和规则必须能引用具体来源。
3. 管得住：候选记忆必须人工确认、拒绝、合并或废弃。
4. 用得准：只把与当前问题、页面、标的、市场状态相关的记忆注入 Agent 上下文。

因此本系统必须区分四层数据：

```text
Corpus      = 原始资料库，包含 Markdown、图片、原始聊天记录、公告和新闻归档。
Index       = 可检索索引，包含 artifact catalog、Markdown heading chunks、FTS5。
Memory      = 经提炼和人工确认的长期金融规律。
Audit       = 记忆候选、确认、拒绝、合并、更新、重建的事件流水。
```

## 3. 当前资料库形态

现有 `docs/` 目录已经是一个本地资料库，而不是普通项目说明目录。

主要数据形态：

```text
docs/summaries/**/*.md                # 主语料：赵哥群聊总结、每日总结、盘前/盘中/盘后总结
docs/assets/chat-images/**/*.{png,jpg} # 聊天截图、市场截图、辅助证据
docs/opportunities/**/*.md            # 机会观察
docs/trading-experiences/**/*.md      # 交易经验
project-docs/research-agent/**/*.md           # 系统设计与旧路线资料
docs/search_index.json                # 现有轻量搜索索引雏形
```

处理原则：

- `docs/summaries/**/*.md` 是第一知识源。
- Markdown 原文保留在文件系统，SQLite 只存 catalog、hash、heading chunks 和索引状态。
- 图片原文件保留在文件系统，SQLite 只存路径、hash、尺寸、OCR/caption 结果和关联关系。
- `.vitepress/cache`、`.vitepress/dist` 等构建产物不进入 Agent corpus。
- `project-docs/research-agent/modules/` 是历史资料，可作为迁移素材，不作为目标系统权威路线。
- `project-docs/research-agent/**/*.md` 可以进入 artifact catalog 供人工检索，但默认 `memory_eligible = false`，不得自动生成金融 memory candidate。

## 3.1 与既有 Phase 1.7 Local Knowledge 的关系

本 PRD 不是 greenfield 重写计划。`01-agent-core-implementation-plan.md` 中已经存在 local knowledge / FTS5 / `/api/knowledge/*` 方向的实现线索或阶段记录。

开发本模块时必须先做 reconciliation：

```text
1. 盘点现有 knowledge registry / document indexer / local search / API。
2. 保留可复用的 SQLite FTS5、search API、fixtures 和测试。
3. 只补齐本 PRD 缺失的 artifact catalog、稳定 evidence ref、candidate review、context injection audit。
4. 不重复建设另一套并行知识库。
```

## 4. 范围

### 4.1 In Scope

- 本地 source artifact catalog。
- Markdown 按 heading 切块。
- SQLite FTS5 本地全文检索。
- 图片和聊天记录的轻量 catalog。
- 从资料片段和 learning 结果中生成 `MemoryCandidate`。
- `/cockpit/settings/memory` 中的候选记忆管理。
- `/cockpit/learning` 与 memory candidate 的连接。
- active memory 的上下文注入策略。
- JSONL 审计与索引重建流程。

### 4.2 Out of Scope

- 不做通用个人记忆系统。
- 不存工程开发偏好、代码协作偏好或项目架构决策；这些仍由 PRD、真实存在或会话注入的项目规则、开发文档管理。
- 不把所有原始 Markdown 或图片直接作为 active memory。
- 不把外部新闻、公告、X 内容直接长期记忆；只有被总结成可复用规律时才生成 candidate。
- 不自动覆盖 active memory。
- 不引入远程向量数据库。
- 不把图片二进制写入 SQLite。
- 不做多用户权限系统。
- 不让 memory 直接触发交易执行。

## 5. 核心概念

### 5.1 Source Artifact

资料库中的一个原始对象，例如一篇 Markdown 总结、一张聊天截图、一份原始聊天 JSONL、一篇公告归档。

### 5.2 Document Section

从 Markdown 中按 heading 切出的语义片段。例如：

```text
2026-05-23 每日总结 > 核心理论
2026-05-23 每日总结 > 交易框架拆解 > 入场条件
2026-05-23 每日总结 > 交易框架拆解 > 失效条件
```

Document Section 是检索和证据引用的最小默认单元。

### 5.3 Memory Candidate

Agent 或用户从资料片段中提炼出的候选长期记忆。它尚未进入 active memory，必须人工确认。

第一版只保留三类：

| Type | 含义 |
|---|---|
| `market_mechanism` | 市场机制、资金行为、结构性规律 |
| `trading_rule` | 可观察、可触发、可失效的交易规则或机会规则 |
| `source_pattern_summary` | 从赵哥语料、复盘或新闻中总结出的可复用规律摘要 |

### 5.4 Active Memory

人工确认后的长期金融记忆。Active Memory 可以被 Agent 在回答、解释、信号推演和规则候选中引用。

### 5.5 Learning

Learning 是市场学习和后验验证视图。Learning 可以生成 Memory Candidate，但 Learning 本身不等于 active memory。

关系：

```text
Corpus Section
  -> Learning Discovery
  -> Memory Candidate
  -> Human Review
  -> Active Memory
```

## 6. 存储架构

### 6.1 文件系统

保留所有原始文件：

```text
docs/
data/trader-agent/raw/
data/trader-agent/imports/
```

文件系统是原始资料 source of truth。SQLite 不承担原始 Markdown 和图片的唯一存储职责。

### 6.2 SQLite

SQLite 是第一版 queryable state 的 source of truth：

```text
source_artifacts
document_sections
document_sections_fts
image_artifacts
memory_candidates
memory_items
memory_sources
memory_versions
memory_events
```

SQLite 足以支撑当前个人项目规模和未来较长一段时间的本地资料库管理。只有当文档规模、并发访问、语义召回质量或跨服务部署明确成为瓶颈时，才考虑向量库或 PostgreSQL。

### 6.3 SQLite FTS5

FTS5 用于本地关键词全文检索：

```text
title
heading_path
section_text
symbols
tags
speaker_refs
```

第一版优先关键词检索，因为金融语料中的 ticker、日期、价格、百分比、规则名、事件名高度结构化。

### 6.4 JSONL Audit

JSONL 是 append-only 审计和回放材料，不是主数据库：

```text
data/trader-agent/audit/memory_events.jsonl
```

Canonical event registry：

```text
artifact_discovered
artifact_indexed
artifact_changed
artifact_excluded
artifact_index_failed
markdown_sections_indexed
image_artifact_cataloged
index_rebuild_started
index_rebuild_completed
index_rebuild_failed
fts_rebuild_started
fts_rebuild_completed
memory_candidate_created
memory_candidate_rejected
memory_candidate_activated
memory_candidate_removed
memory_candidate_merged
memory_update_candidate_created
memory_conflict_marked
memory_item_created
memory_conflict_resolved
memory_item_deprecated
memory_context_selected
```

所有 development 文档必须使用这张事件表，不得自行引入同义事件名。

## 7. 逻辑数据模型

### 7.1 source_artifacts

```text
id
source_type: markdown | image | raw_chat | generated_summary | news_archive | filing_archive | prd | engineering_doc
path
content_hash
title
source_date
market_session
mime_type
byte_size
memory_eligible
memory_eligible_reason
indexed_at
excluded_reason
metadata_json
```

### 7.2 document_sections

```text
id
artifact_id
section_key
text_digest
section_index
heading_path
section_type
text
start_line
end_line
source_date
symbols_json
tags_json
speaker_refs_json
metadata_json
```

### 7.3 image_artifacts

```text
artifact_id
width
height
perceptual_hash
related_artifact_id
ocr_text
caption
extracted_at
metadata_json
```

### 7.4 EvidenceRef

所有 candidate 和 active memory 都使用统一证据引用，不直接绑定单一 Markdown section id 字段。

```text
Common fields:
- ref_type: document_section | image_artifact | raw_chat_message | news_archive | filing_archive
- ref_id
- artifact_id
- artifact_path
- artifact_hash
- source_date
- resolver_status: resolved | stale | unresolved
- quote
- note
```

Per-source fields:

```text
document_section:
- section_key
- text_digest
- heading_path
- line_range

image_artifact:
- perceptual_hash
- related_artifact_id
- ocr_text_digest

raw_chat_message:
- message_id
- conversation_id
- message_digest

news_archive:
- archive_id
- source_url
- published_at
- content_digest

filing_archive:
- archive_id
- source_url
- published_at
- content_digest
```

`section_key` 和 `text_digest` 只对 `document_section` 必填。其他证据类型使用各自的 digest 或 hash 字段。Full rebuild 后如果找不到原证据，EvidenceRef 必须标记 `unresolved`，不能静默丢失。

### 7.5 memory_candidates

```text
id
candidate_type
title
summary
normalized_rule
applicability
trigger_conditions_json
invalidation_conditions_json
evidence_refs_json
symbols_json
related_symbols_json
asset_classes_json
tags_json
market_scope
confidence
candidate_status: candidate | activated | rejected | removed | merged | conflicted
review_flags_json
created_by: agent | user | learning_review
created_at
reviewed_at
review_note
```

`review_flags_json` 可以包含：

```text
possible_duplicate
possible_conflict
needs_more_evidence
low_confidence
```

### 7.6 memory_items

```text
id
memory_type
title
summary
rule_text
applicability
invalidation
evidence_refs_json
symbols_json
related_symbols_json
asset_classes_json
market_scope
confidence
status: active | conflicted | deprecated
version
valid_from
valid_until
last_reviewed_at
created_at
updated_at
```

## 8. UI 入口

### 8.1 `/cockpit/settings/memory`

管理通用 shared memory：

```text
Candidates
Active
Conflicted
Deprecated
Rejected
```

Candidate table 支持：

- 单条确认。
- 批量确认。
- 批量拒绝。
- 移除候选。
- 合并到已有 active memory。
- 标记冲突。
- 查看来源 section。
- 查看将如何影响 Agent 上下文注入。

### 8.2 `/cockpit/learning`

管理市场学习和后验验证：

- Plan vs Outcome。
- 命中/失败分析。
- 新规律发现。
- Learning Discovery 生成 Memory Candidate。

### 8.3 `/cockpit/agent`

Agent 对话和活动视图只展示当前回答使用了哪些 memory，不在第一版承担完整 memory 编辑。

## 9. 上下文注入策略

第一版采用混合方案：

```text
当前任务类型
当前页面
当前 symbol / related_symbols
market_scope
asset_class
tags
confidence
last_reviewed_at
status
```

Agent 只能注入 `active` memory。低置信度、冲突、废弃 memory 不进入默认上下文，除非用户明确要求查看争议历史。

所有影响分析结论的 memory 必须可引用来源。

每次注入必须可审计：

```text
selector_version
run_id
model_call_id
selected_memory_ids
selected_reasons_json
excluded_reasons_json
injected_context_hash
created_at
```

## 10. 状态与更新规则

Canonical lifecycle：

| Entity | Status | 含义 |
|---|---|---|
| memory candidate | `candidate` | 待人工处理 |
| memory candidate | `activated` | 已生成 active memory |
| memory candidate | `rejected` | 明确拒绝 |
| memory candidate | `removed` | 从候选列表软移除，保留审计 |
| memory candidate | `merged` | 已合并到其他 candidate 或 memory |
| memory candidate | `conflicted` | 与既有 memory 冲突，待处理 |
| memory item | `active` | 可注入上下文 |
| memory item | `conflicted` | 有冲突，不默认注入 |
| memory item | `deprecated` | 已过期或被替代，不默认注入 |

Agent 不允许静默覆盖 active memory。更新只能走：

```text
active memory
  -> update_candidate
  -> human review
  -> merge | replace | reject | mark_conflicted
```

冲突不自动解决。系统保留两边证据，并要求人工判断适用条件。

## 11. API 与服务边界

第一版可以先作为 Agent Core 内部 service，不要求立即开放完整 REST API。

推荐 service contract：

```text
SourceArtifactCatalog.index_path(path)
DocumentIndexer.index_artifact(artifact_id)
LocalCorpusSearch.search(query, filters)
MemoryCandidateService.create_from_sections(section_ids, payload)
MemoryCandidateService.create_from_evidence(evidence_refs, payload)
MemoryReviewService.activate(candidate_id)
MemoryReviewService.reject(candidate_id)
MemoryReviewService.merge(candidate_ids, target_memory_id)
MemoryContextService.select_context(task, page, symbols, tags)
MemoryAuditService.record(event)
```

后续 Cockpit 接入时再补 REST API。

## 12. 验收标准

第一版文档和实现必须满足：

1. 原始 Markdown 和图片不被复制成唯一数据库 blob。
2. SQLite catalog 可以识别文件 path、hash、类型和索引状态。
3. Markdown 可以按 heading 切成可检索 section。
4. FTS5 可以检索 section 文本、标题、symbol 和 tags。
5. Memory Candidate 必须关联 `EvidenceRef`，且至少一个 evidence 可解析。
6. Candidate 只能人工确认后进入 active memory。
7. Agent 不能静默更新或覆盖 active memory。
8. `/cockpit/settings/memory` 是 memory 管理入口。
9. `/cockpit/learning` 是市场 learning 管理入口。
10. JSONL audit 可以追踪 candidate 创建、确认、拒绝、合并、废弃和重建事件。
11. PRD / 工程文档默认 `memory_eligible = false`，不会自动生成金融 memory candidate。

## 13. 风险

| Risk | Mitigation |
|---|---|
| 把资料库和长期记忆混为一谈 | 文档和 schema 强制区分 Corpus、Index、Candidate、Active Memory |
| FTS5 召回不足 | 第一版用 tags/symbol/date 过滤增强；向量检索进入后续扩展 |
| Agent 过度记忆临时市场判断 | 所有候选必须人工确认；临时新闻默认只进 source/event |
| 图片证据无法检索 | 第一版 catalog，后续补 OCR/caption |
| Memory 污染交易判断 | 只注入 active 且相关的 memory，并显示引用来源 |

## 14. 后续升级触发条件

只有满足以下条件，才考虑上向量检索或外部存储：

1. FTS5 + tags/symbol/date 无法满足常见召回。
2. 文档规模达到 SQLite 管理明显吃力的级别。
3. 需要跨机器、多用户、多人协作访问。
4. 图片和原始聊天 OCR 结果成为主要证据来源。
5. 需要大规模语义近似检索和 rerank。
