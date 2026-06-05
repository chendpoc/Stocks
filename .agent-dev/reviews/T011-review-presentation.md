# T011 EvaluationGraph Maturity v1 — Review Presentation

> Review date: 2026-06-05 | Verdict: **PASS** (0 blockers, 1 warning)

---

## 一句话总结

让 `EvaluationGraph` 从"只聚合决策 outcome 指标"升级为"同时消费决策和洞察候选
outcome、输出结构化反馈 sections"的可审阅评估报告，为后续 reflection 和 insight
exploration 成熟化提供输入。

---

## 变更全景

```text
apps/trader-workflows/                              (+410 / -10)
├── src/services/evaluation.ts        +257 行   新增类型、归一化摘要构建、
│                                                sections 聚合、insight outcome fetch
├── src/services/evaluation.test.ts   +54 行    buildEvaluationReportSections 单元测试
├── src/graphs/02-evaluation/
│   └── evaluationGraph.test.ts       +90 行    sections 内容/边界/安全不变量测试
├── src/index.ts                      +1 行     CLI envelope 追加 sections 字段
├── README.md                         +10/-3    EvaluationGraph 职责更新
└── README.zh-CN.md                   +8/-2     中文同步
```

Graph 结构层（`evaluationGraph.ts`、`evaluationGraph.nodes.ts`、
`evaluationGraph.state.ts`）**无变更** — sections 逻辑保持在 service 层，通过现有
`deps.build` 调用链透传，避免了不必要的图结构修改。

---

## S1: 输入合约扩展

**新增归一化摘要类型：**

```typescript
interface DecisionOutcomeSummary {
  decision_id: string;
  symbol: string;
  horizon: string;
  path: string;
  normalized_label: NormalizedOutcomeLabel;
  relative_return_pct: number | null;
  absolute_return_pct: number | null;
}

interface InsightCandidateOutcomeSummary {
  outcome_id: string;
  insight_id: string;
  symbol: string;
  horizon: string;
  normalized_label: NormalizedOutcomeLabel;
  reason_codes: string[];
}
```

**新增数据获取：**

```typescript
fetchInsightCandidateOutcomesForEvaluation({symbol?, limit?})
// → GET /insight-candidate-outcomes?status=labeled&...
```

**buildEvaluationReport 扩展为三路并发：**

```text
旧流程: Promise.all([fetchDecisionOutcomes, fetchModelDecisions])
新流程: Promise.all([fetchDecisionOutcomes, fetchModelDecisions, fetchInsightCandidateOutcomes])
```

---

## S2: 结构化 Report Sections

**新增 `EvaluationReportSections` 接口：**

```typescript
interface EvaluationReportSections {
  decision_performance: {
    total: number;
    by_label: Record<string, number>;
    mean_relative_return_pct: number | null;
    mean_absolute_return_pct: number | null;
  };
  insight_candidate_performance: {
    total: number;
    by_label: Record<string, number>;
    hit_rate: number | null;
  };
  top_positive_patterns: string[];   // ≤5 条
  top_negative_patterns: string[];   // ≤5 条
  failure_modes: string[];           // ≤5 条
  data_gaps: string[];               // ≤5 条
  evidence_refs: string[];           // ≤10 条
}
```

**Sections 构建逻辑（`buildEvaluationReportSections`）：**


| Section                         | 数据来源                                 | 算法                                                |
| ------------------------------- | ------------------------------------ | ------------------------------------------------- |
| `decision_performance`          | labeled decision outcomes            | normalize → count by label, mean returns          |
| `insight_candidate_performance` | labeled insight candidate outcomes   | normalize → count by label, hit_rate = hits/total |
| `top_positive_patterns`         | hit decisions + hit insights         | 按 symbol 聚合，取 top-3 symbols                       |
| `top_negative_patterns`         | miss decisions + miss insights       | 同上                                                |
| `failure_modes`                 | invalid + insufficient_data outcomes | 计数描述                                              |
| `data_gaps`                     | skipped decisions + empty summaries  | 计数描述                                              |
| `evidence_refs`                 | all summaries                        | source counts + symbol coverage                   |


**所有数组输出有硬上限（5 或 10 条），不含原始 bars、快照、模型 trace。**

---

## S3: 安全不变量


| 不变量                                        | 实现方式                                         | 测试断言            |
| ------------------------------------------ | -------------------------------------------- | --------------- |
| `auto_promotion = false`                   | `report_json.auto_promotion` 硬编码 false       | ✓ 每次 persist 断言 |
| `recommendation ∈ {hold, needs_more_data}` | `deriveRecommendation` 只返回这两值                | ✓ 双值循环断言        |
| 无 RulePack mutation                        | 无任何 RulePack 导入或调用                           | ✓ 禁止 API 断言     |
| dry-run 跳过持久化                              | `persist: false` 时 `persisted_report = null` | ✓ 现有测试覆盖        |
| sections 有界                                | 每个数组 ≤5/10                                   | ✓ 新增 bounded 测试 |


---

## S4: CLI 输出 & 文档

**CLI 输出 envelope 新增字段：**

```json
{
  "data": {
    "report_id": "...",
    "recommendation": "hold",
    "metrics_json": { ... },
    "sections": {              // ← 新增
      "decision_performance": { ... },
      "insight_candidate_performance": { ... },
      "top_positive_patterns": [...],
      "top_negative_patterns": [...],
      "failure_modes": [...],
      "data_gaps": [...],
      "evidence_refs": [...]
    },
    "report_json": { ... },
    "persisted_report": { ... }
  }
}
```

CLI 命令不变：

```bash
npm run workflows -- eval summary --symbol TSLA.US --json
```

**README 更新（EN + zh-CN）：** 职责描述从"聚合 outcome 与决策表现"更新为
包含 7 个 sections 的完整描述，recommendation 枚举明确标注。

---

## 确认的设计决策对照


| 决策                                                                                               | 实现                                        | 状态  |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------- | --- |
| D105: EvaluationGraph v1 输出 metrics + strengths/weaknesses/failure modes/data gaps/evidence refs | `EvaluationReportSections` 完整实现           | ✓   |
| D102: v1 反馈源仅 DecisionGraph 和 InsightExplorationGraph                                            | 只消费 decision + insight_candidate outcomes | ✓   |
| D107: 不迁移到 native LangGraph（本任务）                                                                 | graph 层无修改                                | ✓   |
| D108: 实现顺序 Outcome → Evaluation → Insight                                                        | T011 依赖 T010 outcome 类型                   | ✓   |


---

## 测试验证


| 验证项                                                               | 结果             |
| ----------------------------------------------------------------- | -------------- |
| `npx tsx --test src/graphs/02-evaluation/evaluationGraph.test.ts` | **PASS** 9/9   |
| `npm test`（完整 workflow 套件）                                        | **PASS** 87/87 |
| `git diff --check`                                                | **PASS** 无空白错误 |
| `node --test test/docs-ai-context.test.mjs`                       | **PASS** 11/11 |


---

## 架构亮点

```text
EvaluationGraph (graph 层)
  └── deps.build = buildEvaluationReport (service 层)
        ├── fetchDecisionOutcomes
        ├── fetchModelDecisions
        ├── fetchInsightCandidateOutcomes    ← 新增
        └── buildEvaluationReportPayload
              ├── aggregateEvaluationMetrics  (已有 metrics_json)
              └── buildEvaluationReportSections  ← 新增
                    ├── toDecisionOutcomeSummaries
                    ├── toInsightCandidateOutcomeSummaries
                    ├── detectPositivePatterns
                    ├── detectNegativePatterns
                    ├── detectFailureModes
                    ├── detectDataGaps
                    └── collectEvidenceRefs
```

**设计优势：** sections 逻辑完全在 service 层闭合，graph 层零修改 —— 保持了
LangGraph 节点的极简职责，同时让 report 内容可独立测试和扩展。

---

## Review Findings


| ID   | Severity | Rule            | 描述                                                     |
| ---- | -------- | --------------- | ------------------------------------------------------ |
| F001 | warning  | scope_violation | `evaluation.test.ts` 未在 task Allowed Files 中声明（实际修改合理） |
| F002 | info     | —               | sections 使用文本描述模式而非结构化 enum，未来可升级                      |
| F003 | info     | —               | `detectPositivePatterns` 可随数据量增长升级为 TopN 频率排序          |


---

## 遗留事项


| 项                                | 建议                                    |
| -------------------------------- | ------------------------------------- |
| `evaluation.test.ts` scope 声明    | 补充到 T011 task Allowed Files（cosmetic） |
| T011/T012 task docs 收尾 | 2026-06-05 已完成；T010 task JSON 仍待 M0 全闭环同步 |
| Pattern 检测算法简单                   | v2 可升级为频率/收益率加权排序                     |
| InsightCandidateOutcome 空集时      | sections 正确返回空数组 + data_gaps 提示，无异常   |


