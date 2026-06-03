# 05 — Shared Agent Memory M5: Active Memory Context Injection

Status: done
Owner: codex
Created: 2026-05-29
Confirmed: 2026-05-29 (all 5 decisions resolved)

## Specification Gate Check

- [x] Source checked — PRD ✓, dev doc 06-context-injection-policy.md ✓, M4 memory_items ✓
- [x] Decisions frozen — 5 条用户确认 + 4 条技术推导
- [x] Scope bounded — allowed/forbidden files 已列出
- [x] Verification mapped — 见测试表
- [x] Prompt self-contained — worker prompt 独立文件
- [x] Behavior preserved — 不适用（greenfield）

## Pre-plan Decision Inventory

| # | 决策 | 结论 |
|---|---|---|
| 1 | 接口 | `POST /api/knowledge/select-context` + 纯函数 `select_context(settings, ...)` |
| 2 | task_type | `market_intent_explanation`, `signal_explanation`, `agent_conversation`, `learning_review`。按需扩展 |
| 3 | 评分权重 | 硬编码模块常量，明确注释 |
| 4 | 预算 | 5 条 / 800 字符/条 / 3000 总字符 |
| 5 | 置信度阈值 | < 0.5 排除 |

---

## 1. 目标

M5 实现 Active Memory Context Injection：根据 Agent 当前任务（task_type、symbols、tags、market_scope）从 `memory_items` 中选择最相关的 active memory，按 relevance score 排序，在预算内返回 context payload，并写审计事件。

Agent 调用 `select_context()` 获取选中的 memory → 注入到模型 prompt → 模型回答时引用这些 memory 的标题和来源。

## 2. 非目标

- 不修改 Cockpit 前端
- 不注入 candidate、rejected、deprecated、低置信度的 memory
- 不把全部 active memory 全量塞入上下文
- 不让 memory 直接触发交易执行
- 不隐藏 memory 来源——返回结果必须包含引用路径

## 3. Context Pack

当前代码（post-M4）：

```
memory_items (M4):
  id, memory_type, title, summary, rule_text, applicability, invalidation,
  evidence_refs_json, symbols_json, related_symbols_json, tags_json,
  market_scope, confidence, status, updated_by,
  valid_from, valid_until, last_reviewed_at, created_at, updated_at

  Statuses: active, conflicted, deprecated

evidence_ref.py (M3): EvidenceRef + resolve()

API: knowledge_router 已有 /search, /candidates, /memory-items, /extract-preview, etc.
```

## 4. 核心设计

### 4.1 选择策略

```
SELECT * FROM memory_items
WHERE status = 'active'
  AND confidence >= 0.5
  AND (valid_until IS NULL OR valid_until >= utc_now_iso())
  AND (
    symbols_json 包含 input.symbols 任一项
    OR related_symbols_json 包含 input.symbols 任一项
    OR tags_json 包含 input.tags 任一项
    OR market_scope = input.market_scope
    OR memory_type 匹配 task_type 对应类型优先级
  )
ORDER BY relevance_score(item, input) DESC
LIMIT budget (max 5)
```

### 4.2 评分函数

```python
_SCORE_WEIGHTS = {
    "symbol_match": 30,        # symbols_json ∩ input.symbols 每一项
    "related_symbol_match": 15, # related_symbols_json ∩ input.symbols 每一项
    "tag_match": 25,            # tags_json ∩ input.tags 每一项
    "task_type_match": 20,      # memory_type 匹配 task_type 偏好
    "market_scope_match": 10,   # market_scope 完全匹配
    "recency_bonus": 5,         # last_reviewed_at 在 30 天内
    "evidence_bonus": 5,        # evidence_refs 数量 >= 2
}

_TASK_TYPE_PREFERENCE = {
    "market_intent_explanation": ["market_mechanism", "source_pattern_summary"],
    "signal_explanation": ["trading_rule", "market_mechanism"],
    "agent_conversation": ["source_pattern_summary", "trading_rule", "market_mechanism"],
    "learning_review": ["trading_rule", "market_mechanism"],
}
```

评分逻辑：
1. 基础分 0
2. 每个匹配的 symbol → +30
3. 每个匹配的 related_symbol → +15
4. 每个匹配的 tag → +25
5. memory_type 在 task_type 偏好列表 → +20（主要类型）/+10（次要）
6. market_scope 完全匹配 → +10
7. last_reviewed_at 在近 30 天 → +5
8. evidence_refs 数量 >= 2 → +5
9. 总分排序，同分按 last_reviewed_at DESC

### 4.3 预算控制

```
max_memories: 5
max_chars_per_memory: 800
max_total_chars: 3000

算法：
  1. 按 relevance DESC 排序
  2. 依次选取，每条截断到 800 字符
  3. 累计 total_chars，超过 3000 停止
```

超过预算时保留摘要 + 引用，不塞完整 evidence。

### 4.4 Context Payload

```python
@dataclass
class ContextMemory:
    memory_id: str
    memory_type: str
    title: str
    summary: str
    rule_text: str
    symbols: list[str]
    confidence: float
    relevance_score: int
    # Citation fields
    source_date: str | None
    heading_path: str | None    # from first evidence_ref with type=document_section
    evidence_count: int

@dataclass
class ContextSelectionResult:
    memories: list[ContextMemory]
    total_chars: int
    excluded_count: int
    selector_version: str = "v1"
    selected_reasons: dict[str, list[str]]    # memory_id → list of matched factors
    excluded_reasons: dict[str, str]           # candidate_id → reason for exclusion
```

## 5. 公共接口

```python
# 纯函数 — Agent Core 内部调用
def select_context(
    settings: Settings,
    *,
    task_type: str,
    symbols: list[str] | None = None,
    tags: list[str] | None = None,
    market_scope: str | None = None,
    page_context: str | None = None,   # 保留字段，v1 不参与评分
    max_memories: int = 5,
    max_chars_per_memory: int = 800,
    max_total_chars: int = 3000,
) -> ContextSelectionResult:
    ...
```

## 6. API

```python
class SelectContextRequest(BaseModel):
    task_type: str
    symbols: list[str] | None = None
    tags: list[str] | None = None
    market_scope: str | None = None
    page_context: str | None = None
    max_memories: int = 5
    max_total_chars: int = 3000

@knowledge_router.post("/select-context")
def select_context_endpoint(request: Request, payload: SelectContextRequest) -> dict:
    ...
```

审计：API 调用时写 `memory_context_selected` 事件。
Agent Core 直接调用 `select_context()` 纯函数时不自动写审计——由 Agent Core 自行记录。

## 7. 允许修改的文件

- `apps/trader-agent/backend/app/modules/context_selector.py` — NEW
- `apps/trader-agent/backend/app/api/agent.py` — 新增 `POST /select-context`
- `apps/trader-agent/backend/tests/test_context_selector.py` — NEW
- `apps/trader-agent/backend/tests/test_context_api.py` — NEW

## 8. 禁止修改的范围

- `apps/trader-cockpit/**`
- `config.json`
- 所有已有 modules（`memory_service.py`, `candidate_service.py`, `evidence_ref.py`, 等）
- `document_chunks` / `document_chunks_fts`
- package manager files / frontend files

## 9. 测试

| 测试 | 断言 |
|---|---|
| selects active matching symbol | 输入 symbols=[SPY]，返回包含 SPY 的 memory |
| excludes deprecated/conflicted | status≠active 的不返回 |
| excludes low confidence | confidence < 0.5 不返回 |
| respects max_memories limit | 返回数量 ≤ max_memories |
| respects total_chars budget | total_chars ≤ max_total_chars |
| scores symbol match higher than scope match | 含 symbol 的排在前面 |
| empty result when no match | 返回空列表，不崩溃 |
| task_type preference | market_intent_explanation 优先返回 market_mechanism |
| valid_until expired → excluded | valid_until < now 不返回 |
| API returns 200 with context payload | endpoint 集成正常 |
| audit event written on API call | `memory_context_selected` 事件 |
| M0/M1/M2/M3/M4 regression | 全部已有测试通过 |

## 10. 验收命令

```powershell
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_context_selector.py apps/trader-agent/backend/tests/test_context_api.py -v --tb=short
.venv/Scripts/python.exe -m ruff check apps/trader-agent/backend/app/modules/context_selector.py apps/trader-agent/backend/app/api/agent.py
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_artifact_catalog.py apps/trader-agent/backend/tests/test_markdown_section_indexer.py apps/trader-agent/backend/tests/test_corpus_search.py apps/trader-agent/backend/tests/test_evidence_ref.py apps/trader-agent/backend/tests/test_candidate_extractor.py apps/trader-agent/backend/tests/test_candidate_api.py apps/trader-agent/backend/tests/test_extract_preview.py apps/trader-agent/backend/tests/test_memory_service.py apps/trader-agent/backend/tests/test_memory_api.py -v --tb=short
```

## 11. 完成后文档更新

- [x] 本 plan `Status: done`
- [x] 更新 plans README
