# 07 — 03 Shared Agent Memory M0: Artifact Catalog

Status: done
Owner: cursor-composer
Created: 2026-05-28
Completed: 2026-05-29
Implemented in: `27c9b3f`

Source PRD:
- [03-shared-agent-memory-prd.md](../../03-shared-agent-memory-prd.md)
- [03-shared-agent-memory-development/01-source-artifact-catalog.md](../../03-shared-agent-memory-development/01-source-artifact-catalog.md)
- [03-shared-agent-memory-development/07-audit-and-rebuild-workflow.md](../../03-shared-agent-memory-development/07-audit-and-rebuild-workflow.md)

Required Workflow / Skills:
- [../../00-workflow-router.md](../../00-workflow-router.md)
- `module-spec-quality-gate`
- TDD or `agent-module-development-loop` for implementation

## 1. 目标

实现 Shared Agent Memory M0：扫描本地 `docs/` 与 `data/` 资料源，将 Markdown、图片、JSONL 和显式排除文件登记到 SQLite `source_artifacts` 表，记录相对路径、content hash、source_type、memory_eligible、index_status 和审计事件。

M0 只建立稳定 artifact catalog，为后续 Markdown heading chunk、FTS5、memory candidate、context injection 和 audit/rebuild 提供入口。

## 2. 非目标

- 不解析 Markdown section。
- 不建立或修改 `document_chunks` / FTS5 index。
- 不做 memory candidate 提取。
- 不做图片 OCR / caption。
- 不把文件内容写入 SQLite blob。
- 不修改 Web Cockpit 前端。
- 不修改 `config.json`。
- 不改现有 `document_indexer.py`、`local_search.py`、`knowledge_source_registry.py`。

## 3. Context Pack

当前后端已有：

- `apps/trader-agent/backend/app/modules/document_indexer.py`：已有 docs/summaries -> FTS5 直接索引能力，但没有 artifact catalog。
- `apps/trader-agent/backend/app/modules/local_search.py`：依赖 `document_chunks` FTS5。
- `apps/trader-agent/backend/app/modules/knowledge_source_registry.py`：列出 knowledge sources，但不追踪 hash。
- `apps/trader-agent/backend/app/core/events.py`：`record_agent_event(settings, ...)` 写 `agent_events`。
- `apps/trader-agent/backend/app/db/models.py`：已有 `metadata`、`uuid_column`、`timestamp_column`、`json_column`。

已确认决策：

| Decision | Chosen rule | Why |
|---|---|---|
| Excluded files | 入库，`index_status="excluded"`，`memory_eligible=0` | 与 PRD failure/rebuild 模式一致，可审计 |
| Stored path | 一律存相对 `settings.repo_root` 的 POSIX path | 跨平台稳定，避免绝对路径污染 |
| `docs_root` | 仅覆盖物理 docs 扫描根，测试专用；逻辑路径仍映射为 `docs/...` | 让测试可隔离，生产语义不变 |
| Event names | 使用 canonical registry：`artifact_discovered`, `artifact_changed`, `artifact_excluded`, `artifact_index_failed` | PRD 禁止同义事件名 |
| Event transaction | source_artifacts upsert 事务结束后再调用 `record_agent_event` | 避免 SQLite nested write lock |
| Existing local search | 本计划不接入或改写 FTS5 search | M1/M2 再做 reconciliation |

## 4. 方案摘要

### 4.1 数据表

在 `apps/trader-agent/backend/app/db/models.py` 的现有 metadata 下新增：

```python
source_artifacts = Table(
    "source_artifacts", metadata,
    uuid_column("id", primary_key=True, nullable=False),
    Column("source_type", Text, nullable=False),
    Column("path", Text, nullable=False),
    Column("content_hash", Text),
    Column("title", Text),
    Column("source_date", Text),
    Column("market_session", Text),
    Column("mime_type", Text),
    Column("byte_size", Integer),
    Column("indexed_at", Text),
    Column("index_status", Text, nullable=False, default="pending"),
    Column("memory_eligible", Integer, nullable=False, default=1),
    Column("memory_eligible_reason", Text),
    Column("excluded_reason", Text),
    json_column("metadata_json"),
    timestamp_column("created_at"),
    timestamp_column("updated_at"),
    UniqueConstraint("path"),
)
```

`bootstrap_database(settings)` 若已调用 `metadata.create_all()`，不需要单独 migration 逻辑；否则把 `source_artifacts` 纳入显式建表。

### 4.2 核心模块

新建或修订：

```text
apps/trader-agent/backend/app/modules/artifact_catalog.py
```

公共接口：

```python
from dataclasses import dataclass
from pathlib import Path

@dataclass
class CatalogResult:
    discovered: int
    updated: int
    excluded: int
    failed: int

def build_artifact_catalog(settings: Settings, docs_root: Path | None = None) -> CatalogResult:
    ...
```

实现要求：

- base 使用 `settings.repo_root`。
- 扫描 `docs/` 与 `data/` 下本计划列出的 artifact patterns。
- `docs_root` 只用于测试覆盖物理 docs 根；存储和分类仍使用逻辑 `docs/...` POSIX path。
- 使用 `hashlib.sha256` 计算 content hash。
- `mime_type` 使用 `mimetypes.guess_type(path)[0]`，默认 `application/octet-stream`。
- `title` 使用 filename stem，并剥离开头 `YYYY-MM-DD-` / `YYYY-MM-DD_` / `YYYY-MM-DD `。
- `source_date` 从 path 或 filename 提取首个 `YYYY-MM-DD`。
- 新文件：insert，`index_status="pending"`，事件 `artifact_discovered`。
- hash 变化：update，`index_status="stale"`，事件 `artifact_changed`。
- hash 相同：跳过，不重置状态。
- excluded 文件：入库，`index_status="excluded"`，`excluded_reason` 非空，事件 `artifact_excluded`。
- read/hash 错误：入库或更新为 `index_status="failed"`，`excluded_reason` 或 metadata 记录 error，事件 `artifact_index_failed`。
- `created_at` / `updated_at` 使用 `app.core.time.utc_now_iso()`。
- `record_agent_event` 在 source_artifacts 写事务关闭后调用。

### 4.3 路径分类规则

规则有序，first match wins。

| Glob 模式 | source_type | memory_eligible | reason |
|---|---|---:|---|
| `**/.vitepress/cache/**` | `excluded` | 0 | generated vitepress cache |
| `**/.vitepress/dist/**` | `excluded` | 0 | generated vitepress dist |
| `**/node_modules/**` | `excluded` | 0 | dependency tree |
| `**/.next/**` | `excluded` | 0 | generated next build |
| `**/__pycache__/**` | `excluded` | 0 | generated python cache |
| `**/.git/**` | `excluded` | 0 | git internals |
| `docs/summaries/**/*.md` | `generated_summary` | 1 | market summary source |
| `docs/opportunities/**/*.md` | `markdown` | 1 | opportunity source |
| `docs/trading-experiences/**/*.md` | `markdown` | 1 | trader experience source |
| `docs/assets/chat-images/**/*.{png,jpg,jpeg,gif,webp}` | `image` | 0 | image artifact only |
| `data/trader-agent/raw/**/*.jsonl` | `raw_chat` | 1 | raw conversation source |
| `data/trader-agent/imports/**/*` | `raw_chat` | 0 | imported raw material, review first |
| `docs/research-agent/target-system/**/*.md` | `prd` | 0 | product/architecture source, not memory candidate |
| `docs/research-agent/**/*.md` | `engineering_doc` | 0 | engineering doc, not memory candidate |
| `docs/**/*.md` | `markdown` | 0 | general markdown, catalog only |

## 5. 允许修改的文件

- `apps/trader-agent/backend/app/db/models.py`
- `apps/trader-agent/backend/app/modules/artifact_catalog.py`
- `apps/trader-agent/backend/app/api/agent.py`
- `apps/trader-agent/backend/tests/test_artifact_catalog.py`
- `apps/trader-agent/backend/app/db/migrations.py` only if `bootstrap_database()` does not already use `metadata.create_all()`

## 6. 禁止修改的范围

- `apps/trader-cockpit/**`
- `apps/trader-agent/backend/config.json`
- `apps/trader-agent/backend/app/modules/document_indexer.py`
- `apps/trader-agent/backend/app/modules/local_search.py`
- `apps/trader-agent/backend/app/modules/knowledge_source_registry.py`
- `document_chunks` schema or FTS5 index
- `pnpm-lock.yaml`, package manager config, frontend package files

## 7. 任务清单

- [x] Task 1: `db/models.py` 新增 `source_artifacts` 表定义。
- [x] Task 2: 新建/修订 `artifact_catalog.py`，实现 scanner、classification、upsert、event buffering。
- [x] Task 3: `api/agent.py` 在 existing `knowledge_router` 新增 `POST /api/knowledge/scan-artifacts`。
- [x] Task 4: 新建/修订 `test_artifact_catalog.py`，覆盖 markdown、excluded、hash change、prd ineligible、image、jsonl、audit event、API。
- [x] Task 5: 检查 `bootstrap_database(settings)` 是否通过 `metadata.create_all()` 自动建表；只有必要时才改 `migrations.py`。
- [x] Task 6: pytest + ruff 验证。

## 8. 测试与断言

| 测试 | 设置 | 断言 |
|---|---|---|
| discovers markdown | temp repo `docs/summaries/2026-05-01-aapl.md` | path=`docs/summaries/2026-05-01-aapl.md`, source_type=`generated_summary`, memory_eligible=1 |
| excludes vitepress dist | temp repo `docs/.vitepress/dist/x.md` | row exists, index_status=`excluded`, memory_eligible=0, excluded_reason non-empty |
| detects hash change | first scan, edit file, second scan | row `content_hash` changes, index_status=`stale`, result.updated increments |
| marks target-system PRD ineligible | temp repo `docs/research-agent/target-system/x.md` | source_type=`prd`, memory_eligible=0 |
| catalogs image | temp repo `docs/assets/chat-images/a.png` | source_type=`image`, mime_type image/*, memory_eligible=0 |
| catalogs raw jsonl | temp repo `data/trader-agent/raw/chat.jsonl` | source_type=`raw_chat`, memory_eligible=1 |
| writes audit events | scan file | `agent_events.event_type` contains `artifact_discovered` |
| scan API | call `POST /api/knowledge/scan-artifacts` | returns `discovered`, `updated`, `excluded`, `failed` |

## 9. Acceptance To Verification Map

| 验收标准 | 测试或命令 |
|---|---|
| scan endpoint returns counts | API test in `test_artifact_catalog.py` |
| `source_artifacts` records all included and excluded artifacts | pytest row assertions |
| summaries markdown eligible | `test_discovers_markdown_file` |
| target-system docs ineligible | `test_marks_prd_as_memory_ineligible` |
| changed file becomes stale | `test_detects_hash_change` |
| excluded files are recorded as excluded | `test_excludes_vitepress_dist` |
| images and JSONL are cataloged | image/jsonl pytest cases |
| canonical audit events are written | `test_writes_audit_events` |
| lint passes | ruff commands below |

## 10. 验收命令

```powershell
.venv\Scripts\python.exe -m pytest apps/trader-agent/backend/tests/test_artifact_catalog.py -v --tb=short
.venv\Scripts\python.exe -m ruff check apps/trader-agent/backend/app/modules/artifact_catalog.py
.venv\Scripts\python.exe -m ruff check apps/trader-agent/backend/app/api/agent.py
```

## 11. Worker Prompt

```text
Implement plan 07 from docs/research-agent/target-system/trader-agent/02-web-agent-cockpit-development/plans/07-shared-memory-m0-artifact-catalog.md.

Goal: implement Shared Agent Memory M0 Artifact Catalog. Scan local docs/ and data/ artifacts, register included and excluded files in SQLite source_artifacts, track content_hash/source_type/index_status/memory_eligible, and write canonical audit events.

Source of truth:
- docs/research-agent/target-system/trader-agent/03-shared-agent-memory-prd.md
- docs/research-agent/target-system/trader-agent/03-shared-agent-memory-development/01-source-artifact-catalog.md
- docs/research-agent/target-system/trader-agent/03-shared-agent-memory-development/07-audit-and-rebuild-workflow.md
- this plan

Confirmed decisions:
- Excluded files must be inserted into source_artifacts with index_status="excluded", memory_eligible=0, and excluded_reason.
- source_artifacts.path must be relative to settings.repo_root and use POSIX separators.
- docs_root only overrides the physical docs scan root for tests; logical stored paths and classification remain under docs/...
- Use canonical event names only: artifact_discovered, artifact_changed, artifact_excluded, artifact_index_failed.
- Buffer event writes and call record_agent_event after the source_artifacts DB transaction closes.

Allowed files:
- apps/trader-agent/backend/app/db/models.py
- apps/trader-agent/backend/app/modules/artifact_catalog.py
- apps/trader-agent/backend/app/api/agent.py
- apps/trader-agent/backend/tests/test_artifact_catalog.py
- apps/trader-agent/backend/app/db/migrations.py only if bootstrap_database does not already use metadata.create_all()

Forbidden files:
- apps/trader-cockpit/**
- apps/trader-agent/backend/config.json
- apps/trader-agent/backend/app/modules/document_indexer.py
- apps/trader-agent/backend/app/modules/local_search.py
- apps/trader-agent/backend/app/modules/knowledge_source_registry.py
- document_chunks schema or FTS5 index
- pnpm-lock.yaml and frontend package files

Implementation requirements:
- Add source_artifacts table as specified in this plan.
- Implement CatalogResult and build_artifact_catalog(settings, docs_root=None).
- Classify paths using the ordered rules in this plan.
- Compute sha256 content_hash for readable files.
- Use mimetypes.guess_type(path)[0] or application/octet-stream.
- Use utc_now_iso() for timestamps.
- Insert new files as pending, changed files as stale, unchanged files skipped, excluded files as excluded, failed files as failed.
- Add POST /api/knowledge/scan-artifacts to the existing knowledge_router.

Required tests:
- markdown discovery
- vitepress dist exclusion row
- hash change stale detection
- target-system PRD memory_ineligible
- image catalog metadata
- raw JSONL catalog
- audit event uses canonical event name
- scan API response counts

Verification:
- .venv\Scripts\python.exe -m pytest apps/trader-agent/backend/tests/test_artifact_catalog.py -v --tb=short
- .venv\Scripts\python.exe -m ruff check apps/trader-agent/backend/app/modules/artifact_catalog.py
- .venv\Scripts\python.exe -m ruff check apps/trader-agent/backend/app/api/agent.py

Final response:
- changed files
- commands run
- failed command output, if any
- known gaps or risks
```

## 12. 完成后文档更新

- [x] 不更新 Cockpit `00-implementation-status.md`：Shared Memory M0 属于 backend memory slice，不属于 Web Cockpit status。
- [x] 本 plan `Status: done`。
