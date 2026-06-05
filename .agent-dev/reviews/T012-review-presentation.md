# T012 InsightExplorationGraph Maturity v1 — Review Presentation

> Review date: 2026-06-05 | Verdict: **PASS** (0 blockers)

---

## 一句话总结

让 `InsightExplorationGraph` 从「基于 context/outcome 的探索」升级为「评估报告驱动、
持久化 InsightCandidate 后自动调度 InsightCandidateOutcome、并与 Stage1 契约对齐」
的反馈闭环上游，为后续 AlphaResearchGraph 提供有边界的候选 insight。

---

## 变更全景

```text
apps/trader-workflows/                              (T012 拆分提交)
├── src/services/insightCandidates.ts   +76 行    EvaluationReport 输入、origin_category、
│                                                horizon 白名单、candidate_json 元数据
├── src/services/outcomes.ts            +39 行    scheduleInsightCandidateOutcome
│                                                + Stage1 { outcomes: [...] } envelope
├── src/graphs/03-insightExploration/
│   ├── insightExplorationGraph.nodes.ts +108 行 persist→schedule、InsightSchedulingError
│   ├── insightExplorationGraph.state.ts  +12 行 evaluation_report / scheduled_outcome 状态
│   ├── insightExplorationGraph.types.ts   +9 行 deps 与 graph input 扩展
│   └── insightExplorationGraph.test.ts  +552 行 S1-S4 + scheduling + partial-failure 测试
├── src/index.ts                         +2 行   insights explore CLI 输出 scheduled_outcome_*
├── README.md / README.zh-CN.md          更新     Stage1 契约、CLI、recovery 语义
└── .agent-dev/tasks/*.json|.md          收尾     T011/T012 status + review 证据链
```

提交序列：`f48ab876` → `20aa5b3e` → `b02d8a60` → `e055da94` → `d4a50bfc`

---

## S1: EvaluationReport 驱动输入

- 图输入支持可选 `evaluation_report_id`
- `fetchEvaluationReport` 失败不阻断主路径（非 fatal）
- `deriveOriginCategory` 从 report sections 映射
  `failure_mode | positive_pattern | data_gap | mixed`

---

## S2: InsightCandidate 合约

探索元数据写入 `candidate_json`（**非** Stage1 顶层列）：

```text
origin_category
horizon: 1m | 2m | 5m | 30m | 1h | 2h | 4h
horizon_source: explicit | default_2m
auto_promotion: false
verification_status: pending
```

`resolveInsightHorizon` 对非白名单/缺失 horizon 回退 `2m`。

---

## S3: 持久化后调度 Outcome

流程：`persist_insight_candidate` → `scheduleOutcome`

**Stage1 schedule 契约（F001 修复后）：**

```json
{
  "outcomes": [{
    "insight_id": "...",
    "symbol": "NVDA",
    "horizon": "2m",
    "evidence_refs_json": [],
    "reason_codes_json": [],
    "outcome_json": {}
  }]
}
```

响应：`{ "items": [...], "count": N }`，取 `items[0]` 映射为 `scheduled_outcome`。

**Partial-failure 语义：**

- 持久化成功、调度失败 → 抛出 `InsightSchedulingError`
- 含 `insight_id`、`horizon`、`persisted: true`、`schedulePayload`、`cause`
- 恢复：对相同 `insight_id` + `horizon` 幂等重试 schedule（不静默降级）

---

## S4: 安全不变量

测试覆盖：

- 禁止 lesson/trade/train/promote API 路径
- 不直接读取 raw market/news 路径
- 不生成 `RuleCandidate`
- weight cap 与 `auto_promotion: false` 保持

---

## S5: CLI / Docs

`insights explore` envelope 追加：

```text
scheduled_outcome_id
scheduled_outcome_horizon
persisted_candidate
```

README 记录 eval summary `sections` 与 insight explore Stage1 契约。

---

## 验证结果

| 命令 | 结果 |
|---|---|
| `npx tsx --test src/graphs/03-insightExploration/insightExplorationGraph.test.ts` | **PASS** 19/19 |
| `cd apps/trader-workflows && npm test` | **PASS** 101/101 |
| `git diff --check`（scoped） | **PASS** |

---

## Review Findings（已关闭）

| ID | 初始 severity | 处理 |
|---|---|---|
| W1 | warning | schedule 在 persist 后失败会导致节点崩溃且 candidate 已入库 → 采用显式 `InsightSchedulingError` + 恢复指引 |
| W2 | warning | 缺少 schedule 失败路径测试 → 已补 `S3: scheduleOutcome failure after persist...` |
| F001 | blocker（契约） | schedule body 改为 `{ outcomes: [...] }` + `_json` 字段 |
| F002 | blocker（契约） | `origin_category`/`horizon`/`horizon_source` 移入 `candidate_json` |

---

## 遗留事项

| 项 | 建议 |
|---|---|
| T010 task JSON 仍为 `pending` | M0 全闭环收尾时单独同步（非 T012 scope） |
| `evaluation_report_id` CLI flag | v2 若需要再暴露；当前为 graph/Studio 输入 |
| 后端集成 pytest | 记录环境 blocker；workflow 侧契约与单测已对齐 |
