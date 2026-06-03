# 02 — 03 Shared Agent Memory M2: Local Corpus Search API Reconciliation

Status: done
Owner: codex
Created: 2026-05-29
Confirmed: 2026-05-29 (user decisions resolved, spec gate passed)
Completed: 2026-05-29 (Composer 2.5)

## Specification Gate Check

- [x] Source checked — PRD ✓, M1 plan ✓, 现有代码 ✓, dev doc 缺失（已 flag，用户确认现有 design 足够）
- [x] Decisions frozen — 11 条 confirmed decisions，3 条用户确认已完成
- [x] Scope bounded — 3 allowed files, 10 类 forbidden files
- [x] Verification mapped — 9 条验收标准 → 9 个测试用例
- [x] Prompt self-contained — worker prompt 包含完整 context + 代码模板
- [!] Behavior diffed — 已完成（见下方 Behavioral Equivalence Audit），识别出 LIKE fallback 退化，已修复

## Pre-plan Decision Inventory

### 用户确认

| # | 决策 | 结论 |
|---|---|---|
| 1 | sections 搜不到时 fallback 到旧 `document_chunks` | 不 fallback。sections 和 chunks 都直接从 Markdown 生成，不互为上下游 |
| 2 | `symbol_hints` → `symbols` | 直接替换。`symbols` 是清洗过的 `symbol_hints`（去停用词、去重、上限 20） |
| 3 | 搜索模块新建 vs 改旧文件 | 新建 `corpus_search.py`，不动 `local_search.py` |

Source PRD:
- [03-shared-agent-memory-prd.md](../../03-shared-agent-memory-prd.md)
- [02-markdown-chunking-and-fts5.md](../02-markdown-chunking-and-fts5.md)
- [01-m1-markdown-section-index.md](./01-m1-markdown-section-index.md)

Required Workflow / Skills:
- [../../00-workflow-router.md](../../00-workflow-router.md)
- `module-spec-quality-gate`

## 1. 目标

M2 完成 Local Corpus Search API 的 reconciliation：将 `GET /api/knowledge/search` 从旧的 `document_chunks` 迁移到 M1 交付的 `document_sections` + `document_sections_fts` 基础设施，同时保持 API 响应向后兼容。

M2 不引入新的数据表或索引。它的核心工作是：新建 `corpus_search.py` 统一搜索模块，让 public search API 路由到 section-based search，并在响应中增加 section 级元数据（`heading_path`、`line_range`）。

## 2. 非目标

- 不新增数据表或 FTS 索引。
- 不修改 `document_chunks` / `document_chunks_fts`。
- 不删除 `local_search.py` 或 `document_indexer.py`。
- 不引入新的 REST endpoint — 只增强现有 `GET /api/knowledge/search`。
- 不改变 M1 的 `search_document_sections()` 函数签名。
- 不修改 Web Cockpit 前端。
- 不 fallback 到旧 `document_chunks`。两个索引独立，都直接从 Markdown 生成。

## 3. Context Pack

当前后端状态（post-M1）：

```
source_artifacts ─── M0 catalog, tracks file hash + eligibility
document_sections  ─── M1 heading-based sections with section_key, text_digest, heading_path, line_range
document_sections_fts ─── M1 FTS5 over sections (section_id, title, heading_path, text, symbols, tags, speaker_refs)
document_chunks    ─── OLD paragraph chunks, still exists
document_chunks_fts ─── OLD FTS5, still exists

search_document_sections(settings, query, limit) ─── M1 internal helper, FTS + Chinese LIKE fallback
search_local_knowledge(settings, query, ...)       ─── OLD public search, uses document_chunks

GET /api/knowledge/search ─── currently routes to search_local_knowledge()
GET /api/knowledge/search 响应: { query, results: [{ evidence_id, source_path, snippet, source_type, confidence, timestamp, symbol_hints }] }
```

关键发现：

1. `search_local_knowledge()` 返回 `KnowledgeSearchResult`（7 个字段），M1 的 `search_document_sections()` 返回 `SectionSearchResult`（8 个字段，包含 `heading_path`、`line_range`）。
2. 旧 API 的 `symbol` filter 通过 `symbol_hints LIKE %"SYM"%` 实现，M1 的 `symbols_json` 是 JSON 数组，需要适配 filter 逻辑。
3. 旧 `search_local_knowledge()` 有 `source_type`、`start`/`end` date filters，M1 的 `search_document_sections()` 目前只支持 `query` + `limit`。
4. 旧 API 使用 `ensure_knowledge_fts()` (from `document_indexer.py`) 确保 FTS 表存在，M2 需要切换为 `ensure_sections_fts()` (from `markdown_section_indexer.py`)。

## 4. 已确认决策

| Decision | Chosen rule | Why |
|---|---|---|
| 搜索后端 | `GET /api/knowledge/search` 改为使用 `document_sections` + `document_sections_fts` | M1 是新的 evidence foundation，旧 chunks 不再作为主搜索源 |
| 旧模块处理 | 不删除、不修改 `local_search.py` | 保留为参考和 fallback；M2 新建 `corpus_search.py` |
| API 兼容性 | 响应增加 `heading_path`、`start_line`、`end_line`，保留旧字段 | 无 breaking change；前端可渐进使用新字段 |
| symbol filter | 从 `symbols_json` JSON 数组反序列化后匹配 | M1 已提取 symbols 到 `symbols_json`，不需要 LIKE hack |
| date filter | 通过 JOIN `source_artifacts` 的 `source_date` 字段过滤 | `document_sections.source_date` 已由 M1 填充 |
| source_type filter | 通过 JOIN `source_artifacts.source_type` 过滤 | sections 表不冗余存 source_type |
| FTS ensure | 调用 M1 的 `ensure_sections_fts()` | 复用 M1 模式，不引入新 FTS DDL |
| 事件 | 搜索本身不写 audit event | 搜索是只读操作；仅 M6 的 context injection 写 `memory_context_selected` |
| sections→chunks fallback | 不 fallback | `document_sections` 和 `document_chunks` 都直接从 Markdown 生成，不互为上下游 |
| `symbol_hints` → `symbols` | 直接替换 | `symbols` 是清洗过的 `symbol_hints`（去停用词、去重、上限 20），语义等价 |
| 旧模块策略 | 新建 `corpus_search.py`，不动 `local_search.py` | 增量改进，旧模块保留为 reference |

## 5. 核心模块

新建：

```
apps/trader-agent/backend/app/modules/corpus_search.py
```

公共接口：

```python
from dataclasses import dataclass

@dataclass
class CorpusSearchResult:
    evidence_id: str          # = section_id (向后兼容)
    section_id: str           # new
    source_path: str          # from source_artifacts.path
    source_type: str          # from source_artifacts.source_type
    heading_path: str         # new
    snippet: str              # first 240 chars around first match
    source_date: str | None
    start_line: int | None    # new
    end_line: int | None      # new
    symbols: list[str]        # replaces symbol_hints
    timestamp: str | None     # = source_date (向后兼容)

    def as_dict(self) -> dict: ...


def search_corpus(
    settings: Settings,
    *,
    query: str,
    symbol: str | None = None,
    source_type: str | None = None,
    start: str | None = None,
    end: str | None = None,
    limit: int = 10,
) -> list[CorpusSearchResult]:
    ...
```

实现要求：

- 使用 M1 的 `ensure_sections_fts(conn)` 确保 FTS 表存在。
- 使用 `document_sections_fts MATCH` 作为主搜索路径。
- ASCII/ticker query → FTS5；中文 query → LIKE fallback（复用 M1 逻辑）。
- `symbol` filter：读取 `document_sections.symbols_json`，反序列化后做精确匹配。
- `source_type` filter：JOIN `source_artifacts` 后过滤。
- `start`/`end` date filter：通过 `document_sections.source_date` 或 JOIN `source_artifacts.source_date` 过滤。
- `snippet`：取匹配词前后 80 字符，最多 240 字符（保持与旧实现一致的行为）。
- `limit` 受 `MAX_SEARCH_LIMIT = 50` 约束。

## 6. API 变更

修改 `apps/trader-agent/backend/app/api/agent.py` 中的 `search_knowledge` 函数：

- 将 `search_local_knowledge()` 替换为 `search_corpus()`。
- 响应 JSON 增加 `section_id`、`heading_path`、`start_line`、`end_line`、`symbols`。
- 保留 `evidence_id`、`source_path`、`snippet`、`source_type`、`timestamp`。

向后兼容保证：现有 Cockpit 前端如果只读 `evidence_id`、`source_path`、`snippet`、`source_type`、`confidence`、`timestamp`、`symbol_hints`，响应中这些字段仍然存在（`symbol_hints` → `symbols` 是唯一 breaking change，需确认前端是否使用）。

## 7. 允许修改的文件

- `apps/trader-agent/backend/app/modules/corpus_search.py` — NEW
- `apps/trader-agent/backend/app/api/agent.py` — 修改 `search_knowledge` 函数
- `apps/trader-agent/backend/tests/test_corpus_search.py` — NEW

## 8. 禁止修改的范围

- `apps/trader-cockpit/**`
- `apps/trader-agent/backend/config.json`
- `apps/trader-agent/backend/app/modules/document_indexer.py`
- `apps/trader-agent/backend/app/modules/local_search.py`
- `apps/trader-agent/backend/app/modules/markdown_section_indexer.py`
- `apps/trader-agent/backend/app/modules/artifact_catalog.py`
- `apps/trader-agent/backend/app/db/models.py`
- `document_chunks` / `document_chunks_fts`
- `document_sections` / `document_sections_fts` schema
- package manager files / frontend files

## 9. 任务清单

- [ ] Task 1: 新建 `corpus_search.py`，实现 `search_corpus()` 和 `CorpusSearchResult`。
- [ ] Task 2: 修改 `api/agent.py` 的 `search_knowledge`，路由到 `search_corpus()`。
- [ ] Task 3: 新建 `test_corpus_search.py`。
- [ ] Task 4: pytest + ruff 验证。
- [ ] Task 5: M0/M1 回归测试。

## 10. 测试与断言

| 测试 | 设置 | 断言 |
|---|---|---|
| searches sections via FTS | catalog + index markdown with "AAPL breakout", then search "AAPL" | 返回 section，`heading_path` 非空 |
| searches Chinese via LIKE | section 含中文关键词，search 中文 | 返回结果，不依赖 FTS tokenizer |
| filters by symbol | sections 有 `symbols_json=["AAPL"]`，search with `symbol=AAPL` | 返回匹配 section |
| filters by source_type | artifact source_type=`generated_summary`，search with `source_type=generated_summary` | 返回匹配，排除其他 type |
| filters by date range | source_date `2026-05-15`，search with `start=2026-05-01`, `end=2026-05-31` | 返回；search `start=2026-06-01` 不返回 |
| returns backward-compatible fields | search any | response 包含 `evidence_id`, `source_path`, `snippet`, `source_type` |
| returns new section fields | search | response 包含 `heading_path`, `start_line`, `end_line`, `symbols` |
| search API endpoint | `GET /api/knowledge/search?q=test` | 200, results 包含新字段 |
| empty query rejected | `GET /api/knowledge/search?q=` | 422 |

## 11. Acceptance To Verification Map

| 验收标准 | 测试或命令 |
|---|---|
| search uses document_sections, not document_chunks | `test_searches_sections_via_fts` |
| Chinese search works | `test_searches_chinese_like` |
| symbol filter works on symbols_json | `test_filters_by_symbol` |
| source_type filter works | `test_filters_by_source_type` |
| date range filter works | `test_filters_by_date_range` |
| API backward compatible | `test_returns_backward_compatible_fields` |
| new section fields in response | `test_returns_new_section_fields` |
| API endpoint integration | `test_search_api_endpoint` |
| M0/M1 no regression | `test_artifact_catalog.py` + `test_markdown_section_indexer.py` |
| lint passes | ruff commands |

## 12. 验收命令

```powershell
.venv\Scripts\python.exe -m pytest apps/trader-agent/backend/tests/test_corpus_search.py -v --tb=short
.venv\Scripts\python.exe -m ruff check apps/trader-agent/backend/app/modules/corpus_search.py
.venv\Scripts\python.exe -m ruff check apps/trader-agent/backend/app/api/agent.py
.venv\Scripts\python.exe -m pytest apps/trader-agent/backend/tests/test_artifact_catalog.py -v --tb=short
.venv\Scripts\python.exe -m pytest apps/trader-agent/backend/tests/test_markdown_section_indexer.py -v --tb=short
```

## 13. 完成后文档更新

- [ ] 本 plan `Status: done`。
- [ ] 更新 [README.md](../README.md) 中 M2 状态。
- [ ] 若 M3 plan 已存在，确认其输入从 `corpus_search.py` 取得 search contract。
