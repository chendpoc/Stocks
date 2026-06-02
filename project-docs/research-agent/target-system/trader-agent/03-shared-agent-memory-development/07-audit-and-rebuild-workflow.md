# 07 — Audit and Rebuild Workflow

## 1. 模块目标

Audit and Rebuild Workflow 负责让资料索引和 memory 状态可追踪、可重建、可审计。

它解决两个问题：

1. 文件变化后如何安全重建索引。
2. memory candidate 和 active memory 的变更如何可回放。

## 2. 非目标

- 不做复杂分布式事件总线。
- 不要求 Kafka、Redis Stream 或远程日志服务。
- 不把 JSONL 作为主数据库。
- 不在第一版做多人审计权限。

## 3. 存储

SQLite：

```text
memory_events
artifact_index_events
```

JSONL mirror：

```text
data/trader-agent/audit/memory_events.jsonl
data/trader-agent/audit/artifact_index_events.jsonl
```

SQLite 方便查询，JSONL 方便人工检查、导出、回放。

## 4. 事件类型

以下列表是 canonical event registry，按来源分组（Memory / Pipeline）。Memory 段为 Shared Agent Memory 专用；Pipeline 段为 Phase 1C 管线事件。其他文档不得对同一语义再发明异名事件。

### Memory 事件（`source: memory`）

Artifact events：

```text
artifact_discovered
artifact_indexed
artifact_changed
artifact_excluded
artifact_index_failed
markdown_sections_indexed
image_artifact_cataloged
```

Memory events：

```text
memory_candidate_created
memory_candidate_activated
memory_candidate_rejected
memory_candidate_removed
memory_candidate_merged
memory_update_candidate_created
memory_conflict_marked
memory_item_created
memory_conflict_resolved
memory_item_deprecated
memory_context_selected
```

Rebuild events：

```text
index_rebuild_started
index_rebuild_completed
index_rebuild_failed
fts_rebuild_started
fts_rebuild_completed
```

### Pipeline 事件（Phase 1C — `source: pipeline`）

```text
corpus_import_started
corpus_import_completed
semantic_extraction_completed
market_context_completed
outcome_labeling_completed
playbook_aggregation_completed
runtime_orchestrator_run_started
runtime_orchestrator_run_completed
runtime_orchestrator_symbol_completed
runtime_orchestrator_symbol_failed
signal_persisted
rule_discovery_candidate_created
rule_discovery_lite_backtest_completed
rule_discovery_candidate_advanced
structured_model_call_completed
```

### Pipeline 事件：canonical 名 vs 当前 runtime 写入名

Canonical registry（上表）使用 **underscore** 命名（例如 `runtime_orchestrator_run_started`、`playbook_aggregation_completed`），便于跨模块查询与文档对齐。

Phase 1C 管线代码**尚未**全部切换到 underscore 形式；`runtime_orchestrator`、`playbook`、`semantic_extraction` 等模块仍通过 `record_agent_event()` 写入 **legacy dot-notation** 事件名。审计 SQL / JSONL 查询须按**实际写入值**过滤，勿假设已与 registry 字符串一致。

| Canonical（registry 目标名） | 当前 runtime / 模块写入（legacy） |
|---|---|
| `runtime_orchestrator_run_started` | `runtime_orchestrator.run_started` |
| `runtime_orchestrator_run_completed` | `runtime_orchestrator.run_completed` |
| `runtime_orchestrator_symbol_completed` | `runtime_orchestrator.symbol_completed` |
| `runtime_orchestrator_symbol_failed` | `runtime_orchestrator.symbol_failed` |
| `playbook_aggregation_completed` | `playbook.aggregation.completed` |
| `semantic_extraction_completed` | `semantic_extraction.completed` |
| `market_context_completed` | `market_context.completed` |
| `outcome_labeling_completed` | `outcome_labeling.completed` |
| `signal_persisted` | `signal_persisted`（R2 起已对齐 canonical） |

**Target vs current：** registry 列的是统一目标名；重命名 legacy 事件为 underscore 形式属于后续 pass（非 R0–R2 范围）。在迁移完成前，审计脚本应同时接受 legacy 名，或显式映射上表后再聚合。

## 5. Event Schema

```text
id
event_type
entity_type
entity_id
actor_type: system | user | agent
payload_json
created_at
```

JSONL mirror 每行同样结构。

## 6. Rebuild Workflow

### 6.1 Incremental rebuild

默认增量：

```text
scan files
compare path + hash
mark stale
reindex stale artifacts
rebuild sections for affected artifacts
update FTS rows
write audit events
```

### 6.2 Full rebuild

只在 schema 变化、索引损坏、用户手动触发时执行：

```text
backup current sqlite
clear artifact-derived sections and FTS
keep memory_items and review history
rescan corpus
reindex all artifacts
reconnect memory evidence refs if possible
write rebuild report
```

Full rebuild 不应删除 active memory，只能标记 evidence refs 是否仍可解析。

Evidence resolver 状态：

```text
resolved     # ref_id 或 section_key + text_digest 可解析
stale        # section_key 仍能定位，但 text_digest 已变化
unresolved   # 原证据无法定位
```

Active memory 的 evidence refs 如果变为 `stale` 或 `unresolved`，必须进入 review queue，不得静默继续作为高可信证据使用。

## 7. Hash 与幂等

所有 artifact 使用 content hash 检测变化。

同一 hash 重复扫描不得重复创建 section。

Memory event 使用 event id 保证重复写入可识别。

## 8. Schema Bootstrap

本地 SQLite 启动时走 `bootstrap_database(settings)`：

```text
metadata.create_all()     # 新建缺失表
_apply_schema_column_patches()  # 已有表补列（ALTER TABLE ADD COLUMN）
```

`create_all` 不会修改已存在表的结构。后续 milestone 给已有表加列时，必须在 `_SCHEMA_COLUMN_PATCHES` 注册 `(table, column, type)`，保证旧库升级而不是要求用户删库重建。

触发 schema migration 前建议按 §9 备份 SQLite。

## 9. 备份策略

第一版本地备份：

```text
data/trader-agent/backups/
  trader-agent-memory-YYYYMMDD-HHMMSS.sqlite
  memory-events-YYYYMMDD-HHMMSS.jsonl
```

触发：

- full rebuild 前。
- schema migration 前。
- 用户手动导出。

## 10. 验收标准

- 文件 hash 变化后 artifact 标记 stale。
- 增量 rebuild 只重建变化文件。
- Full rebuild 不删除 active memory。
- Full rebuild 后能报告 stale/unresolved evidence refs。
- JSONL audit 和 SQLite event 一致。
- 可以输出 rebuild report。
- audit 中能追踪某个 memory 从 candidate 到 active 的完整过程。
