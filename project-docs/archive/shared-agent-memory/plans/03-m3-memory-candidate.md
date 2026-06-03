# 03 — Shared Agent Memory M3: Memory Candidate Schema + Extraction

Status: done
Owner: codex
Created: 2026-05-29
Confirmed: 2026-05-29 (all 10 decisions resolved, spec gate passed)
Completed: 2026-05-29 (Composer 2.5)

## Specification Gate Check

- [x] Source checked — PRD ✓, dev doc ✓, 现有代码盘点完成
- [x] Decisions frozen — 5 条用户确认 + 5 条技术推导，全部已定
- [x] Scope bounded — 8 allowed files, 10 类 forbidden files
- [x] Verification mapped — 13 条测试覆盖所有验收标准
- [x] Prompt self-contained — worker prompt 独立文件
- [x] Behavior preserved — 不适用（greenfield，无旧模块替换）

## Pre-plan Decision Inventory

### 用户确认

| # | 决策 | 结论 |
|---|---|---|
| 1 | REST API | M3 包含：`POST /api/knowledge/candidates`、`GET /api/knowledge/candidates`、`GET /api/knowledge/candidates/{id}` |
| 2 | EvidenceRef 类型 | 5 种全做：`document_section`、`image_artifact`、`raw_chat_message`、`news_archive`、`filing_archive` |
| 3 | 抽取方式 | rule-based + LLM draft 都做 |
| 4 | memory_sources | 内嵌在 `evidence_refs_json`，不建独立表 |
| 5 | 去重/冲突检测 | 基础 title 相似 + symbol 重叠检查，标记 `review_flags_json` |

### 技术推导

| # | 决策 | 依据 |
|---|---|---|
| 6 | `memory_candidates` schema | PRD §7.5 + dev doc §6 |
| 7 | `candidate_status` 状态值 | PRD §10：candidate / activated / rejected / removed / merged / conflicted |
| 8 | EvidenceRef common fields | PRD §7.4 |
| 9 | 审计事件 | PRD §6.4：`memory_candidate_created` |
| 10 | symbols 从 `document_sections.symbols_json` 优先 | M1 已提取，复用其数据 |

## 1. 目标

M3 实现 Shared Agent Memory 的 Memory Candidate 层：

1. 定义 `EvidenceRef` 结构——5 种引用类型，统一的 resolve 逻辑
2. 新建 `memory_candidates` 表
3. rule-based extraction——从 `document_sections` 按 heading pattern 生成候选
4. LLM draft extraction——通过 DeepSeek 从 sections 生成候选草稿（`created_by="agent"`）
5. REST API——创建、查询、单条查看 candidate
6. 基础去重检查，标记 `review_flags_json`

## 2. 非目标

- 不实现 M4 的 review/activate/merge/conflict 状态迁移
- 不修改 Web Cockpit 前端
- 不自动激活 candidate 为 active memory
- 不修改现有 `rule_candidates` 表或 `rule_discovery.py`
- 不把 LLM draft 的输出直接当 active memory

## 3. Context Pack

当前代码状态（post-M2）：

```
models.py:
  - source_artifacts (M0)
  - document_sections (M1)
  - rule_candidates (已有，与 Memory Candidate 不同——面向 rule discovery)
  - agent_events
  - NO memory_candidates table yet

modules/:
  - markdown_section_indexer.py: search_document_sections(), ensure_sections_fts()
  - corpus_search.py (M2): search_corpus()
  - rule_discovery.py: 已有 RuleCandidate dataclass + evidence_refs: list[dict] 模式（可参考）

api/agent.py:
  - knowledge_router: /api/knowledge/search, /api/knowledge/reindex, /api/knowledge/scan-artifacts
  - NO candidate endpoints yet
```

现有的 `rule_discovery.py` 已经用了 `evidence_refs: list[dict]` 模式。M3 的 EvidenceRef 要把它标准化为带 type 字段的结构体。

## 4. 核心设计

### 4.1 EvidenceRef

Python dataclass，序列化为 JSON 存入 `evidence_refs_json`：

```python
from dataclasses import dataclass, field
from enum import Enum

class RefType(str, Enum):
    DOCUMENT_SECTION = "document_section"
    IMAGE_ARTIFACT = "image_artifact"
    RAW_CHAT_MESSAGE = "raw_chat_message"
    NEWS_ARCHIVE = "news_archive"
    FILING_ARCHIVE = "filing_archive"

class ResolverStatus(str, Enum):
    RESOLVED = "resolved"
    STALE = "stale"
    UNRESOLVED = "unresolved"

@dataclass
class EvidenceRef:
    # Common fields
    ref_type: RefType
    ref_id: str
    artifact_id: str
    artifact_path: str
    artifact_hash: str | None = None
    source_date: str | None = None
    resolver_status: ResolverStatus = ResolverStatus.RESOLVED
    quote: str | None = None
    note: str | None = None

    # Per-type fields — only one group is non-empty
    # document_section
    section_key: str | None = None
    text_digest: str | None = None
    heading_path: str | None = None
    start_line: int | None = None
    end_line: int | None = None

    # image_artifact
    perceptual_hash: str | None = None
    related_artifact_id: str | None = None
    ocr_text_digest: str | None = None

    # raw_chat_message
    message_id: str | None = None
    conversation_id: str | None = None
    message_digest: str | None = None

    # news_archive / filing_archive
    archive_id: str | None = None
    source_url: str | None = None
    published_at: str | None = None
    content_digest: str | None = None

    @classmethod
    def from_dict(cls, data: dict) -> "EvidenceRef": ...
    def as_dict(self) -> dict: ...
    def resolve(self, conn) -> "EvidenceRef": ...  # returns copy with updated resolver_status
```

### 4.2 memory_candidates 表

```python
memory_candidates = Table(
    "memory_candidates",
    metadata,
    uuid_column("id", primary_key=True, nullable=False),
    Column("candidate_type", Text, nullable=False),
    Column("title", Text, nullable=False),
    Column("summary", Text),
    Column("normalized_rule", Text),
    Column("applicability", Text),
    json_column("trigger_conditions_json"),
    json_column("invalidation_conditions_json"),
    json_column("evidence_refs_json"),
    json_column("symbols_json"),
    json_column("related_symbols_json"),
    json_column("asset_classes_json"),
    Column("market_scope", Text),
    Column("confidence", Numeric),
    Column("candidate_status", Text, nullable=False, default="candidate"),
    json_column("review_flags_json"),
    Column("created_by", Text, nullable=False),
    timestamp_column("created_at"),
    timestamp_column("reviewed_at"),
    Column("review_note", Text),
)
```

### 4.3 Rule-based extraction

扫描 `document_sections` 中 `heading_path` 匹配已知模式的 section：

```python
EXTRACTION_RULES = {
    "核心理论": ("market_mechanism", 0.6),
    "证据链": ("source_pattern_summary", 0.6),
    "交易框架拆解": ("trading_rule", 0.55),
    "入场条件": ("trading_rule", 0.65),
    "风控规则": ("trading_rule", 0.65),
    "失效条件": ("trading_rule", 0.6),
    "市场状态判断": ("market_mechanism", 0.55),
}

def extract_candidates_from_sections(
    settings: Settings,
    *,
    section_ids: list[str] | None = None,
    source_date_from: str | None = None,
    source_date_to: str | None = None,
) -> list[dict[str, Any]]:
    ...
```

逻辑：
1. 从 `document_sections` 读取 `memory_eligible` artifact 的 sections
2. 匹配 heading_path 中的关键词
3. 提取 section.text 作为 summary
4. 从 `symbols_json`、`tags_json` 提取 symbol 和 tag
5. 构造 EvidenceRef（指向该 section）
6. 生成 title（来自 heading_path + source_date）
7. 写 `memory_candidates` 表

### 4.4 LLM draft extraction

```python
def draft_candidates_with_llm(
    settings: Settings,
    *,
    section_ids: list[str],
) -> list[dict[str, Any]]:
    ...
```

调用 DeepSeek（复用现有的 model call infrastructure），prompt 要求输出 JSON array of candidate drafts，符合 `memory_candidates` schema。输出标记 `created_by="agent"`, `confidence` 偏低。

### 4.5 基础去重

在插入前检查：
- `title` 与现有 candidate title 的编辑距离 < 30%
- `symbols_json` 交集 > 0（至少共享一个 symbol）

匹配时标记 `review_flags_json = ["possible_duplicate"]`，不自动合并。

### 4.6 REST API

在 `knowledge_router` 上新增：

```python
@knowledge_router.post("/candidates")
def create_candidates(request: Request, payload: CreateCandidatesRequest) -> dict:
    """从 section_ids 生成 candidate。extraction_mode: rule_based | llm_draft | both"""
    ...

@knowledge_router.get("/candidates")
def list_candidates(
    request: Request,
    status: str | None = None,
    candidate_type: str | None = None,
    symbol: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict:
    """列出 candidate，支持按 status/type/symbol 过滤"""
    ...

@knowledge_router.get("/candidates/{candidate_id}")
def get_candidate(request: Request, candidate_id: str) -> dict:
    """单条 candidate + 解析后的 evidence refs + resolve 状态"""
    ...
```

## 5. 允许修改的文件

- `apps/trader-agent/backend/app/db/models.py` — 新增 `memory_candidates` 表
- `apps/trader-agent/backend/app/modules/evidence_ref.py` — NEW
- `apps/trader-agent/backend/app/modules/candidate_extractor.py` — NEW
- `apps/trader-agent/backend/app/modules/candidate_service.py` — NEW
- `apps/trader-agent/backend/app/api/agent.py` — 在 `knowledge_router` 新增 3 个 endpoint
- `apps/trader-agent/backend/tests/test_evidence_ref.py` — NEW
- `apps/trader-agent/backend/tests/test_candidate_extractor.py` — NEW
- `apps/trader-agent/backend/tests/test_candidate_api.py` — NEW

## 6. 禁止修改的范围

- `apps/trader-cockpit/**`
- `apps/trader-agent/backend/config.json`
- `document_indexer.py` / `local_search.py` / `knowledge_source_registry.py`
- `corpus_search.py` / `markdown_section_indexer.py` / `artifact_catalog.py`
- 现有 `rule_candidates` 表和 `rule_discovery.py`
- 现有 `document_chunks` / `document_chunks_fts`
- package manager files / frontend files

## 7. 任务清单

- [ ] Task 1: `models.py` 新增 `memory_candidates` 表
- [ ] Task 2: 新建 `evidence_ref.py` — EvidenceRef dataclass + 5 种 ref_type + from_dict/as_dict/resolve
- [ ] Task 3: 新建 `candidate_extractor.py` — rule-based extraction + LLM draft
- [ ] Task 4: 新建 `candidate_service.py` — CRUD + dedup check
- [ ] Task 5: `api/agent.py` 新增 3 个 candidate endpoint
- [ ] Task 6: 新建测试文件（evidence_ref, extractor, API）
- [ ] Task 7: pytest + ruff 验证 + M0/M1/M2 回归

## 8. 测试与断言

| 测试 | 设置 | 断言 |
|---|---|---|
| EvidenceRef from_dict -> as_dict roundtrip | document_section ref dict | 序列化/反序列化一致 |
| resolve document_section — found | section 存在于 DB | `resolver_status=resolved` |
| resolve document_section — not found | section 不存在 | `resolver_status=unresolved` |
| resolve document_section — text changed | section 存在但 text_digest 不同 | `resolver_status=stale` |
| rule-based extraction generates candidates | catalog + index summary markdown with "核心理论" heading | 至少 1 个 candidate，candidate_type 正确 |
| rule-based extraction respects memory_eligible=0 | PRD doc 有 heading 但 memory_eligible=0 | 不生成 candidate |
| candidate has valid EvidenceRef | extraction 后查看 evidence_refs_json | ref_type=document_section，section_key 非空 |
| dedup flags similar title | 已有一个 candidate，插入 title 相似的 | `review_flags_json` 含 `possible_duplicate` |
| POST /candidates rule_based | API call with section_ids | 返回 created candidates 数组 |
| GET /candidates | 已有 candidate | 列表返回，支持 status filter |
| GET /candidates/{id} | 单条查询 | 返回完整 candidate + resolved evidence refs |
| writes memory_candidate_created event | 成功创建 | `agent_events.event_type` 包含 `memory_candidate_created` |
| M0/M1/M2 no regression | — | 已有测试全通过 |

## 9. Acceptance To Verification Map

| 验收标准 | 测试 |
|---|---|
| EvidenceRef 5 种类型可序列化/反序列化 | `test_evidence_ref_roundtrip` |
| EvidenceRef 可 resolve（resolved/stale/unresolved） | 3 个 resolve 测试 |
| rule-based extraction 从 heading 生成 candidate | `test_rule_based_extraction` |
| 不抽取 memory_eligible=0 的 artifact | `test_respects_memory_eligibility` |
| candidate 关联有效 EvidenceRef | `test_candidate_has_valid_evidence_ref` |
| 去重标记 | `test_dedup_flags_similar_title` |
| API 创建/列表/单条 | 3 个 API 测试 |
| 审计事件 | `test_writes_memory_candidate_created_event` |
| lint 通过 | ruff |
| M0/M1/M2 无回归 | pytest 全量 |

## 10. 验收命令

```powershell
.venv\Scripts\python.exe -m pytest apps/trader-agent/backend/tests/test_evidence_ref.py apps/trader-agent/backend/tests/test_candidate_extractor.py apps/trader-agent/backend/tests/test_candidate_api.py -v --tb=short
.venv\Scripts\python.exe -m ruff check apps/trader-agent/backend/app/modules/evidence_ref.py
.venv\Scripts\python.exe -m ruff check apps/trader-agent/backend/app/modules/candidate_extractor.py
.venv\Scripts\python.exe -m ruff check apps/trader-agent/backend/app/modules/candidate_service.py
.venv\Scripts\python.exe -m ruff check apps/trader-agent/backend/app/api/agent.py
.venv\Scripts\python.exe -m pytest apps/trader-agent/backend/tests/test_artifact_catalog.py apps/trader-agent/backend/tests/test_markdown_section_indexer.py apps/trader-agent/backend/tests/test_corpus_search.py -v --tb=short
```

## 11. 完成后文档更新

- [ ] 本 plan `Status: done`
- [ ] 更新 [README.md](../README.md) 中 M3 状态
