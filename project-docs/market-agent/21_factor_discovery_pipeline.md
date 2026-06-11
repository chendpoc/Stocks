# 21. Factor Discovery Pipeline — 自动化因子挖掘流水线

> 状态: design | 依赖: `03_memory_system_design.md`, `08_outcome_and_evaluation.md`, `09_pattern_memory_and_learning.md`

## 1. 文档目的

**设计哲学修正**：之前的 `InsightExplorationGraph` 把 LLM 解释放在发现之前——这是错误的。每个候选因子的解释消耗 Token 但不增加预测力，且 90% 的候选会在验证阶段被淘汰，其解释文本白写。

**正确的顺序**：数据聚合 → 回测验证 → 筛选有效因子 → 晋升 → 用户需要时才调 LLM 解释。

**参考**：microsoft/RD-Agent (Q) —— 因子公式自动生成 → 回测 → 评估 → 通过/丢弃，只有最后给人看的报告阶段才做自然语言解释。

---

## 2. 设计哲学

```
┌─────────────────────────────────────────────────────────┐
│  因子发现层（零 LLM）                                      │
│  SQL 聚合 + 统计计算 —— 不需要理解，只需要计算               │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────┐   │
│  │ 条件组合  │ → │ 回测验证   │ → │ 筛选 (p-value)    │   │
│  │ 生成      │    │          │    │                  │   │
│  └──────────┘    └──────────┘    └────────┬─────────┘   │
│                                           │ 通过         │
├───────────────────────────────────────────┼─────────────┤
│  PatternMemory 层                         ↓             │
│  存储: 条件 + 回测证据（JSON）——无自然语言                 │
│  ┌──────────────────────────────────────────────────┐   │
│  │ { setup, conditions, win_rate, sample, Sharpe }  │   │
│  └──────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  展示层（按需 LLM）                                       │
│  用户问"为什么？"→ LLM 生成一次解释                       │
│  ┌──────────────────────────────────────────────────┐   │
│  │ "TSLA VWAP Reclaim 在 trending 市场 + QQQ 上行时  │   │
│  │  胜率 72%，因为大盘趋势为突破提供了动量支持..."      │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 分层架构

```
Layer 1: Factor Generation（零 LLM）
  → 纯 SQL 聚合 + 组合枚举
  → 输出: 结构化 FactorCandidate[]

Layer 2: Backtest Validation（零 LLM）
  → 查询 decision_outcomes 验证每个候选的统计表现
  → 输出: ValidatedFactor[]

Layer 3: Promotion（零 LLM）
  → 筛选有效因子 → 写入 PatternMemory
  → 附带回测证据 JSON

Layer 4: Explanation（按需 LLM）
  → 仅在用户问"为什么因子 X 有效"时调用
  → 一次性生成自然语言解释
```

---

## 4. Layer 1 — Factor Generation（SQL 聚合）

**输入**：`decision_outcomes` 表（已有的回标数据）

**方法**：枚举条件组合 + GROUP BY 聚合，不调用 LLM。

```sql
-- 示例: 按 symbol + setup + market_regime 三维聚合
SELECT
    symbol,
    setup_name,
    market_regime,
    COUNT(*) AS sample_size,
    SUM(CASE WHEN normalized_label = 'hit' THEN 1 ELSE 0 END) * 1.0 / COUNT(*) AS win_rate,
    AVG(CASE WHEN mae IS NOT NULL THEN mae END) AS avg_mae,
    AVG(CASE WHEN mfe IS NOT NULL THEN mfe END) AS avg_mfe
FROM decision_outcomes
WHERE created_at >= DATE('now', '-90 days')
  AND normalized_label IS NOT NULL
GROUP BY symbol, setup_name, market_regime
HAVING COUNT(*) >= 10
ORDER BY win_rate DESC;
```

**多维组合枚举**：

| 维度 | 可选值 | 组合方式 |
|---|---|---|
| symbol | 所有标的 | 笛卡尔积 |
| setup_name | VWAP_Reclaim, RS_Pullback, ORB, Gap_Hold, Daily_Breakout_Retest | × |
| market_regime | trending, ranging, volatile | × |
| 基准位置 | above_vwap, below_vwap（需额外计算） | × |
| 量比 | vol_ratio_high (>1.5x avg), normal | × |

**枚举量控制**：如果全部组合 > 100，优先枚举高频组合（sample_size 要求随组合复杂度递减）。

**输出**：

```typescript
interface FactorCandidate {
  /** 组合键: "TSLA:VWAP_Reclaim:trending" */
  composite_key: string;
  conditions: {
    symbol: string;
    setup_name: string;
    market_regime: string;
    benchmark_position?: string;
    volume_ratio_bucket?: string;
  };
  stats: {
    sample_size: number;
    win_rate: number;
    avg_mae: number;
    avg_mfe: number;
  };
}
```

---

## 5. Layer 2 — Backtest Validation（统计验证）

**目标**：判断一个因子的表现是否显著优于基准。

**基准定义**：

```typescript
const BASELINE: Record<string, number> = {
  // setup 级别基准胜率（全市场、全 regime）
  "VWAP_Reclaim": 0.55,
  "RS_Pullback": 0.48,
  "ORB": 0.52,
  "Gap_Hold": 0.56,
  "Daily_Breakout_Retest": 0.50,
};
```

**验证规则**：

| 规则 | 条件 | 说明 |
|---|---|---|
| **样本量下限** | `sample_size >= 10` | 少于 10 条的统计无意义 |
| **胜率显著提升** | `win_rate > baseline + margin` | margin 默认为 0.05（5 个百分点） |
| **MFE/MAE 比** | `avg_mfe / abs(avg_mae) > 1.5` | 上行空间 > 下行风险的 1.5 倍 |
| **p-value** | 二项检验 p < 0.10 | 不要求学术级 p<0.05——交易中样本有限 |

**输出**：

```typescript
interface ValidatedFactor extends FactorCandidate {
  validation: {
    passed: boolean;
    baseline_win_rate: number;
    win_rate_delta: number;
    mfe_mae_ratio: number;
    p_value: number;
    reject_reasons?: string[];      // 未通过的原因
  };
}
```

---

## 6. Layer 3 — Promotion to PatternMemory

**晋升规则**：

| 条件 | 操作 |
|---|---|
| `validated && win_rate_delta > 0.05` | 创建 InsightCandidate (status: testing) |
| `InsightCandidate` + 后续 30 天 `win_rate` 仍保持 | 人工审批 → PatternMemory (status: active) |
| `win_rate_delta > 0.10 && sample >= 20` | 直接标记为 `promising`，优先人工审查 |

**PatternMemory 结构（无自然语言）**：

```json
{
  "pattern_memory_id": "auto_F7B3_VWAP_Reclaim_TSLA",
  "symbol": "TSLA",
  "pattern_id": "VWAP_Reclaim",
  "confidence": 0.72,
  "memory_json": {
    "conditions": {
      "market_regime": "trending",
      "benchmark_position": "above_vwap",
      "volume_ratio_bucket": "high"
    },
    "backtest_evidence": {
      "sample_size": 18,
      "win_rate": 0.72,
      "baseline_win_rate": 0.55,
      "win_rate_delta": 0.17,
      "avg_mfe": 0.023,
      "avg_mae": -0.008,
      "mfe_mae_ratio": 2.87,
      "p_value": 0.04,
      "observation_start": "2026-04-01",
      "observation_end": "2026-06-30"
    }
  },
  "evidence_refs_json": [
    "decision_outcomes: 18 labeled records for TSLA+VWAP_Reclaim+trending"
  ],
  "status": "active",
  "source": "factor_discovery_pipeline"
}
```

**关键原则**：
- `memory_json` 只存**量化的回测证据**，不存自然语言解释
- `evidence_refs_json` 指向原始数据——任何结论可追溯到具体记录
- 状态变更通过 `pattern_status_events` 表记录完整历史（已有机制）

---

## 7. Layer 4 — On-demand Explanation（按需 LLM）

**触发时机**：用户在 CLI 中问"因子 X 为什么有效？"时。

```bash
trader pattern explain auto_F7B3_VWAP_Reclaim_TSLA
```

**LLM 输入**（结构化，不给自然语言，全给数据）：

```
因子: TSLA + VWAP_Reclaim + trending 市场
回测证据:
  - 样本量: 18
  - 胜率: 72% (基准: 55%)
  - MFE/MAE 比: 2.87
  - p-value: 0.04
  - 观察期: 2026-04-01 到 2026-06-30
  - 最近 5 条实际案例: [hit, hit, miss, hit, hit]

请用 ≤200 字解释为什么这个因子可能有效。
```

**LLM 输出**：一次性生成的自然语言解释——**不存回数据库**，仅供用户阅读。

---

## 8. 与 InsightExplorationGraph 的关系

**InsightExplorationGraph 保留**，但用途调整：

| 模式 | 触发 | 用途 |
|---|---|---|
| **人工探索**（已有） | `trader workflow run insightExploration --symbol TSLA --prompt "检查 ORB 在震荡市的表现"` | 用户已有直觉时，深入探索 |
| **自动发现**（新增） | Daemon 每日触发 / `trader workflow run insightExploration --auto` | 无人工干预的批量因子挖掘 |

自动发现模式**不走 InsightExplorationGraph 的 LLM 节点**——走的是本文档定义的纯 SQL Pipeline。

---

## 9. 实施计划

### Phase 1 — 最小可行产品（当前迭代）

```
1. SQL 聚合查询（5 维枚举: symbol + setup + regime + benchmark + volume）
2. 统计验证（sample >= 10 + win_rate > baseline + 5% + MFE/MAE > 1.5）
3. 通过验证的候选 → 创建 InsightCandidate (status: testing)
4. 人工审批命令: trader insights list --source=factor_discovery
```

### Phase 2 — 迭代优化

```
5. p-value 二项检验
6. 跨时间窗口稳健性检查（滑动窗口验证）
7. 因子相关性去重（相似条件组合的因子合并）
8. 自动提升：InsightCandidate 后续 30 天保持 → 自动标记为 promising
```

### Phase 3 — 解释层

```
9. trader pattern explain <id> — 按需 LLM 解释
10. 因子表现仪表板: trader insights dashboard
```

---

## 10. 与 RD-Agent (Q) 的对照

| 维度 | RD-Agent (Q) | 我们的 Pipeline |
|---|---|---|
| **因子类型** | 数学公式（`momentum_20d = ...`） | 条件组合（`symbol + setup + regime + ...`） |
| **生成方式** | LLM 生成 Python 代码 | SQL GROUP BY 枚举 |
| **验证方式** | 在历史 K 线上跑回测 | 查询 decision_outcomes |
| **迭代方式** | 反馈循环（数千次） | 每日批量运行 |
| **成本** | ~$10/次 | ~$0（纯 SQL + 统计） |
| **安全边界** | 因子可自动部署 | **绝不自动上线，必走人工审批** |
| **解释** | 报告阶段 | 按需调用 |

---

## 11. 关键决策汇总

| 决策 | 选型 | 理由 |
|---|---|---|
| 因子生成 | 纯 SQL GROUP BY | 零 LLM 成本，确定性，可复现 |
| 验证方式 | 查询 decision_outcomes | 已有回标数据，不需重新计算 |
| LLM 解释位置 | 展示层，按需 | 解释不增加预测力，不应在发现阶段消耗 Token |
| 最小样本量 | 10 | 低于 10 条的统计无意义 |
| 胜率提升阈值 | 基准 + 5% | 太小无交易价值，太大样本不够 |
| 自动上线 | **禁止** | 所有因子必须经过人工审批 |

---

## 12. 验收标准

### Phase 1 完成后：

- [ ] SQL 聚合查询能生成所有有效条件组合的候选因子
- [ ] 统计验证滤掉了 sample < 10 的候选
- [ ] `trader insights list --source=factor_discovery` 能看到通过的候选
- [ ] PatternMemory 中 `source = "factor_discovery_pipeline"` 的条目只包含量化证据，不含自然语言解释

### Phase 2 完成后：

- [ ] p-value < 0.10 的因子被标注为 "statistically_significant"
- [ ] 高度相似的条件组合被合并（去重）
- [ ] 30 天窗口验证通过的候选自动标记为 "promising"

### Phase 3 完成后：

- [ ] `trader pattern explain <id>` 能生成自然语言解释
- [ ] 解释不写入 PatternMemory——仅返回给用户
