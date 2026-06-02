# 03 — Image and Chat Source Handling

## 1. 模块目标

Image and Chat Source Handling 负责把图片、原始聊天记录、聊天总结和展示资产区分开，避免把所有文件都当成同等语料。

第一版重点是 catalog 和关联，不急于 OCR、caption 或图像理解。

## 2. 数据分层

| 数据 | 角色 | 第一版处理 |
|---|---|---|
| `docs/summaries/**/*.md` | 主语料 | Markdown heading chunk + FTS5 |
| 原始聊天 JSONL | 原始语料 | catalog，后续解析 |
| `docs/assets/chat-images` | 辅助证据 | image catalog，后续 OCR/caption |
| `docs/assets/summary-images` | 展示资产 | catalog optional，不进入核心检索 |
| `docs/assets/summary-cards` | 展示资产 | 默认排除 corpus |
| 新闻/公告归档 | 外部事件源 | catalog，只有提炼规律后进入 candidate |

## 3. 非目标

- 不在第一版实现完整 OCR。
- 不把图片二进制写入 SQLite。
- 不把 summary card 当作金融证据。
- 不把聊天截图直接变成 active memory。
- 不把原始聊天流水全量塞进模型上下文。

## 4. Image Schema

```text
image_artifacts
- artifact_id: TEXT
- width: INTEGER
- height: INTEGER
- perceptual_hash: TEXT
- related_artifact_id: TEXT
- ocr_text: TEXT
- caption: TEXT
- extracted_at: TEXT
- metadata_json: TEXT
```

`related_artifact_id` 用于关联某张图和某篇 Markdown summary 或原始聊天记录。

## 5. Raw Chat Schema

原始聊天记录进入 catalog 后，后续可以解析为：

```text
raw_chat_messages
- id
- artifact_id
- message_id
- sender
- sent_at
- text
- image_refs_json
- reply_to
- metadata_json
```

第一版可以只设计 schema，不必立即实现全量导入。

## 6. 处理策略

### 6.1 Markdown summaries

这是当前最可靠的主语料。优先对 summaries 做 heading chunk 和 FTS5。

### 6.2 Chat images

第一版只做：

```text
path
hash
byte_size
mime_type
directory_date
related_markdown_guess
```

后续 OCR/caption 触发条件：

- 图片成为某个 memory candidate 的关键证据。
- 图片中包含行情、聊天原文或截图证据。
- 用户在 cockpit 中打开图片并标记为有价值。

### 6.3 Summary images/cards

这些更像展示资产，不是核心语料。默认不进入 FTS5，不生成 memory candidate。

### 6.4 News and filings

外部新闻和公告不是长期 memory。它们先作为 source/event 存在，只有被总结成可复用规律时，才生成 memory candidate。

## 7. 实现步骤

1. 扫描 image artifacts。
2. 提取基础 metadata。
3. 尝试按日期和文件名关联 Markdown summary。
4. 写入 image catalog。
5. 对 raw chat JSONL 只登记 artifact。
6. 后续按需解析 raw chat messages。

## 8. 失败模式

| Failure | 处理 |
|---|---|
| 图片无法打开 | catalog 保留，metadata 标记 failed |
| 图片重复 | perceptual_hash 识别近似重复 |
| 无法关联 summary | related_artifact_id 为空 |
| OCR 误识别 | OCR 结果只作为辅助，不直接生成 active memory |

## 9. 验收标准

- chat image 文件能进入 image catalog。
- 图片不以 blob 形式进入 SQLite。
- summary cards 默认不进入核心检索。
- raw chat 可以登记为 source artifact。
- 外部新闻和公告不会直接成为 active memory。
