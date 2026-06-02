# 01 — Source Artifact Catalog

## 1. 模块目标

Source Artifact Catalog 负责登记本地资料库中的原始对象，并为后续 Markdown 切块、图片处理、memory candidate 抽取和审计重建提供稳定入口。

它回答三个问题：

1. 这个资料是什么。
2. 它在文件系统哪里。
3. 它当前是否已经被索引，索引是否过期。

## 2. 非目标

- 不解析 Markdown 内容。
- 不做 memory 抽取。
- 不做图片 OCR。
- 不把文件内容直接作为 active memory。
- 不把 `.vitepress/cache` 或 `.vitepress/dist` 构建产物纳入 corpus。

## 3. 输入

默认扫描范围：

```text
docs/summaries/**/*.md
docs/opportunities/**/*.md
docs/trading-experiences/**/*.md
docs/assets/chat-images/**/*.{png,jpg}
data/trader-agent/raw/**/*.jsonl
data/trader-agent/imports/**/*
```

显式排除：

```text
docs/.vitepress/cache/**
docs/.vitepress/dist/**
node_modules/**
.next/**
```

## 4. 输出

写入 SQLite：

```text
source_artifacts
```

并写入审计事件：

```text
artifact_discovered
artifact_indexed
artifact_changed
artifact_excluded
artifact_index_failed
```

完整事件名以 [07-audit-and-rebuild-workflow.md](./07-audit-and-rebuild-workflow.md) 的 canonical registry 为准。

## 5. Schema

```text
source_artifacts
- id: TEXT
- source_type: TEXT
- path: TEXT
- content_hash: TEXT
- title: TEXT
- source_date: TEXT
- market_session: TEXT
- mime_type: TEXT
- byte_size: INTEGER
- indexed_at: TEXT
- index_status: pending | indexed | stale | excluded | failed
- memory_eligible: INTEGER
- memory_eligible_reason: TEXT
- excluded_reason: TEXT
- metadata_json: TEXT
- created_at: TEXT
- updated_at: TEXT
```

`source_type` 第一版取值：

```text
markdown
image
raw_chat
generated_summary
news_archive
filing_archive
prd
engineering_doc
```

## 6. 识别规则

### 6.1 Markdown

根据路径和文件名推断：

| 路径 | source_type | metadata |
|---|---|---|
| `docs/summaries/**/*.md` | `generated_summary` | date、month、summary_type |
| `docs/opportunities/**/*.md` | `markdown` | opportunity |
| `docs/trading-experiences/**/*.md` | `markdown` | trading_experience |
| `project-docs/research-agent/target-system/**/*.md` | `prd` | target_system |
| `project-docs/research-agent/**/*.md` | `engineering_doc` | historical_design_or_implementation_doc |

默认 eligibility：

| source_type | memory_eligible | 原因 |
|---|---:|---|
| `generated_summary` | 1 | 主金融语料 |
| `markdown` under opportunities / trading-experiences | 1 | 金融机会和交易经验 |
| `raw_chat` | 1 | 原始金融语料，需解析后使用 |
| `news_archive` / `filing_archive` | 0 | 只作为 source/event；总结成规律后才可生成 candidate |
| `prd` | 0 | 工程和系统设计资料，不自动生成金融 memory |
| `engineering_doc` | 0 | 旧模块、设计文档和执行队列，不自动生成金融 memory |

只有以下路径默认允许进入金融 memory candidate extraction：

```text
docs/summaries/**/*.md
docs/opportunities/**/*.md
docs/trading-experiences/**/*.md
data/trader-agent/raw/**/*.jsonl
```

### 6.2 图片

只登记图片元数据，不读取为 blob：

```text
path
hash
byte_size
mime_type
directory_date
```

后续 `03-image-and-chat-source-handling.md` 决定是否补 OCR/caption。

### 6.3 JSONL

原始聊天、新闻、公告可以先登记为 artifact，不要求第一版全部解析。

## 7. 实现步骤

1. 枚举允许目录。
2. 过滤排除目录。
3. 计算文件 hash。
4. 识别 source_type。
5. 解析 title、source_date、market_session。
6. 计算 `memory_eligible` 和 `memory_eligible_reason`。
7. upsert `source_artifacts`。
8. 如果 hash 变化，标记 `index_status = stale`。
9. 写入审计事件。

## 8. 失败模式

| Failure | 处理 |
|---|---|
| 文件无法读取 | 标记 `failed`，记录错误 |
| 文件名日期无法解析 | source_date 为空，但不阻断 catalog |
| 重复文件 | 通过 hash 和 path 同时识别，不自动删除 |
| 构建产物误入 | `excluded` 并记录 excluded_reason |

## 9. 验收标准

- 可以扫描 `docs/summaries` 并登记 Markdown。
- 可以扫描 `docs/assets/chat-images` 并登记图片。
- 不登记 `.vitepress/cache` 和 `.vitepress/dist`。
- 同一文件内容变化后可以标记 `stale`。
- catalog 结果包含 path、hash、type、size、status。
- PRD 和工程文档默认 `memory_eligible = false`。
- 所有 catalog 操作写入 audit。

## 10. 测试场景

- 新增一篇 Markdown 后出现 `pending` artifact。
- 修改 Markdown 后 artifact 变为 `stale`。
- 删除文件后 catalog 标记为 missing 或保留最后状态。
- 图片只存路径和 hash，不写 blob。
- `.vitepress/dist` 文件不进入 catalog。
