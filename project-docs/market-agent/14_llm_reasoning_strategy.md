# 14. LLM Reasoning Strategy

> 状态: design | 依赖: `00_README.md`, `02_architecture_overview.md`, `07_decision_envelope.md`

## 1. 文档目的

定义 MarketAgent 中 LLM 的参与范围、推理策略、模型路由和故障降级机制。

核心原则：**LLM 负责解释和验证，不负责直接决策**。风险门禁、setup 检测、数据质量检查全部是确定性规则。

---

## 2. LLM 参与点

全管线 12 个节点中，**LLM 只参与 2 个**：

| 节点 | LLM 策略 | 输入 | 输出 |
|---|---|---|---|
| `build_evidence` | **ReAct + Research Synthesis** | features, market_state, setup_name | evidence_text (≤200 tokens), confidence_contribution (0-1) |
| `generate_contra` | **Debate Model + Tree of Thoughts** | evidence_text, features, setup_name | contra_text (≤200 tokens), risk_flags[] |

其余 10 个节点全部为确定性计算。

---

## 3. Evidence Builder —— ReAct + Research Synthesis

### 3.1 设计

```
输入: { symbol, setup_name, features, market_state }

ReAct 循环 (max 5 steps):
┌──────────────────────────────────────────────────────┐
│ Step 1: Thought → "需要验证量能和基准背景"              │
│         Action → fetch_market_bars(symbol, 5m, 20)    │
│         Action → fetch_benchmark_bars(symbol)          │
│         Observation → { bars, benchmark }              │
│                                                       │
│ Step 2: Thought → "量能确认，检查事件和期权流"          │
│         Action → search_recent_events(symbol, 30min)   │
│         Action → fetch_option_flow(symbol, 30min)      │
│         Observation → { events, option_flow }          │
│                                                       │
│ Step 3: Thought → "技术面确认，需要理解驱动因素"        │
│         Action → web_search(symbol + setup 关键词)     │
│         Action → search_cn_finance(symbol)   [若中文标的]│
│         Observation → { news[], cn_articles[] }        │
│                                                       │
│ Step 4: Thought → "关键新闻需验证原文"                  │
│         Action → fetch_url(top_news_url)               │
│         Observation → { verified_content }             │
│                                                       │
│ Step 5: Thought → "参考历史模式后综合输出"              │
│         Action → query_pattern_history(symbol, setup)  │
│         Observation → { similar_patterns[], avg_win }  │
│         → final answer (no tool call)                  │
└──────────────────────────────────────────────────────┘
输出: { evidence_text, confidence_contribution, evidence_sources[] }
```

ReAct 步数从 3→5 步以容纳新增工具。LLM 自主决定每个 Step 调用哪些工具——5 步是上限，简单标的可能 3 步就收敛。

### 3.2 工具白名单（9 个，分三组）

**行情组**（确定性数据，API 直读，零 LLM 成本）：

| 工具 | 签名 | 用途 | 成本 |
|---|---|---|---|
| `fetch_market_bars` | `(symbol, timeframe, limit)` → `MarketBar[]` | 读取标的 K 线 | 零 |
| `fetch_benchmark_bars` | `(symbol)` → `MarketBar[]` | 读取基准 (QQQ/SPY) K 线 | 零 |
| `search_recent_events` | `(symbol, window_minutes)` → `Event[]` | 搜索结构化事件（财报日、FOMC） | 零 |
| `fetch_option_flow` | `(symbol, lookback=30min)` → `{ unusual_contracts[], iv_rank, put_call_ratio }` | 期权异常流——量是谁在买？ | API 费用 |
| `query_pattern_history` | `(symbol, setup_name, limit=3)` → `{ similar_patterns[], win_rate, avg_outcome }` | 历史模式检索——这个 setup 上次触发时发生了什么？ | 零（本地 DB） |

**舆情组**（非确定性数据，需搜索 + 验证）：

| 工具 | 签名 | 用途 | 成本 |
|---|---|---|---|
| `web_search` | `(query, max_results=5)` → `SearchResult[]` | 搜索英文新闻/公告 | ~$0.001/次 |
| `web_search_time_range` | `(query, hours_back=24)` → `SearchResult[]` | 时间限定搜索（舆情时效性） | ~$0.001/次 |
| `fetch_url` | `(url)` → `text` | 访问具体页面提取正文（验证用，搜索-验证分离） | ~$0.0005/次 |
| `search_cn_finance` | `(symbol, source="xueqiu|eastmoney|36kr")` → `{ articles[], sentiment }` | 中文金融源搜索（A/港股标的必需） | ~$0.001/次 |

**为什么必须有舆情组**：

Market Agent 的价值不仅在"价格到了什么位置"，更在"价格为什么到那里"。财报电话会、监管公告、社交情绪、行业新闻——这些信息不在 K 线里，只能用 Web Search 获取。没有舆情检索，build_evidence 只能输出"量能放大"这类技术性描述，无法给 DecisionEnvelope 注入"量能放大是因为 CEO 在接受采访时给出了激进指引"这种因果证据。

**为什么必须有 `query_pattern_history`**：

复盘系统（`OutcomeGraph` + `PatternMemory`）已经沉淀了历史规律——但如果 `build_evidence` 不能访问这些规律，PatternMemory 只是事后记录，不是决策输入。`query_pattern_history` 让 Agent 在做实时判断时能说"这个 setup 过去 1 个月触发过 3 次，胜率 67%，最近两次都赢了"——这比单独的 K 线证据更有说服力。

### 3.3 输出格式

```json
{
  "evidence_text": "string (≤300 words)",
  "confidence_contribution": 0.0 - 1.0,
  "evidence_sources": [
    "market_bars:TSLA:5m [lag=2s]",
    "benchmark:QQQ:5m [lag=1s]",
    "events:TSLA:30m",
    "option_flow:TSLA:30m [iv_rank=0.8, put_call=0.3]",
    "web_search:TSLA+earnings+guidance [3 results, verified=1]",
    "cn_finance:TSLA:xueqiu [sentiment=positive, 5 articles]",
    "pattern_history:TSLA:VWAP_Reclaim [3 similar, win_rate=0.67]"
  ]
}
```

每个 `evidence_source` 附带 `[元信息]`——行情组标延迟、舆情组标搜索结果数和验证数、记忆组标相似模式数和胜率。这些元信息直接用于 3.5 节确定性护栏。

### 3.4 降级路径

```
LLM 不可用 / 超时 8s（5→8s 以容纳新增工具）
  → evidence_text = "LLM unavailable — evidence not generated"
  → confidence_contribution = 0
  → evidence_sources = []
  → RiskGate 检测到 confidence=0 → 标记 needs_review

单个工具失败（不阻断整体）：
  web_search 超时 → 跳过舆情组，evidence_text 只含行情组数据
  fetch_url 超时 → 用搜索摘要代替（标记 unverified）
  query_pattern_history 不可用 → 跳过历史模式，不降低 confidence
  fetch_option_flow 不可用 → 跳过期权流，不降低 confidence
```

### 3.5 确定性护栏 — LLM 自评分数不可信，用硬性规则覆盖

LLM 输出的 `confidence_contribution` 是自评分数，不可靠。必须在 LLM 输出之上叠加确定性规则验证。以下规则在 `build_evidence` 输出后、写入 DecisionEnvelope 前执行，全部为字符串/数组级别统计，零 LLM 调用成本。

**设计依据**：ai-agent-book Part 4 第 10 章「Planning 模式」— Coverage Evaluation 的 4 条确定性护栏（第 10.5 节）；第 12 章「Chain-of-Thought」— 置信度的确定性计算（第 12.6 节）。

```text
规则 A: evidence_sources.length == 0
  → confidence_contribution = 0
  → 理由: 没有证据来源

规则 B: evidence_sources.length == 1
  → confidence_contribution = min(0.5, LLM自评值)
  → 理由: 单一来源不足以支撑高置信度

规则 C: evidence_text.length < 50 tokens && LLM自评 > 0.5
  → confidence_contribution = 0.3
  → 理由: 证据很薄但声称高置信 → 不可信

规则 D: ReAct steps == 5（达到上限）&& evidence_sources.length < 3
  → 标记 needs_review + 记录缺失维度（行情/舆情/历史）
  → 理由: 打满 5 步但数据仍不全

规则 H: 舆情组未被使用（evidence_sources 中无 web_search/cn_finance/fetch_url）
  → evidence_text 追加标注 "[no sentiment data available]"
  → 理由: 缺乏舆情数据时，因果推理不完整——DecisionEnvelope 应知此限制

规则 I: web_search 结果均标记 unverified（fetch_url 未成功验证任一）
  → evidence_text 中所有基于搜索的结论降权
  → 追加 risk_flags: ["unverified_news_source"]
  → 理由: 搜索结果未经原文验证 → 可能断章取义（Deep Research 27.7 节教训）
```

**执行时序**：

```
build_evidence ReAct 完成
  ↓
LLM 输出: { evidence_text, confidence_contribution (LLM自评), evidence_sources }
  ↓
确定性护栏 (3.5 规则 A-D) 覆盖 confidence_contribution
  ↓
写入 DecisionEnvelope.confidence_contribution = 覆盖后值
```

---

## 4. Contra Generator —— Debate Model + Tree of Thoughts

### 4.1 三角色架构

```
evidence_text ──► Proposer (Flash) ──► "setup 成立因为 A, B, C"
                         │
                ┌────────▼────────┐
                │  Opponent (Pro)  │ ← Tree of Thoughts (beam=3, depth=2)
                │                  │   探索多条失效路径，选最危险的
                └────────┬────────┘
                         │
                ┌────────▼────────┐
                │   Judge (Pro)    │ ← 综合裁决 + risk_flags[]
                └────────┬────────┘
                         │
                { contra_text, risk_flags[] }
```

### 4.2 Opponent 内嵌 Tree of Thoughts

```
输入: evidence_text, features, setup_name

Tree of Thoughts (beam_width=3, max_depth=2):

Root: "此 setup 可能失败的原因？"
├── Path A: "无量假突破"  ← 评分 0.8
│   └── 展开: "前 3 次同类 setup 中 1 次 vol<1.2 导致假突破"
├── Path B: "基准反向破位" ← 评分 0.7
│   └── 展开: "QQQ 接近日内低点，破位→个股补跌"
├── Path C: "宏观事件压制" ← 评分 0.5
│   └── (剪枝 — 当前无 FOMC/CPI 事件)
└── Path D: "特征数据异常" ← 评分 0.3 → 剪枝

最终输出: 评分最高的 2 个路径 + 具体论证
```

### 4.3 输出格式

```json
{
  "contra_text": "string (≤200 words)",
  "risk_flags": ["low_volume_risk", "benchmark_correlation_risk"],
  "quality_score": 0.0-1.0,
  "criteria_scores": {
    "evidence_completeness": 0.0-1.0,
    "setup_validation": 0.0-1.0,
    "risk_identification": 0.0-1.0
  },
  "top_failure_paths": [
    {"path": "无量假突破", "score": 0.8, "detail": "..."},
    {"path": "基准反向破位", "score": 0.7, "detail": "..."}
  ]
}
```

**新增字段说明**（设计依据：ai-agent-book Part 4 第 12 章「Chain-of-Thought」— Confidence 量化计算 + 第 11 章「Reflection」— 评估标准分项评分）：

| 字段 | 含义 | 用途 |
|---|---|---|
| `quality_score` | Judge 对 Evidence + Contra 整体质量的 0-1 评分 | DecisionEnvelope 的 `confidence_contribution` 最终值 = min(evidence 护栏覆盖后的值, quality_score) |
| `criteria_scores` | 分项评分（证据完整性、setup 验证度、风险识别充分度） | 诊断用途——哪个维度最弱？复盘时可回标该维度是否准确 |

### 4.4 降级路径

```
Proposer 不可用 → 跳过，evidence 直接作为支撑
Opponent 不可用 → 跳过，无 risk_flags
Judge 不可用 → 取 Opponent 的 top_failure_paths 直接作为 contra
全部不可用 → contra_text = "LLM unavailable — contra not generated"
```

### 4.5 确定性评分覆盖 — Judge 自评质量分数不可信

与 3.5 节同理，Judge 输出的 `quality_score` 是 LLM 自评，必须用确定性规则验证。以下规则在 `generate_contra` 输出后执行：

```text
规则 E: risk_flags.length == 0 && quality_score > 0.7
  → quality_score = 0.6，追加 risk_flags: ["suspicious_high_score"]
  → 理由: 没有发现任何风险但评分很高 → 不可信

规则 F: evidence_sources.length < 2 && criteria_scores.evidence_completeness > 0.5
  → criteria_scores.evidence_completeness = 0.3
  → 理由: 证据来源稀少但声称完整性高 → 矛盾

规则 G: quality_score < 0.4
  → DecisionEnvelope 标记 needs_review，RiskGate 自动降权 50%
  → 理由: 极低质量 → 不应作为决策依据
```

**最终 confidence_contribution 计算公式**：

```
raw_confidence = build_evidence 输出的 LLM 自评值
evidence_confidence = 3.5 节护栏覆盖后的值
judge_quality = 4.5 节规则覆盖后的 quality_score

DecisionEnvelope.confidence_contribution = min(evidence_confidence, judge_quality)
```

---

## 5. 分层模型路由

### 5.1 模型配置

通过环境变量配置两种模型：

```bash
# Flash 模型 (证据构建、Proposer)
LLM_FLASH_MODEL=deepseek-ai/DeepSeek-V4-Flash
LLM_FLASH_BASE_URL=https://api.deepseek.com/v1

# Pro 模型 (Opponent ToT、Judge、Research Synthesis)
LLM_PRO_MODEL=deepseek-ai/DeepSeek-V4-Pro
LLM_PRO_BASE_URL=https://api.deepseek.com/v1

# 共享 API Key
LLM_API_KEY=sk-xxx
```

### 5.2 路由规则

| 任务 | 模型 | thinking | 原因 |
|---|---|---|---|
| `build_evidence` ReAct (工具调用) | **Flash** | off | 9 个工具调度 → 推理深度中等 |
| `build_evidence` Web Search 工具 (`web_search`, `search_cn_finance`) | **Flash** | off | 搜索查询生成和结果筛选——非深度推理 |
| `build_evidence` 综合输出 (Step 5) | **Flash** | off | 将 5 步结果综合为 evidence_text |
| `contra` Proposer | **Flash** | off | 轻量正向论证 |
| `contra` Opponent (ToT) | **Pro** | **on** | 需要深度多路径推理 |
| `contra` Judge | **Pro** | off | 综合裁决，不需要长链思考 |
| DAG Research Tasks | **Flash** | off | 并行多个轻量研究 |
| DAG Synthesis | **Pro** | **on** | 汇聚多研究结果 |
| Context Planning | **Flash** | off | 轻量规划 |
| Context Reflection | **Pro** | off | 自我审查 |

### 5.3 成本预算（单 tick，5 symbols）

**LLM 调用成本**：

| 调用 | 模型 | 并行 | 耗时 | 成本/tick |
|---|---|---|---|---|
| 5× build_evidence ReAct (~5 steps, 含工具调度) | Flash | ∥ | ~6s | ~$0.004 |
| 5× Web Search 工具调用 (avg 2 次搜索/symbol) | — | ∥ | ~2s | ~$0.010 |
| 5× contra Proposer | Flash | ∥ | ~1.5s | ~$0.001 |
| 5× contra Opponent (ToT) | Pro-thinking | ∥ | ~6s | ~$0.02 |
| 5× contra Judge | Pro | ∥ | ~1.5s | ~$0.005 |
| **合计** | | | **~9s** | **~$0.04** |

**非 LLM 成本**：

| 调用 | 成本/tick | 备注 |
|---|---|---|
| 5× `fetch_option_flow` | API 费用 | Longbridge 市场深度数据（含在订阅中） |
| 5× `query_pattern_history` | 零 | 本地 SQLite FTS5 查询 |

按 1d 频率：1 tick/天 × $0.04 = **~$1.20/月**。

---

## 6. 与现有 DecisionGraph LLM 的关系

```
现有 DecisionGraph:
  createWorkflowLlmProvider() → 一次 LLM 调用 → thesis + action

MarketAgent 升级:
  createMarketAgentLlmProvider() → ModelRouter
    ├─ buildEvidence()     → ReAct (Flash)
    └─ generateContra()    → Debate (Flash + Pro + Pro)
```

共用 `src/llm/provider.ts` 的 DeepSeek-compatible 客户端。只在 model 参数和 thinking 开关上区分。

---

## 7. 成本分层策略 — Reflection 按价值分层

**设计依据**：ai-agent-book Part 4 第 11 章「Reflection」— 11.5 成本权衡 + 11.7 "什么时候用 Reflection"。

Reflection（三角色 Debate）成本约为单纯 build_evidence 的 3-5 倍。不是每个信号都值得花费。以下策略在触发 generate_contra 之前执行预判——全部为确定性计算，不调 LLM：

```text
预判规则 (调 generate_contra 之前):

P1: signal_strength < 0.3（信号强度弱）
  → 跳过 generate_contra（弱信号不花 Pro 模型成本反对）
  → contra_text = "skipped — signal strength below threshold"
  → quality_score 设为 build_evidence 护栏覆盖后的值

P2: market_regime == "crisis"（危机市）
  → 跳过 generate_contra（危机市不做精细分析）
  → contra_text = "skipped — crisis regime"
  → risk_flags = ["elevated_market_risk"]

P3: setup 同类历史复盘胜率 < 30% 且当前信号与历史失败案例高度相似
  → 简化 contra（只用 Flash 做单次反对，不用 Pro ToT）
  → 理由: 大概率失败的 setup，精细反对的增量信息有限
```

### 7.1 成本对比

| 场景 | 完整 contra (Pro ToT) | 简化 contra (Flash only) | 跳过 contra |
|---|---|---|---|
| 适用 | signal_strength ≥ 0.3, 非危机, 历史胜率正常 | 历史胜率低但信号弱 | 极弱信号 / 危机市 |
| 成本 | ~$0.03/tick | ~$0.005/tick | $0 |
| 比例预期 | ~60% 信号 | ~25% 信号 | ~15% 信号 |

### 7.2 决策树

```
信号触发
  ↓
signal_strength < 0.3? ─── 是 ──→ 跳过 contra，记录原因
  ↓ 否
market_regime == "crisis"? ─── 是 ──→ 跳过 contra，标记 elevated_market_risk
  ↓ 否
历史胜率 < 30% && 相似失败? ─── 是 ──→ 简化 contra (Flash only)
  ↓ 否
完整 contra (三角色 + Pro ToT)
```

---

## 8. 非目标

1. 不让 LLM 直接决定 setup 是否成立（SetupDetector 是确定性的）
2. 不让 LLM 直接决定交易动作（RiskGate + DecisionEnvelope 是规则驱动的）
3. 不让 LLM 访问原始市场数据（只有 FeatureEngine 输出的结构化特征 + 白名单工具）
4. 不让 LLM 写入数据库
5. 不把 30 年历史数据塞进 prompt

---

## 9. Prompt 模板索引

| 模板 ID | 角色 | 位置 |
|---|---|---|
| `EVIDENCE_SYSTEM` | build_evidence 系统消息 | `src/services/marketAgentPrompts.ts` |
| `EVIDENCE_USER` | build_evidence 用户 prompt | 同上 |
| `EVIDENCE_WEB_SEARCH` | build_evidence Web Search 工具 prompt | 同上 |
| `CONTRA_PROPOSER` | contra Proposer 系统 + user | 同上 |
| `CONTRA_OPPONENT` | contra Opponent (ToT) 系统 + user | 同上 |
| `CONTRA_JUDGE` | contra Judge 系统 + user | 同上 |

---

## 10. 验收标准

1. ModelRouter 可以按环境变量选择 Flash/Pro 两种模型
2. EvidenceBuilder ReAct 循环支持 max 5 steps，可调用全部 9 个白名单工具
3. Web Search 工具（`web_search`、`search_cn_finance`）返回结果后可调用 `fetch_url` 验证
4. `query_pattern_history` 可从本地 `pattern_memories` 表检索历史模式
5. ContraGenerator 三角色完整执行（Proposer → Opponent → Judge）
6. Opponent Tree of Thoughts 正确剪枝（保留 top 2 路径）
7. LLM 不可用时降级路径正确触发
8. 确定性护栏（3.5 节规则 A-D + H-I）在 build_evidence 输出后正确覆盖 confidence_contribution
9. 确定性评分覆盖（4.5 节规则 E-G）在 Judge 输出后正确覆盖 quality_score
10. 成本分层预判（7 节规则 P1-P3）正确按条件跳过/简化 contra
11. DecisionEnvelope.confidence_contribution = min(evidence 覆盖值, judge quality 覆盖值)
12. 单 symbol 的 evidence + contra 总延迟 < 12 秒（9→12 秒以容纳 Web Search）
