# 02 — Markdown Chunking and FTS5

## 1. 模块目标

Markdown Chunking and FTS5 负责把 Markdown 原文按 heading 切成可检索、可引用、可重建的 document sections，并用 SQLite FTS5 建立本地全文索引。

第一版优先 heading chunk，而不是固定 token chunk。原因是 `docs/summaries` 已经具有强结构：

```text
三句话总结
核心结论
市场状态判断
核心理论
证据链
交易框架拆解
入场条件
退出条件
风控规则
观察信号
失效条件
```

这些 heading 本身就是金融语义边界。

## 2. 非目标

- 不做 embedding。
- 不接入向量数据库。
- 不要求 LLM 参与切块。
- 不把整篇 Markdown 作为唯一检索单元。
- 不从 chunk 直接生成 active memory。

## 3. 输入

来自 `source_artifacts`：

```text
source_type in ('markdown', 'generated_summary', 'prd', 'engineering_doc')
index_status in ('pending', 'stale')
```

`prd` 和 `engineering_doc` 可以被切块和索引用于人工检索，但默认不得进入 memory candidate extraction，除非用户显式指定。

## 4. 输出

```text
document_sections
document_sections_fts
```

## 5. Schema

```text
document_sections
- id: TEXT
- artifact_id: TEXT
- section_key: TEXT
- text_digest: TEXT
- section_index: INTEGER
- heading_path: TEXT
- section_type: TEXT
- text: TEXT
- start_line: INTEGER
- end_line: INTEGER
- source_date: TEXT
- symbols_json: TEXT
- tags_json: TEXT
- speaker_refs_json: TEXT
- metadata_json: TEXT
- created_at: TEXT
- updated_at: TEXT
```

FTS5：

```text
document_sections_fts
- section_id
- title
- heading_path
- text
- symbols
- tags
- speaker_refs
```

## 6. 切块规则

### 6.1 基础规则

- 按 Markdown ATX heading 切块：`#` 到 `######`。
- 每个 section 保留完整 `heading_path`。
- section 文本包含 heading 下方到下一个同级或更高级 heading 前的内容。
- 保留 `start_line` 和 `end_line`，用于引用原文。
- 生成稳定 `section_key`，推荐由 `artifact_path + heading_path + section_index` 生成。
- 生成 `text_digest`，用于 rebuild 后判断证据文本是否发生实质变化。

### 6.2 过大 section

如果 section 超过配置阈值，例如 3000-5000 中文字符，可以二次切分：

```text
heading_path + paragraph group
```

二次切分必须保留父 heading path，不允许切断表格行。

### 6.3 表格

Markdown 表格必须作为完整块保留。交易标的表、管理员重点标的表、风险观察表不能按行随意切断。

### 6.4 整篇缓存

可以在 artifact 层保留 full text cache，但它不是默认检索和证据引用单元。

## 7. Metadata 提取

第一版用轻量规则提取：

```text
symbols: SPY, QQQ, TSLA, NVDA, COIN, BTC, IREN, CIFR 等 ticker
tags: heading name、summary_type、market_session、已知理论关键词
speaker_refs: 赵哥、xiaozhaolucky、管理员、普通用户
source_date: 从文件名或正文时间解析
```

理论关键词示例：

```text
节日被动减持
财报前减持
财报跌捡漏
缺口回补
BTC预警
币股联动
期权日
多空双杀
急跌急涨
尾盘低吸
```

## 8. Search Contract

本地检索服务支持：

```text
query
symbols
tags
source_date_from
source_date_to
source_type
speaker_refs
limit
```

返回：

```text
section_id
artifact_id
title
heading_path
snippet
score
source_date
symbols
tags
path
line_range
```

## 9. 实现步骤

1. 读取 stale/pending Markdown artifact。
2. 解析 Markdown heading。
3. 生成 `document_sections`。
4. 提取 symbols/tags/speaker_refs。
5. 写入 FTS5。
6. 更新 artifact index status。
7. 写入 `markdown_sections_indexed` 审计事件。

## 10. 失败模式

| Failure | 处理 |
|---|---|
| Markdown 无 heading | 创建一个 `document` section |
| 单个 section 太大 | paragraph group 二次切分 |
| 表格过大 | 保留完整表格，必要时降级为大 section |
| 中文分词不完美 | 第一版接受 FTS5 基础能力，用 tags/symbols 补充召回 |

## 11. 验收标准

- 一篇 summary Markdown 能切出多个 section。
- section 保留 heading path 和 line range。
- section 保留 `section_key` 和 `text_digest`。
- 能搜索 `节日被动减持`、`BTC预警`、`财报前减持`。
- 检索结果能返回原文路径和 heading。
- 表格不被破坏。
- 没有向量库依赖。
