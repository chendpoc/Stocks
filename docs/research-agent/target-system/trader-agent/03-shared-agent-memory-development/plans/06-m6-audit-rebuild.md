# 06 — Shared Agent Memory M6: Audit + Rebuild

Status: done
Owner: codex
Created: 2026-05-29
Confirmed: 2026-05-29 (all 5 decisions resolved)

## Specification Gate Check

- [x] Source checked — PRD ✓, dev doc 07-audit-and-rebuild-workflow.md ✓, 现有 events.py/migrations.py ✓
- [x] Decisions frozen — 5 条用户确认 + 4 条技术推导
- [x] Scope bounded — allowed/forbidden files 已列出
- [x] Verification mapped — 见测试表
- [x] Prompt self-contained — worker prompt 独立文件
- [x] Behavior preserved — 不适用（greenfield）

## Pre-plan Decision Inventory

| # | 决策 | 结论 |
|---|---|---|
| 1 | Backup | `POST /api/knowledge/backup` 手动触发。sqlite → `backups/trader-agent-memory-{timestamp}.sqlite` |
| 2 | Full rebuild | 不做。数据库损坏→删掉让 `bootstrap_database` 重建 |
| 3 | Evidence revalidation | 做。rebuild 后扫描 memory_items 的 evidence refs，标记 resolved/stale/unresolved，生成 report |
| 4 | 增量 rebuild | `POST /api/knowledge/incremental-rebuild` 串联 M0 stale→M1 reindex |
| 5 | 局部 rebuild | `POST /api/knowledge/rebuild-artifacts` 指定 artifact_ids，只重建这几条 |

## 1. 目标

M6 完成 Shared Agent Memory 的审计与重建层：

1. Backup — 手动备份 SQLite 到本地
2. Incremental rebuild — 串联 M0 stale detection + M1 section reindex
3. 局部 rebuild — 指定 artifact_ids 精准重建
4. Evidence revalidation — 扫描 memory_items 的 evidence refs，报告 stale/unresolved

不做 full rebuild。数据库损毁场景由 `bootstrap_database` + 重新运行 catalog/index 覆盖。

## 2. 非目标

- 不做 full rebuild（clear-all + rescan 模式）
- 不做自动备份（手动触发）
- 不修改 `record_agent_event()` 或 JSONL mirror
- 不新增数据表
- 不修改 Web Cockpit 前端

## 3. Context Pack

### 已存在

```
events.py:
  record_agent_event() — SQLite + 可选 JSONL mirror (enable_event_jsonl_mirror)
  JSONL path: data/trader-agent/audit/agent_events.jsonl

migrations.py:
  bootstrap_database() — metadata.create_all() + _SCHEMA_COLUMN_PATCHES
  _SCHEMA_COLUMN_PATCHES — ALTER TABLE ADD COLUMN for existing tables
  bootstrap_data_dirs() — creates data/, data/raw, data/fixtures, data/audit

artifact_catalog.py (M0):
  build_artifact_catalog(settings) — scans files → source_artifacts
  Detects hash change → marks index_status=stale

markdown_section_indexer.py (M1):
  index_markdown_sections(settings) — reads pending/stale → creates document_sections
  Updates source_artifacts.index_status → indexed/failed

evidence_ref.py (M3):
  EvidenceRef.resolve(engine) — checks if ref is resolved/stale/unresolved

memory_items (M4): id, evidence_refs_json, status
memory_candidates (M3): id, evidence_refs_json

Current gap: M0 stale + M1 reindex are two separate API calls.
Current gap: No backup endpoint.
Current gap: No evidence revalidation after rebuild.
```

### 现有端点

```
POST /api/knowledge/scan-artifacts  → build_artifact_catalog()       (M0)
POST /api/knowledge/reindex         → index_local_knowledge()        (OLD — calls document_indexer!)
POST /api/knowledge/incremental-rebuild — NOT YET EXISTS
POST /api/knowledge/rebuild-artifacts  — NOT YET EXISTS
POST /api/knowledge/backup          — NOT YET EXISTS
```

## 4. 核心设计

### 4.1 Backup

```
POST /api/knowledge/backup

1. 读取 settings.database_path (sqlite) + settings.data_dir/audit/agent_events.jsonl
2. Copy sqlite → data/trader-agent/backups/trader-agent-memory-YYYYMMDD-HHMMSS.sqlite
3. Copy jsonl → data/trader-agent/backups/agent-events-YYYYMMDD-HHMMSS.jsonl
4. 返回 backup 路径和时间戳
```

### 4.2 Incremental rebuild

```
POST /api/knowledge/incremental-rebuild

1. build_artifact_catalog(settings) → 检测 hash 变化，标记 stale
2. index_markdown_sections(settings) → 重建 pending/stale artifacts 的 document_sections
3. 如果 M3/M4/M5 未来注册了 rebuild hook → 依次调用
4. revalidate_evidence(settings) → 扫描 memory_items 的 evidence refs
5. 写 index_rebuild_completed 事件
6. 返回 IncrementalRebuildReport
```

`_REBUILD_HOOKS` 是一个可扩展的 hook 列表，目前只有 M1。后续模块可以注册。

### 4.3 局部 rebuild

```
POST /api/knowledge/rebuild-artifacts
body: {"artifact_ids": ["id1", "id2"]}

1. 标记指定 artifact 的 index_status=stale
2. 调 `_reindex_and_revalidate(settings)` — index_markdown_sections（仅 pending/stale）+ revalidate_evidence
3. 不调用 build_artifact_catalog（不做全库 catalog scan）
4. 返回 IncrementalRebuildReport（catalog 字段为零值 CatalogResult）
```

实现说明：`rebuild_artifacts` 通过 `_reindex_and_revalidate` 复用 M1 index + evidence revalidate，与 `incremental_rebuild` 的 catalog 步骤解耦。

### 4.4 Evidence revalidation

```python
@dataclass
class EvidenceRevalidationReport:
    total_memory_items: int
    total_evidence_refs: int
    resolved: int
    stale: int
    unresolved: int
    affected_memory_ids: list[str]  # items with at least one stale/unresolved ref

def revalidate_evidence(settings: Settings) -> EvidenceRevalidationReport:
    ...
```

逻辑：
1. 读取所有 status IN ('active', 'conflicted') 的 memory_items
2. 对每条 evidence_ref 调 `EvidenceRef.from_dict(ref).resolve(engine)`
3. 如果 stale 或 unresolved → 收集到 affected_memory_ids
4. 对**每条** scanned item 合并 `review_flags_json`（全部 resolved 时 strip `evidence_stale` / `evidence_unresolved`）
5. 写 `memory_conflict_marked` 事件（对于有 unresolved evidence 的项；按 memory_item_id + reason 去重）
6. 返回 report

只读查询：`scan_evidence_health(settings)` — 相同统计逻辑，不写 DB、不写 audit events。

### 4.5 Rebuild report

```python
@dataclass
class IncrementalRebuildReport:
    catalog: CatalogResult       # from M0
    sections: MarkdownSectionIndexResult  # from M1
    evidence: EvidenceRevalidationReport  # from revalidate
    duration_ms: int
```

## 5. API

| Method | Path | Description |
|---|---|---|
| POST | `/api/knowledge/backup` | 手动备份 |
| POST | `/api/knowledge/incremental-rebuild` | 增量：scan→reindex→revalidate |
| POST | `/api/knowledge/rebuild-artifacts` | 局部：指定 artifact_ids |
| GET | `/api/knowledge/rebuild-status` | 最近一次 rebuild report（从 agent_events 查询） |
| GET | `/api/knowledge/evidence-health` | 只读 evidence 健康扫描（`scan_evidence_health`，不写 DB、不写 audit） |

## 6. 允许修改的文件

- `apps/trader-agent/backend/app/modules/rebuild.py` — NEW
- `apps/trader-agent/backend/app/api/agent.py` — 新增 5 个 endpoint
- `apps/trader-agent/backend/tests/test_rebuild.py` — NEW

## 7. 禁止修改的范围

- 所有已有 modules
- `events.py` / `migrations.py` / `models.py`
- `apps/trader-cockpit/**`
- `document_chunks` / `document_chunks_fts`
- package manager files / frontend files

## 8. 任务清单

- [x] Task 1: 新建 `rebuild.py` — backup, incremental_rebuild, rebuild_artifacts, revalidate_evidence
- [x] Task 2: `api/agent.py` 新增 endpoint
- [x] Task 3: 新建 `test_rebuild.py`
- [x] Task 4: 全量 pytest + ruff + 回归

## 9. 测试

| 测试 | 断言 |
|---|---|
| backup creates sqlite copy | backup dir 中存在 sqlite 文件，大小 > 0 |
| backup returns correct paths | response 含 sqlite_path, jsonl_path, timestamp |
| backup dir created if not exists | 第一次 backup 自动创建目录 |
| incremental rebuild calls catalog + index | catalog discovered/updated 计数 + sections indexed 计数 > 0 |
| incremental rebuild returns IncrementalRebuildReport | catalog/sections/evidence 字段都存在 |
| incremental rebuild writes audit event | agent_events 含 index_rebuild_completed |
| rebuild-artifacts rebuilds specific artifacts | 只重建指定 ID，其他不变 |
| rebuild-artifacts on nonexistent ID | 优雅跳过，不崩溃 |
| revalidate_evidence detects stale ref | 修改 section text → rebuild → evidence 标记 stale |
| revalidate_evidence detects unresolved ref | 删除 section → rebuild → evidence 标记 unresolved |
| revalidate_evidence updates review_flags | 有 stale 的 memory_item → review_flags_json 含 evidence_stale |
| GET rebuild-status returns last rebuild | 查询 agent_events 最近一次 index_rebuild_completed |
| GET evidence-health returns current stale count | 返回有多少 evidence refs 是 stale/unresolved |
| M0/M1/M2/M3/M4/M5 regression | 全部已有测试通过 |

## 10. 验收命令

```powershell
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_rebuild.py -v --tb=short
.venv/Scripts/python.exe -m ruff check apps/trader-agent/backend/app/modules/rebuild.py apps/trader-agent/backend/app/api/agent.py
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_artifact_catalog.py apps/trader-agent/backend/tests/test_markdown_section_indexer.py apps/trader-agent/backend/tests/test_corpus_search.py apps/trader-agent/backend/tests/test_evidence_ref.py apps/trader-agent/backend/tests/test_candidate_api.py apps/trader-agent/backend/tests/test_memory_api.py apps/trader-agent/backend/tests/test_context_selector.py -v --tb=short
```

## 11. 完成后文档更新

- [x] 本 plan `Status: done`
- [x] 更新 plans README
