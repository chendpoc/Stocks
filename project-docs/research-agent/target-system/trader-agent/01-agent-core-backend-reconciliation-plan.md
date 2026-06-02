# Agent Core → Shared Memory Reconciliation Plan

Status: confirmed
Owner: codex
Created: 2026-05-29
Confirmed: 2026-05-29 (all 5 user decisions resolved + 3 technical derivations)

## Specification Gate Check

- [x] Source checked — 审计报告 16/16 modules ✓, M0-M6 代码 ✓
- [x] Decisions frozen — 5 user ✓ + 3 technical ✓
- [x] Scope bounded — 14 files + 1 doc
- [x] Verification mapped — per-phase 验收命令
- [x] Prompt self-contained — worker prompts per phase
- [x] Behavior preserved — 管线逻辑不改，只改类型 + 新增调用（R0-R2 已完成）

## Implementation Status（2026-05-29）

| Phase | 状态 | 验证 |
|---|---|---|
| R0 | ✅ 已完成（工作区未提交） | `test_signal_pipeline.py` + `test_runtime_orchestrator.py` 21 passed；ruff 6 modules OK |
| R1 | ✅ 已完成 | `memory_context_selected`、高置信度 `create_candidates`、playbook→`create_memory_item` |
| R2 | ✅ 已完成 | `signal_persisted` + `record_agent_event`；`07-audit-and-rebuild-workflow.md` Pipeline 事件表 |
| R3 | ⏸ 待评估 | 按计划 R0-R2 稳定后再做 |

## Pre-plan Decision Inventory

### 用户确认

| # | 决策 | 结论 |
|---|---|---|
| 1 | R0 EvidenceRef 标准化 | 做。所有后续修复的前提 |
| 2 | 高置信度信号回流阈值 | score >= 0.7 自动创建 candidate，不自动激活 |
| 3 | playbook 对接 memory_items | 适合。playbook = trading_rule 类型 memory_item |
| 4 | 事件名 | 追加到 canonical registry，标记来源（Memory / Pipeline） |
| 5 | R3 | R0-R2 先做，R3 之后评估 |

### 技术推导

| # | 决策 | 依据 |
|---|---|---|
| 6 | R0 必须最先做 | 其他 phase 依赖统一 EvidenceRef 类型 |
| 7 | `_evidence_ref()` 改为构造 EvidenceRef | M3 `evidence_ref.py` 已提供 RefType 枚举 |
| 8 | signal_manager 直接 INSERT 改 `record_agent_event()` | events.py 已实现 JSONL mirror 和标准路径 |

---

## 审计结论

16 个 Agent Core 模块**全部未对接** M0-M6 设施。每层有自己的一套证据引用、日志和存储方式。

需修复的问题分三个等级：

| 等级 | 数量 | 说明 |
|---|---|---|
| CRITICAL | 3 | 阻断性——不改会持续产生格式不一致 |
| SIGNIFICANT | 2 | 重要——绕过标准设施，但不阻断 |
| MODERATE | 4 | 优化——功能可工作但质量受限 |

## Reconciliation Phases

### R0: EvidenceRef 标准化（CRITICAL → 3 modules）

**问题：** `market_snapshot.py` 定义了 `_evidence_ref(provider, symbol, timestamp) -> str`，输出 `"provider:symbol:timestamp"` 冒号分隔字符串。这个格式被 `MarketSnapshot.evidence_refs: list[str]` 携带，传播到 `setup_detection → rule_engine → scoring → signal_manager` 整条管线。

**修复：**

| 文件 | 改动 |
|---|---|
| `market_snapshot.py` | `evidence_refs: list[str]` → `list[EvidenceRef]`。`_evidence_ref()` 改为构造 `EvidenceRef(ref_type=RefType.NEWS_ARCHIVE 或 RAW_CHAT_MESSAGE)` |
| `setup_detection.py` | `SetupCandidate.evidence_refs: list[str]` → `list[EvidenceRef]`。`_refs()` helper 删除 |
| `rule_engine.py` | `candidate_evidence_refs` 组件从 `list[str]` 改为 `list[dict]`（EvidenceRef.as_dict()） |
| `scoring.py` | `_evidence_quality()` 从 `len(candidate.evidence_refs)` 改为 `EvidenceRef.resolve()` 验证 |
| `signal_manager.py` | `_evidence()` 序列化 EvidenceRef.as_dict() 而非 raw strings |
| `runtime_orchestrator.py` | evidence_refs 收集逻辑适配 EvidenceRef 对象 |

**冲击范围：** 管线上下游 6 个文件。改动集中在类型签名和序列化，不影响核心逻辑。

**验收：** `test_market_snapshot.py` / `test_setup_detection.py` / `test_scoring.py` 的 evidence_ref 断言更新。全量回归。（注：上述三文件不存在，断言已并入 `test_signal_pipeline.py`。）

**状态：** ✅ 已实现

---

### R1: 管线记忆注入（CRITICAL → 2 modules）

**问题：** `runtime_orchestrator.py` 运行 symbol scan 时从不查询已有记忆。`playbook.py` 的输出不回流到 `memory_items`。

**修复：**

| 文件 | 改动 |
|---|---|
| `runtime_orchestrator.py` | `run_symbol()` 在 `build_market_snapshot()` 之前调用 `select_context(symbols=[symbol])`，将返回的 ContextMemory 列表传给下游 |
| `signal_manager.py` | `persist_signal()` 之后，调用 `create_memory_item()` 或 `activate_candidate()` 将高置信度信号（score > 阈值）自动回流为 memory candidate |
| `playbook.py` | `aggregate_playbooks()` 输出时，为每条 playbook 检查是否已有对应的 memory_item。如果没有，调 `create_memory_item()` |

**冲击范围：** 3 个文件。新增调用，不改变现有逻辑流程。

**R1 范围说明（memory_context）：**

- `run_symbol()` 在 `build_market_snapshot()` 之前调用 `select_context()`，将 `memory_context` 写入 **symbol result dict** 与 **`memory_context_selected` agent_event**，供 observability 与 audit 回放。
- **不**将 `memory_context` 传入 `rule_engine` / `scoring` / `evaluate_candidate_rule()` — 记忆参与规则判定与评分属于 **R3**（`rule_engine` pending 条件 + `select_context` 联动）。
- 实现以 [01-agent-core-backend-reconciliation-worker-r1.md](./01-agent-core-backend-reconciliation-worker-r1.md) 为准；勿在本 phase 做 scoring 集成。

**验收：** runtime_orchestrator 在 scan 前后 agent_events 包含 `memory_context_selected`。高置信度信号自动创建 memory_items。symbol result（含 failed path）均含 `memory_context` 键（成功为选中记忆列表，失败为 `[]`）。

**状态：** ✅ 已实现（高置信度经 `create_candidates` 写入 `memory_candidates`，阈值 `total_score/max_weight >= 0.7`）

---

### R2: 事件名规范化（SIGNIFICANT → 2 modules + 全局）

**问题：** 16 个模块用的全部是自己定义的 `"module_name.action"` 格式事件名。canonical registry 里没有这些名字。`signal_manager.py` 甚至绕过 `record_agent_event()` 直接插 `agent_events`。

**修复：**

| 文件 | 改动 |
|---|---|
| `signal_manager.py` | 替换直接 insert → `record_agent_event()` |
| 全局（16 modules） | 不需要重命名已有事件——已有事件名反映的是 Phase 1C 管线自己的语义，和 M0-M6 不重叠。**向 canonical registry 追加以下 10 个 Phase 1C 事件：** `corpus_import_started`, `corpus_import_completed`, `semantic_extraction_completed`, `market_context_completed`, `outcome_labeling_completed`, `playbook_aggregation_completed`, `rule_discovery_candidate_created`, `rule_discovery_lite_backtest_completed`, `runtime_orchestrator_run_started`, `runtime_orchestrator_run_completed`, `signal_persisted`, `structured_model_call_completed` |

**冲击范围：** 1 个 bug fix + 1 份文档追加（`07-audit-and-rebuild-workflow.md` 的 canonical event registry）。

**验收：** `signal_manager.py` 中的直接 INSERT 消失。Canonical registry 包含 Phase 1C 事件。

**状态：** ✅ 已实现

---

### R3: 证据解析 + 联动增强（MODERATE → 4 modules）

**问题：** `structured_model_calls.py` 用的 `evidence_ids: list[str]` 是黑盒字符串。`scoring.py` 的证据质量评分只数数量。`rule_engine.py` 可用 select_context 解决 pending 条件。`rule_discovery.py` 的证据 ref 是 dict 格式。

**修复：**

| 文件 | 改动 |
|---|---|
| `structured_model_calls.py` | `evidence_ids: list[str]` → `evidence_refs: list[EvidenceRef]`。在发送 LLM 请求前，调 `EvidenceRef.resolve()` 并附加实际文本内容 |
| `scoring.py` | `_evidence_quality()` 改为：对每个 EvidenceRef 调 `resolve()`，统计 resolved/stale/unresolved 比例，作为质量分 |
| `rule_engine.py` | `_evaluate_required_condition()` 遇到 pending 时，调 `select_context()` 检查是否有 memory_item 提供替代判断 |
| `rule_discovery.py` | `evidence_refs: list[dict]` → `list[EvidenceRef]`。事件名追加到 canonical registry（R2 已覆盖） |

**冲击范围：** 4 个文件。增强性质，不改现有逻辑主干。

**验收：** structured_model_calls 在 prompt 中包含实际 evidence 内容。rule_engine pending 条件能被 memory 解决。

---

## 执行顺序与依赖

```
R0 (EvidenceRef 标准化)
  因为 6 个文件共享同一个 evidence_refs 格式，R0 是 R1-R3 的前提。
  必须先做。
    ↓
R1 (管线记忆注入)
  依赖 R0 的类型变更，但逻辑是增量——新增调用，不改主线。
    ↓
R2 (事件名规范化)
  独立可并行，但 signal_manager 的直接 INSERT 修复需要等 R0/R1 的改动稳定后。
    ↓
R3 (证据解析 + 联动增强)
  依赖 R0 类型 + R1 的 memory_items 可用。最后做。
```

## 工作量

| Phase | 文件数 | 性质 | 风险 |
|---|---|---|---|
| R0 | 6 | 类型 + 接口变更 | 中——管线级联 |
| R1 | 3 | 增量调用 | 低——新代码，不改旧逻辑 |
| R2 | 1 + 1 doc | Bug fix + 文档 | 极低 |
| R3 | 4 | 增强 | 低——可选功能增强 |
| **Total** | **14 + 1 doc** | | |

---

## 验收总览

| Phase | 验收命令 | 回归范围 |
|---|---|---|
| R0 | `pytest tests/test_market_snapshot.py tests/test_setup_detection.py tests/test_scoring.py tests/test_signal_pipeline.py tests/test_runtime_orchestrator.py` | 全量 |
| R1 | `pytest tests/test_runtime_orchestrator.py tests/test_signal_pipeline.py` | 全量 |
| R2 | `pytest tests/test_agent_events.py` | 全量 |
| R3 | `pytest tests/test_structured_model_calls.py tests/test_scoring.py tests/test_rule_discovery_lite_backtest.py` | 全量 |
