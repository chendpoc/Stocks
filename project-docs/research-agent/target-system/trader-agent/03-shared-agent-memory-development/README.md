# Shared Agent Memory Development

版本：`v0.1`

范围：`03-shared-agent-memory-prd.md` 的实施拆解。

本目录只定义 Shared Agent Memory 的开发文档，不直接实现代码。实现时应优先保持本地、轻量、可审计，不引入 SaaS 向量库或重型 Agent 框架。

进入实现前必须先按 [../00-workflow-router.md](../00-workflow-router.md) 选择 workflow。任何 M0-M6 worker prompt 或实现计划都必须通过 `module-spec-quality-gate`，尤其要核对 canonical event registry、路径语义、允许文件、排除文件和验收命令。

## 1. 模块目标

Shared Agent Memory 的目标是把本地资料库转成可检索、可引用、可人工确认、可注入上下文的金融记忆层。

核心链路：

```text
Source Artifact
  -> Artifact Catalog
  -> Markdown Heading Sections
  -> FTS5 Search
  -> Memory Candidate
  -> Human Review
  -> Active Memory
  -> Context Injection
  -> Audit / Rebuild
```

## 2. 非目标

- 不做通用个人记忆系统。
- 不存工程开发偏好和代码协作偏好。
- 不把所有原始资料直接变成 active memory。
- 不让 Agent 自动覆盖 active memory。
- 不接入远程向量数据库。
- 不把图片二进制写入 SQLite。
- 不做自动交易、订单、审批或券商执行。

## 3. 文档索引

| 顺序 | 文档 | 目标 |
|---:|---|---|
| 1 | [01-source-artifact-catalog.md](./01-source-artifact-catalog.md) | 登记 Markdown、图片、聊天记录和资料来源 |
| 2 | [02-markdown-chunking-and-fts5.md](./02-markdown-chunking-and-fts5.md) | 按 Markdown heading 切块并建立 FTS5 |
| 3 | [03-image-and-chat-source-handling.md](./03-image-and-chat-source-handling.md) | 管理图片、原始聊天、总结图和辅助证据 |
| 4 | [04-memory-candidate-extraction.md](./04-memory-candidate-extraction.md) | 从 chunks 和 learning 中生成候选记忆 |
| 5 | [05-memory-review-and-activation.md](./05-memory-review-and-activation.md) | 设计 candidate 管理、确认、拒绝、合并、冲突 |
| 6 | [06-context-injection-policy.md](./06-context-injection-policy.md) | 定义 Agent 如何选择 active memory 注入上下文 |
| 7 | [07-audit-and-rebuild-workflow.md](./07-audit-and-rebuild-workflow.md) | 定义 JSONL 审计、hash 检测、索引重建和回放 |

已完成的 M0-M6 实施计划已归档到 `project-docs/archive/shared-agent-memory/plans/`。本目录保留当前设计入口和模块说明。

## 4. 实现顺序

推荐顺序：

```text
Phase M0: Artifact Catalog
Phase M1: Markdown Section Index + FTS5
Phase M2: Local Corpus Search API
Phase M3: Memory Candidate Schema + Extraction
Phase M4: Candidate Review UI Contract
Phase M5: Active Memory Context Injection
Phase M6: Audit + Rebuild
```

M0-M2 先解决资料检索。M3-M5 再解决长期记忆。不要在资料索引还没有稳定前实现复杂 memory UI。

当前执行状态（2026-05-29）：

| Phase | 状态 | 实施计划 |
|---|---|---|
| M0 Artifact Catalog | done | [plans/00-m0-artifact-catalog.md](./plans/00-m0-artifact-catalog.md) |
| M1 Markdown Section Index + FTS5 | done | [plans/01-m1-markdown-section-index.md](./plans/01-m1-markdown-section-index.md) |
| M2 Local Corpus Search API | done | [plans/02-m2-corpus-search-api.md](./plans/02-m2-corpus-search-api.md) |
| M3 Memory Candidate Schema + Extraction | done | [plans/03-m3-memory-candidate.md](./plans/03-m3-memory-candidate.md) |
| M4 Candidate Review + Active Memory | done | [plans/04-m4-review-activation.md](./plans/04-m4-review-activation.md) |
| M5 Active Memory Context Injection | done | [plans/05-m5-context-injection.md](./plans/05-m5-context-injection.md) |
| M6 Audit + Rebuild | done | [plans/06-m6-audit-rebuild.md](./plans/06-m6-audit-rebuild.md) |

**M4 主流程（Path B）：** 对话文本 → `extract-preview` → 人工确认 → `POST /memory-items`（冲突时 409 + `confirm: true` 重试，或 `resolve-conflict`）。M3 候选 API（批量 section 扫描 → activate）保留为备用，不作 M4 主流程验收标准。

**M5 上下文注入：** Agent 调用 `select_context()` 或 `POST /select-context`，按 task_type/symbols/tags 评分选取 active memory（预算 5 条 / 3000 字符），API 路径写 `memory_context_selected` 审计事件。

**Schema 升级：** `bootstrap_database` 在 `create_all` 之后对已有表执行 `ALTER TABLE ADD COLUMN`（见 [07-audit-and-rebuild-workflow.md §8](./07-audit-and-rebuild-workflow.md)），旧库无需删库重建。

每个阶段进入代码前必须产出：

- source-of-truth links
- confirmed decisions
- allowed / forbidden files
- event names from the canonical registry
- acceptance-to-verification map
- self-contained worker prompt

如果 `apps/trader-agent/backend` 已存在 local knowledge、FTS5、`/api/knowledge/*` 或类似实现，本目录任务不是 greenfield 重写，而是 reconciliation：

```text
现有能力盘点
  -> 保留可用 index/search contract
  -> 补 artifact catalog 和稳定 EvidenceRef
  -> 补 candidate review / active memory / context injection audit
```

## 5. 共享数据边界

| 数据 | Source of Truth | Query Layer | Audit |
|---|---|---|---|
| Markdown 原文 | 文件系统 | SQLite catalog + sections | index events |
| 图片原文件 | 文件系统 | image catalog | index events |
| Document sections | SQLite | FTS5 | rebuild events |
| Memory candidates | SQLite | candidate table/filter | memory events JSONL |
| Active memory | SQLite | memory context selector | memory events JSONL |
| Audit events | SQLite + JSONL mirror | SQLite | JSONL append-only |

PRD、旧路线文档和工程设计文档可以进入 artifact catalog 方便人工检索，但默认 `memory_eligible = false`。第一版 candidate extraction 只面向金融业务语料和 learning 结果。

## 6. 与其他层关系

### 6.1 Agent Core

Agent Core 使用本模块：

- 搜索赵哥语料。
- 查找相似市场规律。
- 生成 rule candidate。
- 为 signal explanation 提供记忆引用。
- 选择 active memory 注入结构化模型调用。

### 6.2 Workflow / CLI

Workflow / CLI 使用本模块：

- CLI memory review 命令管理 candidate 和 active memory。
- Workflow learning 结果生成 candidate。
- CLI/TUI answer trace 展示回答使用了哪些 memory。

### 6.3 Shared Platform

本模块属于 Shared Platform 的本地资料库和记忆子系统。它不替代 `03-shared-platform-roadmap-prd.md`，而是把其中存储、检索和审计能力具体化。

## 7. 验收标准

- 所有原始资料都有 artifact catalog。
- Markdown section 可以按 heading path 定位。
- FTS5 能搜索标题、section 文本、symbol、tags。
- Candidate 必须引用 EvidenceRef。
- Evidence 使用统一 `EvidenceRef`，可指向 document section、image artifact、raw chat message、news/archive 或 filing/archive。
- Active memory 必须经过人工确认。
- update candidate 不会静默覆盖 active memory。
- JSONL audit 可重放关键 memory 操作。
- 文档明确第一版不依赖远程向量库。
