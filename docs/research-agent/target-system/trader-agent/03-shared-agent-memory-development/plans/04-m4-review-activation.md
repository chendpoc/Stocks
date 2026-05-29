# 04 — Shared Agent Memory M4: Candidate Review + Active Memory

Status: done
Owner: codex
Created: 2026-05-29
Confirmed: 2026-05-29 (all 6 decisions resolved, spec gate passed)

## 主流程与验收范围（2026-05-29 确认）

| 路径 | 说明 | 验收 |
|---|---|---|
| **Path B（主流程）** | 对话文本 → `extract-preview` → 人工确认 → `POST /memory-items` | **M4 主验收** |
| Path A / M3 API（备用） | section 扫描 → `memory_candidates` → activate/merge 等 | 保留 API，**不作主流程验收** |

Path B 跳过 candidate 表，直接写入 `memory_items`。M3 的 `POST /candidates` 等接口保留供批量扫描备用。

## Specification Gate Check

- [x] Source checked — PRD ✓, dev doc ✓, 05-memory-review-and-activation.md ✓, M3 code ✓
- [x] Decisions frozen — 6 条用户确认 + 4 条技术推导，全部已定
- [x] Scope bounded — allowed/forbidden files 已列出
- [x] Verification mapped — 见测试表
- [x] Prompt self-contained — worker prompt 独立文件
- [ ] Behavior preserved — 不适用（greenfield）

## Pre-plan Decision Inventory

### 用户确认

| # | 决策 | 结论 |
|---|---|---|
| 1 | 范围 | backend only，不出 Cockpit 前端代码 |
| 2 | 表 | 独立 `memory_items` 表 |
| 3 | 更新方式 | 直接改 `PATCH /memory-items/{id}` + `updated_by` 标记。禁止 AI 静默覆盖的约束在 M5 context injection 检查 |
| 4 | memory_versions | 不做，Git 足够 |
| 5 | 冲突检测 | 同 symbol + 相似 tag/scope + 不同方向/失效条件 → `conflicted` |
| 6 | 批量操作 | `POST /candidates/batch` |
| + | 对话抽离交互 | `POST /extract-preview`（LLM 抽离 → 预览）→ `POST /memory-items`（确认 → 存入） |

### 技术推导

| # | 决策 | 依据 |
|---|---|---|
| 7 | `memory_items` schema | PRD §7.6 + dev doc §8 |
| 8 | 状态机 | PRD §10 canonical lifecycle |
| 9 | 审计事件 | PRD §6.4 事件注册表 |
| 10 | EvidenceRef 复用 | M3 `evidence_ref.py` |

---

## 1. 目标

M4 实现 Memory Review 与 Active Memory。

**两条创建路径（互补；Path B 为主流程）：**

```
Path B（主流程，M4 主验收）：
  对话文本 + "记住这个" → extract-preview（LLM 抽离）→ 前端预览
  → 确认 → 直接存 memory_items（跳过 candidate）
  场景："刚才这段对话值得记住"

Path A / M3 API（备用，不作主流程验收）：
  document_sections → rule-based/LLM 扫描 → memory_candidates
  → activate → memory_items
  场景："扫一遍两个月总结，找出规律"（批量扫描备用）
```

1. 新建 `memory_items` 表——人工确认后的 active memory
2. 状态机——candidate → activate/reject/merge/conflict，memory_item → conflicted/deprecated
3. 对话抽离交互——LLM 从用户标记的文本中抽离 memory 预览，人确认后存入
4. 管理 API——CRUD memory_items + candidate 状态迁移 + 批量操作 + 冲突检测

M4 不修改 Cockpit 前端。前端通过 API 数据契约自行对接。

## 2. 非目标

- 不实现 Cockpit 前端 `/cockpit/settings/memory` 页面
- 不让 AI 自动覆盖 active memory
- 不做 `memory_versions` 表（Git 替代）
- 不修改 `rule_candidates` 表或 `rule_discovery.py`

## 3. Context Pack

当前代码状态（post-M3）：

```
models.py:
  memory_candidates (M3) — candidate_type, title, summary, normalized_rule,
    evidence_refs_json, symbols_json, candidate_status, review_flags_json, created_by, ...
  memory_items — NOT YET EXISTS

modules/:
  evidence_ref.py (M3) — EvidenceRef + 5 ref types + resolve()
  candidate_service.py (M3) — create_candidates(), list_candidates(), get_candidate()
  candidate_extractor.py (M3) — rule-based + LLM draft extraction

api/agent.py:
  knowledge_router:
    POST /candidates, GET /candidates, GET /candidates/{id} (M3)
    POST /extract-preview — NOT YET EXISTS
    POST /candidates/{id}/activate — NOT YET EXISTS
    ...
```

## 4. 核心设计

### 4.1 memory_items 表

```python
memory_items = Table(
    "memory_items",
    metadata,
    uuid_column("id", primary_key=True, nullable=False),
    Column("memory_type", Text, nullable=False),
    Column("title", Text, nullable=False),
    Column("summary", Text),
    Column("rule_text", Text),
    Column("applicability", Text),
    Column("invalidation", Text),
    json_column("evidence_refs_json"),
    json_column("symbols_json"),
    json_column("related_symbols_json"),
    json_column("asset_classes_json"),
    json_column("tags_json"),
    Column("market_scope", Text),
    Column("confidence", Numeric),
    Column("status", Text, nullable=False, default="active"),
    Column("updated_by", Text, nullable=False, default="human"),
    timestamp_column("valid_from"),
    timestamp_column("valid_until"),
    timestamp_column("last_reviewed_at"),
    timestamp_column("created_at"),
    timestamp_column("updated_at"),
)
```

### 4.2 状态机

```
memory_candidates status:
  candidate → activated  (创建 memory_item，更新 candidate 状态)
  candidate → rejected   (拒绝，保留审计)
  candidate → removed    (软移除)
  candidate → merged     (合并到已有 memory_item)
  candidate → conflicted (标记冲突)

memory_items status:
  active → conflicted    (与另一条 memory_item 冲突)
  active → deprecated    (过期/被替代)
  conflicted → active    (冲突解决)
  conflicted → deprecated
```

### 4.3 对话抽离流程

```
1. 前端调用 POST /api/knowledge/extract-preview
   输入: { text: "用户标记的对话内容", context_note?: "可选的上下文提示" }
   
2. 后端构造 LLM prompt → DeepSeek 返回 JSON:
   {
     "memory_type": "trading_rule" | "market_mechanism" | "source_pattern_summary",
     "title": "...",
     "summary": "...",
     "rule_text": "...",
     "applicability": "...",
     "invalidation": "...",
     "symbols": [...],
     "confidence": 0.7
   }

3. 前端展示预览，不存入

4. 人确认 → 前端 POST /api/knowledge/memory-items
   输入: 确认后的字段
   后端: 直接写入 memory_items，status="active"
   写审计事件 memory_candidate_activated
```

### 4.4 批量操作

```python
POST /api/knowledge/candidates/batch
{
  "candidate_ids": ["id1", "id2"],
  "action": "activate" | "reject"
}
```

批量 activate：为每个 candidate 创建 memory_item，更新 candidate status，写审计事件。
若某个 candidate 已有冲突标记 → 跳过，在响应中报告。

### 4.5 冲突检测

在 activate candidate 时检查：
1. 新 memory_item 的 `symbols_json` ∩ 已有 active memory_item 的 `symbols_json` 非空
2. 新 memory_item 的 `tags_json` ∩ 已有 active memory_item 的 `tags_json` 非空（或 market_scope 相同）
3. 满足以上 + （方向关键词相反 或 invalidation 条件明显矛盾） → 标记 `review_flags_json = ["possible_conflict"]`

检测到冲突时，不阻止 activate，但写 `memory_conflict_marked` 审计事件。

## 5. API 设计

| Method | Path | Description |
|---|---|---|
| POST | `/api/knowledge/extract-preview` | LLM 抽离预览 |
| POST | `/api/knowledge/memory-items` | 创建 active memory |
| GET | `/api/knowledge/memory-items` | 列出 active memory（支持 status/symbol/type filter） |
| GET | `/api/knowledge/memory-items/{id}` | 单条 + resolved evidence refs |
| PATCH | `/api/knowledge/memory-items/{id}` | 更新（updated_by 必填） |
| POST | `/api/knowledge/candidates/{id}/activate` | 候选 → active |
| POST | `/api/knowledge/candidates/{id}/reject` | 拒绝候选 |
| POST | `/api/knowledge/candidates/{id}/merge` | 合并到现有 memory_item |
| POST | `/api/knowledge/candidates/batch` | 批量 activate/reject |
| POST | `/api/knowledge/memory-items/{id}/deprecate` | 废弃 active memory |

## 6. 允许修改的文件

- `apps/trader-agent/backend/app/db/models.py` — 新增 `memory_items` 表
- `apps/trader-agent/backend/app/modules/extract_preview.py` — NEW
- `apps/trader-agent/backend/app/modules/memory_service.py` — NEW
- `apps/trader-agent/backend/app/modules/conflict_detector.py` — NEW
- `apps/trader-agent/backend/app/api/agent.py` — 新增 10 个 endpoint
- `apps/trader-agent/backend/tests/test_extract_preview.py` — NEW
- `apps/trader-agent/backend/tests/test_memory_service.py` — NEW
- `apps/trader-agent/backend/tests/test_conflict_detector.py` — NEW
- `apps/trader-agent/backend/tests/test_memory_api.py` — NEW

## 7. 禁止修改的范围

- `apps/trader-cockpit/**`
- `config.json`
- `document_indexer.py` / `local_search.py` / `knowledge_source_registry.py`
- `corpus_search.py` / `markdown_section_indexer.py` / `artifact_catalog.py`
- `evidence_ref.py` / `candidate_extractor.py` / `candidate_service.py`
- `rule_discovery.py` / `rule_engine.py` / `scoring.py`
- `document_chunks` / `document_chunks_fts`
- package manager files / frontend files

## 8. 任务清单

- [ ] Task 1: `models.py` 新增 `memory_items` 表
- [ ] Task 2: 新建 `extract_preview.py` — LLM 对话抽离
- [ ] Task 3: 新建 `memory_service.py` — memory_items CRUD + candidate 状态迁移
- [ ] Task 4: 新建 `conflict_detector.py` — 冲突检测逻辑
- [ ] Task 5: `api/agent.py` 新增 endpoint
- [ ] Task 6: 新建测试文件
- [ ] Task 7: 全量 pytest + ruff + 回归

## 9. 测试与断言

| 测试 | 断言 |
|---|---|
| extract-preview returns structured memory | response 含 memory_type, title, summary, rule_text, symbols |
| extract-preview handles empty text | 优雅返回 error 或空 |
| POST memory-items creates active memory | status=active, memory_item 写入 |
| PATCH memory-items updates fields | updated_by + updated_at 更新 |
| POST candidates/{id}/activate | candidate status→activated, memory_item created |
| POST candidates/{id}/reject | candidate status→rejected |
| POST candidates/{id}/merge | candidate status→merged, 目标 memory_item 证据合并 |
| POST candidates/batch | 批量 activate/reject，计数值正确 |
| batch skips conflicted candidates | conflicted 项跳过，响应中列出 |
| conflict detection on activate | 同 symbol + 相似 tag → review_flags 含 possible_conflict |
| POST memory-items/{id}/deprecate | status→deprecated |
| memory_item → conflicted | status→conflicted, 审计事件写入 |
| audit events for all transitions | memory_candidate_activated/rejected/merged + memory_conflict_marked + memory_item_deprecated |
| M0/M1/M2/M3 regression | 全部已有测试通过 |

## 10. 验收命令

```powershell
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_extract_preview.py apps/trader-agent/backend/tests/test_memory_service.py apps/trader-agent/backend/tests/test_conflict_detector.py apps/trader-agent/backend/tests/test_memory_api.py -v --tb=short
.venv/Scripts/python.exe -m ruff check apps/trader-agent/backend/app/modules/extract_preview.py apps/trader-agent/backend/app/modules/memory_service.py apps/trader-agent/backend/app/modules/conflict_detector.py apps/trader-agent/backend/app/api/agent.py
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_artifact_catalog.py apps/trader-agent/backend/tests/test_markdown_section_indexer.py apps/trader-agent/backend/tests/test_corpus_search.py apps/trader-agent/backend/tests/test_evidence_ref.py apps/trader-agent/backend/tests/test_candidate_extractor.py apps/trader-agent/backend/tests/test_candidate_api.py -v --tb=short
```

## 11. 完成后文档更新

- [ ] 本 plan `Status: done`
- [ ] 更新 [README.md](../README.md) 中 M4 状态
