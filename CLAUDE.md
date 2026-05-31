# CLAUDE.md

These guidelines bias toward correctness over speed. For trivial tasks, use judgment.

## Quick Reference

```bash
# Tests (always run from repo root)
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/<file>.py -v --tb=short

# Lint
.venv/Scripts/python.exe -m ruff check apps/trader-agent/backend/app/<path>.py

# Run all Shared Memory tests
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_artifact_catalog.py apps/trader-agent/backend/tests/test_markdown_section_indexer.py -v --tb=short
```

## Project Layout

```
stock-community-summary/
├── apps/
│   ├── trader-agent/backend/         # Python backend — SQLAlchemy + SQLite FTS5 + FastAPI
│   │   ├── app/
│   │   │   ├── api/agent.py          # All REST endpoints (/api/knowledge/*, /api/agent/*)
│   │   │   ├── core/                 # Settings, events (record_agent_event), time (utc_now_iso)
│   │   │   ├── db/                   # models.py (all Tables), migrations.py (bootstrap), session.py
│   │   │   └── modules/              # Business logic — see Architecture below
│   │   └── tests/
│   └── trader-cockpit/               # Frontend — NEVER modify in backend plans
├── docs/research-agent/target-system/trader-agent/
│   ├── 00-workflow-router.md         # ← TASK ENTRY POINT for any non-trivial work
│   ├── 03-shared-agent-memory-prd.md
│   └── 03-shared-agent-memory-development/
│       ├── 01-*.md .. 07-*.md        # Module dev docs (design specs)
│       └── plans/                    # Implementation plans + worker prompts
└── CLAUDE.md
```

## Architecture

```
source_artifacts (M0)  ── file catalog with content_hash, source_type, memory_eligible
document_sections (M1) ── heading-based markdown sections with heading_path, line_range
document_sections_fts   ── FTS5 over sections (title, heading_path, text, symbols, tags, speaker_refs)

document_chunks + document_chunks_fts  ── OLD paragraph-based search — EXISTS, DO NOT MODIFY
```

**Module responsibilities (business logic only):**

| Module | Role | Can modify? |
|---|---|---|
| `_json.py` | `dumps()` / `loads()` — JSON column helpers | No |
| `artifact_catalog.py` | M0 — `build_artifact_catalog(settings)` | Bug fixes only |
| `markdown_section_indexer.py` | M1 — `index_markdown_sections()`, `search_document_sections()`, `ensure_sections_fts()` | Bug fixes only |
| `corpus_search.py` | M2 — `search_corpus()` unified search | Bug fixes only |
| `document_indexer.py` | OLD — do NOT modify | **Forbidden** |
| `local_search.py` | OLD — do NOT modify | **Forbidden** |

**DB conventions:**
- `bootstrap_database(settings)` calls `metadata.create_all(engine)` — new Tables in `models.py` auto-create
- SQLAlchemy Table helpers: `uuid_column(n)`, `timestamp_column(n)`, `json_column(n)`
- FTS5 virtual tables can NOT use `metadata.create_all()` — always create with raw SQL `CREATE VIRTUAL TABLE IF NOT EXISTS`
- `create_sqlite_engine(settings)` from `db/session.py` for all DB access

**Audit events:**
- `record_agent_event(settings, event_type=..., status=..., input_summary=..., error=...)` writes to `agent_events`
- Must be called AFTER DB transaction closes (never inside `engine.begin()` block)
- Canonical event registry: `docs/.../07-audit-and-rebuild-workflow.md`

**Documentation chain:**
```
PRD → dev doc (01-07-*.md) → plan (plans/XX-mX-*.md) → worker prompt (plans/XX-mX-worker-prompt.md)
```
Worker prompts are written to files, never echoed inline in chat.

## Rules

### 1. Know the ground before breaking it

Read before write. Never propose a plan, worker prompt, or code change without reading the
actual source of truth first — the current code, the PRD, the dev doc.

For any non-trivial task, start at `00-workflow-router.md`. It tells you what to read,
which workflow to use, and what gate must pass before implementation. "The scope looks small
enough" is not a reason to skip it. If the router says a module needs a dev doc that doesn't
exist — **surface it**, don't fill the gap silently.

When a new module replaces or wraps an old one, read the old code at the algorithm level —
input parsing, query construction, result assembly, edge cases. The old behavior exists for
a reason. Account for every part of it before claiming the new code is "done."

Flag before implementing: product behavior changes, schema changes, API contract changes,
event name changes, anything touching a forbidden file.

### 2. Surgical scope

Touch only what the task requires. Don't refactor adjacent code. Don't fix style in files
you didn't come to change. Don't add features nobody asked for.

Forbidden means forbidden: if a plan lists a file or table as off-limits, do not touch it —
even for a "trivial" fix. Old tables (`document_chunks`, `document_chunks_fts`) and old
modules (`document_indexer.py`, `local_search.py`) exist for backward compatibility.
Route new features through M1+ infrastructure instead.

Every changed line should trace to the task. Clean up only **your** orphans. Leave
pre-existing issues unless they block the task.

### 3. Minimum code, no speculation

Solve the problem. Nothing more. Three similar lines > premature abstraction.
No "we might need this later." No error handling for states that can't happen.
Trust internal code and framework guarantees. Validate only at system boundaries.

### 4. Surface, don't assume

Ambiguous requirement → ask. Missing dev doc → flag. Conflicting source of truth → surface.
Decision with more than one defensible answer → it's the user's call.
A clarifying question costs seconds; a wrong implementation costs hours.

### 5. Artifacts to files, not chat

Plans, worker prompts, and decisions are written to disk under the relevant directory.
Chat is for discussion. Long-form artifacts stay in files where they can be versioned,
reviewed, and handed off to other models without copy-paste.

## Gotchas

Non-obvious technical facts. Not principles — concrete traps in this specific repo.

1. **FTS5 ≠ SQLAlchemy Table.** `document_sections_fts` and `document_chunks_fts` are created with raw SQL `CREATE VIRTUAL TABLE IF NOT EXISTS`. Adding them to `models.py` will break `metadata.create_all()`.

2. **Events after transaction, never inside.** `record_agent_event()` opens its own DB connection. Calling it inside `engine.begin()` causes nested write lock. Buffer events in a list, flush after the `with engine.begin() as conn:` block exits.

3. **Path separators.** This is a Windows repo. Use `.venv/Scripts/python.exe`, not `.venv/bin/python`. Bash commands at repo root: `cd "D:\workspace\01-products\stock-community-summary" && .venv/Scripts/python.exe ...`

4. **symbol_hints vs symbols.** Old code uses `symbol_hints` (LIKE-matched from raw text). M1+ code uses `symbols` (from `symbols_json`, exact match). Different fields, different semantics — don't use them interchangeably.

5. **bootstrap_database is lazy.** It calls `metadata.create_all()` which only creates tables that don't exist. Adding a new `Table()` to `models.py` auto-creates it — no migration script needed. But FTS5 virtual tables still need raw SQL in their module's `ensure_*_fts()` function.

## Spec-Driven Development Workflow

所有非平凡任务必须遵循 spec-driven 流程（依据 `docs/workflow.md` v2，**最终确认版**）：

### 流程

```text
CodeGraph（语义索引）
  → DeepSeek + OpenSpec + grill-me（生成 spec + 压力测试）
  → Clarification Questions（发现模糊决策）
  → 你拍板关键决策
  → spec.md + spec.json  +  task.md + task.json（双文件 artifact）
  → Cursor Composer 2.5 + Superpowers（Dev Plan + 实现）
  → Test / Verify
  → Codex Review（对比 spec scope + diff）
  → Cursor Fix
  → Codex Re-review
  → GitHub PR / Merge
```

### 双文件 Artifact

每个关键 Artifact 同时输出 `.md`（给人读）和 `.json`（给脚本校验）：

| Artifact | 存放位置 | JSON Schema |
|---|---|---|
| Spec | `.agent-dev/specs/<feature>/spec.json` | `schemas.md §1` |
| Task | `.agent-dev/tasks/T001.json` | `schemas.md §2` |
| Decision Record | `.agent-dev/specs/<feature>/decision-record.json` | `schemas.md §3` |
| Review Findings | `.agent-dev/reviews/<task>-review-findings.json` | `schemas.md §4` |
| Change Set | `.agent-dev/changesets/CS001.json` | `schemas.md §5` |

JSON Schema 定义在 `.agent-dev/memory/schemas.md`。

### 工具链

| 工具 | 用途 |
|---|---|
| **CodeGraph** | `codegraph index` + `codegraph serve`（MCP），AI agent 用 `codegraph_context`/`codegraph_explore` 替代 grep |
| **Code Map** | `.agent-dev/context/code_map.md` — 项目结构快速定位，开发前必读 |
| **DeepSeek + OpenSpec + grill-me** | Spec 生成 + 规范化校验 + 压力测试 |
| **Cursor Composer 2.5 + Superpowers** | Brainstorm → Plan → Implement → Review → Verify |
| **Codex** | 结构化 Code Review（对比 spec scope + decisions） |

### 三个强制 Gate

1. **Clarification Gate**: 任何有 >1 个合理答案的决策，必须先问用户，确认后写入 `decision-record.json`
2. **Plan Gate**: Dev Plan 展示后，你确认才能开始实现
3. **Review Gate**: Codex review 的 blocker 必须清零才能 merge

参考 `docs/workflow.md` 和 `docs/research-agent/target-system/trader-agent/00-workflow-router.md` §5.0。
