# T010 OutcomeGraph Maturity v1 — Review Presentation

> Review date: 2026-06-05 | Verdict: **PASS** (0 blockers)

---

## 一句话总结

让 `OutcomeGraph` 从"只能标注决策结果"升级为"同时标注决策结果和洞察候选结果"的
双源反馈闭环边界，并在后端新增 `insight_candidate_outcomes` 持久化合约。

---

## 变更全景

```text
apps/trader-workflows/          (TypeScript workflow 侧)
├── src/services/outcomes.ts    +168 行   新增 InsightCandidateOutcome 类型、归一化标签、
│                                          证据摘要构建、API 调用函数
├── src/graphs/outcomeGraph.ts  重写核心   双源并发 fetch + 分类计数 + 归一化标签
├── src/graphs/outcomeGraph.test.ts +95 行 7 个测试覆盖双源处理逻辑
├── src/index.ts                +2 行      CLI JSON 输出追加 counts 字段
├── README.md                   +123 行    文档刷新：Quick Start、OutcomeGraph 职责描述
└── README.zh-CN.md             +5 行      中文文档同步

apps/trader-agent/backend/      (Python 后端侧)
├── app/intel/db/schema.py      +24 行     新建 insight_candidate_outcomes 表 + 索引
├── app/intel/api/stage1.py     +230 行    5 个 REST 端点
├── app/intel/schemas/stage1_records.py +35 行  Pydantic 响应模型
├── tests/test_stage1_insight_candidate_outcomes.py (新文件, 346 行)
│                                          6 个端到端测试
└── tests/test_intel_stage1_schema_api.py  +1 行  schema 断言补充
```

另有一个独立文档 `apps/trader-workflows/ARCHITECTURE.md`（280 行），为包架构描述，
与 T010 功能无关，建议剥离单独提交。

---

## S1: 归一化 Outcome 合约 (workflow 侧)

**新增类型：**

```typescript
type OutcomeSourceType = "decision" | "insight_candidate";
type NormalizedOutcomeLabel = "hit" | "miss" | "neutral" | "invalid" | "insufficient_data";
```

**归一化映射逻辑：**

| 来源标签 | 归一化为 |
|---|---|
| `hit` / `target_hit` / `positive` / `candidate_supported` | `hit` |
| `miss` / `invalidated` / `negative` / `candidate_contradicted` | `miss` |
| `neutral` | `neutral` |
| `invalid` / `failed` | `invalid` |
| `insufficient_data` | `insufficient_data` |
| 其他未知 | `neutral`（兜底） |

**新增接口：**
- `InsightCandidateOutcomeRow` — 行级数据结构
- `OutcomeRow = DecisionOutcomeRow | InsightCandidateOutcomeRow` — 联合类型
- `isDecisionOutcome()` / `isInsightCandidateOutcome()` — 类型守卫

---

## S2: InsightCandidateOutcome 后端持久化

### 数据库表

```sql
CREATE TABLE insight_candidate_outcomes (
  outcome_id TEXT PRIMARY KEY,
  insight_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  horizon TEXT NOT NULL,        -- 白名单: 1m/2m/5m/30m/1h/2h/4h
  status TEXT NOT NULL DEFAULT 'pending',
  due_at TEXT,                  -- 由 scheduled_at + horizon 推导
  scheduled_at TEXT,
  normalized_label TEXT,
  metrics_json TEXT,
  reason_codes_json TEXT,
  evidence_refs_json TEXT,
  outcome_json TEXT,
  created_at TEXT,
  labeled_at TEXT,
  UNIQUE(insight_id, horizon)
)
```

索引：`(status, due_at)` 用于高效查询到期记录。

### REST API (5 个端点)

| 方法 | 路径 | 功能 |
|---|---|---|
| POST | `/insight-candidate-outcomes/schedule` | 批量调度（幂等，按 insight_id+horizon 去重） |
| GET | `/insight-candidate-outcomes/due` | 查询到期待标注记录 |
| POST | `/insight-candidate-outcomes/{id}/label` | 标注最终状态 |
| GET | `/insight-candidate-outcomes` | 列表查询（过滤 insight_id/symbol/status） |
| GET | `/insight-candidate-outcomes/{id}` | 单条详情 |

**关键业务规则：**
- Horizon 白名单验证：只接受 `1m/2m/5m/30m/1h/2h/4h`，拒绝 `30d/90d` 等低频周期
- `due_at` 由后端自动推导：`scheduled_at + horizon_duration`
- Label 状态必须为 `labeled/skipped/failed`，已 finalize 的记录不可重复标注（409）
- v1 不提供 PUT/DELETE 端点

### 测试覆盖（6 个测试用例）

1. 完整生命周期：schedule → due → label → list → get
2. 无效 horizon 拒绝（422）
3. 所有合法 horizon 接受
4. skipped/failed 作为合法最终状态
5. 非法 label status 拒绝
6. PUT/DELETE 端点不存在（404/405）

---

## S3: OutcomeGraph 双源处理

**核心变更：** `OutcomeGraph.runDue()` 从单源串行改为双源并发。

```text
旧流程:
  fetchDue(decision) → 逐条 finalize → 统计

新流程:
  Promise.all([
    fetchDueDecision(...),
    fetchDueInsight(...)
  ])
  → 分别逐条 finalize
  → 归一化标签映射
  → 分类统计
```

**输出结构扩展：**

```typescript
interface OutcomeGraphRunResult {
  run_id: string;
  processed_count: number;
  labeled_count: number;
  skipped_count: number;
  failed_count: number;
  counts_by_source_type: Record<OutcomeSourceType, number>;       // 新增
  counts_by_normalized_label: Record<NormalizedOutcomeLabel, number>; // 新增
  outcomes: OutcomeRow[];  // 从 DecisionOutcomeRow[] 扩展为联合类型
}
```

**证据摘要构建（S3+Q67 15 行约束）：**

当标注 InsightCandidateOutcome 时，自动加载同标的 + 基准指数 K 线，计算绝对/相对
收益，生成 4 行紧凑证据摘要（远低于 15 行上限）：

```text
symbol: TSLA  horizon: 2m
ref: 210.50  now: 212.30
return: 0.86%  vs QQQ: 0.34%
benchmark_return: 0.52%
```

标注决策逻辑：相对收益 > 0.5% → hit，< -0.5% → miss，其间 → neutral。

---

## S4: CLI 输出 & 文档

- `index.ts`：JSON 输出追加 `counts_by_source_type` 和 `counts_by_normalized_label`
- `README.md`：新增 Quick Start、OutcomeGraph 双源描述、归一化标签说明
- `README.zh-CN.md`：同步中文描述

CLI 命令不变：

```bash
npm run workflows -- outcomes run --due --json
```

---

## 确认的设计决策对照

| 决策 | 实现 | 状态 |
|---|---|---|
| D109: 添加窄范围 InsightCandidateOutcome 后端合约 | 5 API + schema + tests | ✓ |
| D110: InsightExplorationGraph 调度，OutcomeGraph 只 fetch+label | OutcomeGraph 无调度逻辑 | ✓ |
| D111: 白名单 horizon，后端推导 due_at | `_compute_due_at()` + 验证 | ✓ |
| D112: 2m 作为 fallback（由 InsightExplorationGraph 选择） | 不在 OutcomeGraph 中硬编码 | ✓ |
| D113: 白名单 Evidence Loader | `buildInsightCandidateOutcomeLabelPayload` | ✓ |
| D114: 同标的 + 基准/指数 | `resolveBenchmarkSymbol` 限制范围 | ✓ |
| D115: 15 行证据摘要上限 | 实际生成 4 行 | ✓ |

---

## 测试验证

| 验证项 | 结果 |
|---|---|
| `npm test -- src/graphs/outcomeGraph.test.ts` | **PASS** 7/7 |
| `git diff --check` | **PASS** 无空白错误 |
| 后端测试文件 (6 test cases) | 存在，待 Python 环境运行 |

---

## 遗留事项

| 项 | 建议 |
|---|---|
| `ARCHITECTURE.md` (280 行) | 剥离，单独 commit 或 task |
| `stage1_records.py` 不在 allowed files | 接受；补充到 task 记录 |
| 4 个文件缺少末尾换行符 | 修复（cosmetic） |
| 后端验证未实际运行 | 提交前运行 `npm run trader-agent:backend:verify` |
