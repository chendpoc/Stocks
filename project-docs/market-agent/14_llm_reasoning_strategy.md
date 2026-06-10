# 14. LLM Reasoning Strategy

> 状态: strategy-draft | 非 source-of-truth | 依赖: `00_README.md`, `02_architecture_overview.md`, `07_decision_envelope.md`
>
> 本文只定义 LLM 推理策略候选和模型路由假设，不直接授权 SDK 迁移、Tool Registry 改造、Daemon 实现或 worker 任务。只有被 `12_development_phases.md`、`13_acceptance_tests.md` 或 `.agent-dev/tasks/T021`-`T027` 明确采纳的条目，才进入执行口径。

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
| `query_pattern_history` | `(symbol, setup_name, limit=3)` → `{ similar_patterns[], win_rate, avg_outcome }` | 历史模式检索——语义匹配（向量 embedding + 余弦相似度），替代 SQLite FTS5 字面匹配 | 零（本地 DB + embedding API） |

> **SDK 演进计划**: 当前 `query_pattern_history` 使用 SQLite FTS5 进行字面全文检索。后续升级为:
> 1. 使用 Vercel AI SDK `embed()` 将搜索查询转为向量（`index.d.mts` L369）
> 2. 预先对所有 `pattern_memories` 条目计算 embedding 并存入 SQLite BLOB 列
> 3. 检索时做余弦相似度排序，替代 FTS5 BM25 排序
>
> **收益**: 语义检索——"VWAP 突破失败"能匹配"无量假突破"这类字面不同但语义相近的历史模式。FTS5 只能匹配字面。

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

### 3.3a 输出方法 — SDK 原生结构化输出替代手工 JSON 解析

使用 Vercel AI SDK v4 的 `generateText` + `experimental_output`（`index.d.mts` L2471）进行结构化输出，替代手工 JSON 解析:

```ts
import { z } from "zod";
import { generateText } from "ai";

const EvidenceResult = z.object({
  evidence_text: z.string().max(300),
  confidence_contribution: z.number().min(0).max(1),
  evidence_sources: z.array(z.string()),
});

// 在 DecisionGraph 的 build_evidence 节点中:
const result = await generateText({
  model: getModel(),
  system: EVIDENCE_SYSTEM,
  prompt: buildEvidencePrompt(symbol, setup, features, marketState),
  tools: resolveTools("evidence"),  // 9 个白名单工具
  maxSteps: 5,
  maxRetries: 2,                    // SDK 内建工具调用重试
  experimental_output: {
    type: "object",
    schema: EvidenceResult,
  },
  experimental_repairText: async ({ text, error }) => {
    // SDK 自动修复非法 JSON（补全 }、修复转义）——省掉手工 try/catch
    return null; // 返回 null 让 SDK 使用默认修复逻辑
  },
});

// result.experimental_output 已经是类型安全的 { evidence_text, ... }
// 不需要 JSON.parse()、不需要 try/catch
// 直接传给 3.5 节确定性护栏做业务规则覆盖
```

**收益**:
- 省掉手工 JSON parse + try/catch（约 15 行）
- 3.5 节规则 C（"evidence_text 太短但声称高置信"）可简化——SDK 保证 JSON 合法，我们只需校验**语义合理性**而非**格式正确性**
- 类型安全——TypeScript 编译器保证 `result.experimental_output` 类型正确

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

## 9. 工具注册中心 — Tool Registry

由 Claude Code CLI 的设计驱动。在当前系统 `tools.ts` ＋ `buildAgentTools.ts` 基础上，将分散的工具定义集中到一个运行时可见的注册中心。

```
当前:  tools.ts (INTEL_TOOLS) + longbridgeTools.ts → buildAgentTools.ts → Agent
       ▲ 工具在代码中硬编码，Agent 被动接收，不能查询"还有什么"

目标:  toolRegistry.ts (单点注册)
       ├─ describeTools        ← Agent 主动查询工具目录（两层: 摘要 / 详细）
       ├─ describeTool(name)   ← 按需获取单个工具的完整 schema
       ├─ market 组 (4)        ← 行情读取
       ├─ sentiment 组 (3)     ← 舆情搜索+验证
       ├─ longbridge 组 (22)   ← 长桥只读工具
       ├─ workflow 组 (3)      ← listWorkflows / runWorkflow / getWorkflowStatus
       └─ memory 组 (3)        ← 复盘记忆读写
              │
       resolveTools(scope) → 按 scope 返回不同工具集
              │
       ┌──────┼──────┐
       ▼      ▼      ▼
    chat   decisionGraph  evidence
   (全量) (子集)       (白名单)
```

**渐进式披露**:

| 层级 | 内容 | Token 成本 | 触发方式 |
|---|---|---|---|
| **L0 — System Prompt** | "你有 5 组工具（market/sentiment/longbridge/workflow/memory），调用 `describeTools` 查看详情" | 1 行 | 启动时注入 |
| **L1 — `describeTools`** | 所有工具的分类摘要（name + 1 行描述 + 分组） | ~500 tokens | Agent 主动调用 |
| **L2 — `describeTool(name)`** | 单个工具的完整 schema + 参数说明 | ~200 tokens | Agent 按需调用 |

**工具分组及 scope 权限**:

| 组名 | 工具 | chat | decisionGraph | evidence |
|---|---|---|---|---|
| **market** | fetchMarketBars, fetchBenchmarkBars, searchRecentEvents, fetchOptionFlow | ✅ | ✅ | ✅ |
| **sentiment** | webSearch, searchCnFinance, fetchUrl | ✅ | ✅ | ✅ |
| **longbridge** | 22 个长桥只读工具 | ✅ | ❌ | ❌ |
| **workflow** | describeTools, describeTool, listWorkflows, runWorkflow, getWorkflowStatus | ✅ | ❌ | ❌ |
| **memory** | queryPatternHistory, saveHypothesis, getLessons | ✅ | ✅ | ✅ |

**代码位置**:

| 文件 | 职责 |
|---|---|
| `apps/trader-cli/src/llm/toolRegistry.ts` | 注册中心核心: ToolDefinition 类型、registerTool()、resolveTools(scope) |
| `apps/trader-cli/src/llm/toolRegistry.describe.ts` | describeTools / describeTool 工具实现 |
| `apps/trader-cli/src/llm/toolRegistry.market.ts` | market 组工具定义 |
| `apps/trader-cli/src/llm/toolRegistry.sentiment.ts` | sentiment 组工具定义 |
| `apps/trader-cli/src/llm/toolRegistry.longbridge.ts` | longbridge 组工具定义 |
| `apps/trader-cli/src/llm/toolRegistry.workflow.ts` | workflow 组工具定义 + listWorkflows / runWorkflow / getWorkflowStatus |
| `apps/trader-cli/src/llm/toolRegistry.memory.ts` | memory 组工具定义 |
| `apps/trader-cli/src/llm/buildAgentTools.ts` | 重构为调用 resolveTools("chat") |

**Workflow 工具**（Agent 路由核心）:

| 工具 | 签名 | 用途 |
|---|---|---|
| `listWorkflows` | `() → { workflows: { id, description, requiredInputs, produces, avgDuration }[] }` | 获取所有可用 workflow 的目录 |
| `runWorkflow` | `(workflowId, inputs) → { runId, status }` | 触发 workflow 运行，走 `POST /api/intel/{workflowId}` |
| `getWorkflowStatus` | `(runId) → { status, progress, result? }` | 查询运行状态，走 `GET /api/intel/runs/{runId}` |

**执行路径**：全部走 Backend API（`fetchIntel`），不 exec CLI 命令。理由：跨平台兼容（macOS/Windows/Linux 零差异）、复用现有 `fetchIntel()` 基础设施、进程管理由 Backend 统一处理。

**Agent 自主路由分级**:

| 等级 | Workflow | 触发条件（Agent 自主判断） | 预算上限 | 确认 |
|---|---|---|---|---|
| **绿色 — 自由** | `listWorkflows`、`getWorkflowStatus` | 随时 | 零 | 否 |
| **黄色 — 证据驱动** | `decision`、`outcome` | ≥3 个独立证据源 + signal_strength > 0.3 | ~$0.04/run | 否 |
| **红色 — 需确认** | `evaluation`、`insightExploration`、`alphaResearch` | 复盘周期触发 或 Agent 判定有显著模式需要挖掘 | ~$0.50/run | **是 — Agent 展示触发依据，用户回车确认** |

Agent 在 Chat 中的典型决策流程：

```
用户: "TSLA 今天涨了 5%，怎么回事？"

Agent ReAct:
  Step 1: 调 fetchMarketBars → 放量突破 VWAP, vol > 1.5x avg
  Step 2: 调 webSearch → CEO 采访给出激进交付指引
  Step 3: 调 fetchOptionFlow → 大单 Call 涌入, put/call=0.2

  Thought: 3 个独立证据源命中，signal_strength > 0.3 → 触发 decision
  Action: runWorkflow("decision", {symbols: ["TSLA"]})
  Observation: { runId: "abc123", status: "running" }

  返回用户: "已触发 decision workflow。证据: 放量突破 VWAP + CEO指引 + Call涌入。runId: abc123，预计 30 秒完成。"

--- 30 秒后 ---

Agent: 调 getWorkflowStatus("abc123")
  Observation: { status: "completed", result: { confidence: 0.72, setup: "VWAP_Reclaim" } }

  返回用户: "decision 完成。TSLA VWAP Reclaim setup，置信度 0.72。要生成正式 DecisionEnvelope 吗？"
```

**Chat 页面 UI 行为**：

- **文本流（A）**：Agent 的每步工具调用和推理以 `[工具]` 行内展示，保持当前样式
- **Workflow 状态面板（B）**：当 Agent 调用 `runWorkflow` 后，Chat 页面底部自动插入一个内嵌的 workflow 迷你面板：

```
┌─────────────────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░  decision 运行中 (abc123)  │
│ TSLA · VWAP Reclaim · 预计 30s                    │
└─────────────────────────────────────────────────┘
```

面板由 **前端轮询** `getWorkflowStatus`（不是 Agent 反复调），不占用对话上下文。状态变更时自动更新面板文本。完成后面板保留结果摘要 3 秒后收起。

**验收标准**:

- [ ] `describeTools` 返回 5 组工具的摘要列表（name + 分组 + 1 行描述）
- [ ] `describeTool("runWorkflow")` 返回 runWorkflow 的完整 schema
- [ ] `resolveTools("chat")` 返回全部 5 组
- [ ] `resolveTools("evidence")` 只返回 market + sentiment + memory（14 号文档白名单）
- [ ] `listWorkflows` 返回 5 个 graph 的 id/描述/输入/产出
- [ ] `runWorkflow("decision", { symbols: ["TSLA"] })` 能触发并返回 runId
- [ ] `resolveTools("daemon")` 返回 market + sentiment + workflow + daemon（不含 longbridge/describe/memory）
- [ ] `scheduleWakeup` 工具可由 Agent 调用添加动态唤醒任务

---

## 10. Daemon Gate CoT — 后台扫盘决策

### 10.1 设计定位

Daemon 是后台常驻进程，每 5 分钟醒来检查数据变化。99% 的醒来结果是没有值得关注的信号 → 记录心跳 → 继续睡眠。Gate 调用只做单次 Flash 模型判断，不做完整 ReAct 循环。

**设计依据**: ai-agent-book Part 4 第 12 章「Chain-of-Thought」— CoT 在决策型单次调用中的应用。

### 10.2 System Prompt — Few-Shot CoT

使用 6 个典型场景的 few-shot 示例引导 LLM 的推理质量。每个示例包含完整的推理链 → JSON 输出。

```
你是 Market Agent Daemon Gate。你的任务是根据市场数据和时段，判断是否需要启动深度分析。

规则:
- 没有 setup 信号 → run=false（数据变化不等于交易机会）
- 有信号但市场关闭（周末/节假日）→ run=false + scheduleWakeup 到开盘前
- 有信号 + 盘中 → 评估复杂度，路由到对应 Agent
- 盘后 → 检查是否有需要回标的决策
- 如果发现宏观事件（FOMC/财报/CPI），用 scheduleWakeup 安排定时唤醒

---

示例 1 — 盘中无信号:

时段: market-open
数据摘要: SPY 涨 0.1%，TSLA 涨 0.3% 量平，NVDA 跌 0.2%，无新信号
信号列表: []

推理:
步骤 1: 盘中正常交易
步骤 2: 三个标的波动极小，无信号触发，量能无异常
步骤 3: 无值得分析的信号——横盘行情不做决策
步骤 4: 不需要

JSON: {"run": false, "complexity_score": 0, "recommended_agent": null, "recommended_pattern": null, "symbols": [], "reasoning": "SPY 横盘，全部标的无信号触发"}

---

示例 2 — 盘中强信号:

时段: market-open
数据摘要: SPY 涨 0.8%，TSLA 涨 5.2% 放量（vol=2.3x avg），NVDA 涨 3.1%
信号列表: [{"symbol":"TSLA","type":"VWAP_Reclaim","strength":0.8}, {"symbol":"NVDA","type":"RS_Pullback","strength":0.7}]

推理:
步骤 1: 盘中正常交易
步骤 2: SPY 上行，TSLA 放量突破 VWAP（strength 0.8），NVDA 回调至支撑（strength 0.7）
步骤 3: 两个强信号同时触发——值得深度分析。两个标的独立，可并行
步骤 4: Mid-Day Deep Agent + Swarm 模式并行分析 TSLA 和 NVDA

JSON: {"run": true, "complexity_score": 0.55, "recommended_agent": "mid-day-deep", "recommended_pattern": "swarm", "symbols": ["TSLA","NVDA"], "reasoning": "TSLA放量VWAP突破+NVDA回调支撑，2标的并行分析"}

---

示例 3 — 单个弱信号:

时段: market-open
数据摘要: SPY 跌 0.2%，TSLA 涨 1.2% 量平，无其他信号
信号列表: [{"symbol":"TSLA","type":"daily_breakout_retest","strength":0.4}]

推理:
步骤 1: 盘中正常交易
步骤 2: 仅 TSLA 一个弱信号（strength 0.4），量能不配合，SPY 偏弱
步骤 3: 信号太弱不深入——单标的弱信号不值得启动 Deep Agent
步骤 4: 不需要

JSON: {"run": false, "complexity_score": 0.15, "recommended_agent": null, "recommended_pattern": null, "symbols": [], "reasoning": "仅1个弱信号(strength=0.4)，量平，不值得深入"}

---

示例 4 — 盘后回标:

时段: post-market（收盘后 15 分钟）
数据摘要: 今日生成 2 个 DecisionEnvelope（TSLA VWAP_Reclaim, NVDA RS_Pullback），1 天前有 3 个待回标
信号列表: []

推理:
步骤 1: 盘后复盘时段
步骤 2: 今天有 2 个新决策，1 天前有 3 个待回标
步骤 3: 盘后不分析新信号，重点是回标昨天的决策——应该跑 Outcome + Evaluation
步骤 4: Post-Market Agent + planning→reflection

JSON: {"run": true, "complexity_score": 0.3, "recommended_agent": "post-market", "recommended_pattern": "planning", "symbols": [], "reasoning": "盘后复盘: 2新决策+3待回标→跑 outcome + evaluation"}

---

示例 5 — 周末心跳:

时段: weekend（周六）
数据摘要: 上一次 scan: 2026-06-12T16:00:00Z（周五收盘），无新数据
信号列表: []

推理:
步骤 1: 周末——市场关闭
步骤 2: 无新数据，无信号
步骤 3: 周末不分析——仅记录心跳。如果有下周一的宏观事件，会在周五盘后安排 scheduleWakeup
步骤 4: 不需要

JSON: {"run": false, "complexity_score": 0, "recommended_agent": null, "recommended_pattern": null, "symbols": [], "reasoning": "周末休市，无新数据"}

---

示例 6 — 宏观事件自举:

时段: market-open
数据摘要: SPY 涨 0.3%，TSLA 涨 0.5%，无新信号。当前时间 2026-06-10T10:35:00Z
信号列表: []
事件日历: 今晚 20:30 FOMC 会议纪要发布

推理:
步骤 1: 盘中，但无信号
步骤 2: 数据变化平淡，无值得分析的信号
步骤 3: 但是——今晚有 FOMC 纪要！盘后需要重点关注。应该为自己安排一个盘后唤醒
步骤 4: 当前不需要跑 Agent，但需要 scheduleWakeup(20:32) + 明天盘前再跑 Pre-Market Agent

JSON: {"run": false, "complexity_score": 0, "recommended_agent": null, "recommended_pattern": null, "symbols": [], "reasoning": "无信号但FOMC今晚20:30→已安排scheduleWakeup盘后跟踪"}

---

现在进行判断。先逐步推理，再输出 JSON。
```

### 10.3 CoT 收益

| | 无 CoT | 有 CoT |
|---|---|---|
| Gate 判断 | LLM 凭直觉说 run=true（"有变化"） | LLM 先推理再决策（"SPY 横盘, TSLA 量平, 无 setup → run=false"） |
| 解释性 | 不知道为什么 run=true | 每一步推理可见 |
| 误报率 | 高（有变化就触发） | 低（需具体 setup 信号） |
| Token 成本 | ~200 tokens | ~350 tokens (+75%, 但绝对值约 $0.0008) |

### 10.4 数据摘要注入

Gate 调用前组装精简数据摘要（不调 ReAct，不调工具——这些数据在 Daemon 醒来时已经通过 tool 预拉取）:

```json
{
  "session": "market-open",
  "last_scan": "2026-06-10T10:35:00Z",
  "new_bars_count": 3,
  "signals": [
    {"symbol": "TSLA", "type": "VWAP_Reclaim", "strength": 0.7},
    {"symbol": "NVDA", "type": "RS_Pullback", "strength": 0.5}
  ],
  "macro_events": []
}
```

### 10.5 动态唤醒自举

Gate 调用发现 FOMC 会议纪要将在 20:30 发布时，Agent 可以调 `scheduleWakeup` 为自己安排未来的唤醒:

```
Gate 推理: "FOMC 纪要今晚 20:30 发布，需要盘后关注"
→ 调 scheduleWakeup({ at: "2026-06-10T20:32:00Z", reason: "FOMC 纪要后 2 分钟" })
→ Daemon 在 20:32 被强制唤醒（优先级覆盖固定策略）
```

对应的 `scheduleWakeup` 工具已在 Tool Registry 中注册为 `workflow` 组工具（见 §9）。

### 10.6 节假日处理

美股每年有 9 个休市日 + 3 个半天交易日。节假日当天市场关闭，无数据变化，Daemon 应降频避免空烧 LLM gate。

**实现**（`wakeSchedule.ts`）:

| 日期类型 | 唤醒间隔 | 示例 |
|---|---|---|
| `regular` | 按 §10.2 固定策略 | 正常交易日 |
| `holiday` | 每 12 小时 | 圣诞节、元旦 — 仅心跳 |
| `half_day` | 每 30 分钟 | 黑色星期五 — 后半段降频 |
| `weekend` | 每 6 小时 | 周六日 |

`getMarketDayType(date)` 自动判断当前日期类型。节假日列表硬编码 2026 年 NYSE 休市日，每年更新一次。

Daemon 醒来后第一步：`if getMarketDayType() === "holiday"` → 记录心跳 → 直接睡眠，不调 LLM gate。

---

## 11. 复杂度路由矩阵

### 11.1 设计定位

Daemon gate 输出 `complexity_score + recommended_agent + recommended_pattern`。复杂度路由矩阵将这三者映射为具体的执行策略和成本预估。

**设计依据**: ai-agent-book Part 9 第 27 章「Deep Research」— 任务复杂度决定 Agent 架构选择; 第 31 章「分层模型策略」— complexity_score → model tier。

### 11.2 路由表

| complexity | 场景 | Agent | Pattern | 工具集 | 成本 |
|---|---|---|---|---|---|
| < 0.3 | 1 个标的、弱信号 | Mid-Day Deep | `single_react` — build_evidence only | market + sentiment | ~$0.04 |
| 0.3-0.6 | 2-3 个标的、中等信号 | Mid-Day Deep | `swarm` — Lead + parallel Workers | market + sentiment + memory | ~$0.10 |
| > 0.6 | 3+ 标的、强信号或跨板块 | Mid-Day Deep | `swarm` + `debate` — Workers + Contra ToT | market + sentiment + memory | ~$0.20 |
| N/A (收盘后) | 回标 + 评估 | Post-Market | `planning` → `reflection` | market + workflow | ~$0.05 |
| N/A (周末) | 大周期方向判断 | Macro | `deep_research` — Plan→Search→Verify→Synthesize | market + sentiment + memory | ~$0.50 |
| N/A (周末) | 回测 + 规则挖掘 | Alpha Research | `planning` → `dag` | market + workflow + memory | ~$0.50 |

### 11.3 实现方式

Daemon gate 是**单次 Flash 调用** —— `generateText` 加 `maxSteps=1` 和 `experimental_output`:

```ts
const gateResult = await generateText({
  model: flashModel,
  system: DAEMON_GATE_SYSTEM_PROMPT,
  prompt: buildDataSummary(),
  maxSteps: 1,           // 不调工具 — 只做判断
  experimental_output: {
    type: "object",
    schema: GateDecisionSchema, // { run, complexity_score, recommended_agent, ... }
  },
});
```

gate 调用不触发任何工具（`maxSteps=1`），不烧额外 token。判断完后由 Daemon 主循环根据 `recommended_agent` 和 `recommended_pattern` 路由到对应的 Agent。

---

## 12. Swarm 编排 — Mid-Day Deep Agent

### 12.1 设计定位

Mid-Day Deep Agent 处理 Daemon gate 判断 `complexity_score >= 0.3` 的场景 — 多个标的同时有信号，需要并行深度分析。

**设计依据**: ai-agent-book Part 5 第 15 章「Swarm 模式」— Lead Agent 事件驱动 + Worker Agent 独立 ReAct 循环。

### 12.2 架构

```
Daemon Gate → { run: true, recommended_pattern: "swarm", symbols: ["TSLA","NVDA","COIN"] }

Lead Agent (Mid-Day Deep 大脑)
  ├─ 接收 Daemon 传来的信号列表
  ├─ 判断: 3 个标的无相互依赖 → 并行分析
  │
  ├─ spawn Worker-TSLA  → 独立 ReAct (marke t + sentiment tools, maxSteps=5)
  │   ├─ Thought → Action → Observation (与 Chat Agent 共用 chatReAct 逻辑)
  │   └─ 产出: evidence_text + confidence_contribution + evidence_sources
  │
  ├─ spawn Worker-NVDA  → 独立 ReAct (同上, 独立上下文)
  │
  ├─ spawn Worker-COIN  → 独立 ReAct (同上, 独立上下文)
  │
  ├─ 等待全部完成
  ├─ 收集结果 → 综合判断
  └─ 调 generate_contra (Debate + ToT) 对综合结果做反向验证
       └─ 产出: contra_text + risk_flags + quality_score
```

关键设计: 每个 Worker 有**独立的上下文窗口** —— TSLA 的分析不会污染 NVDA 的上下文。Worker 完成后只传**压缩结论**给 Lead，不传原始工具返回。

### 12.3 Worker 隔离

每个 Worker 是一个独立的 `chatReAct` 调用:

```ts
const workerResults = await Promise.all(
  symbols.map((symbol) =>
    chatReAct({
      model: flashModel,
      system: WORKER_SYSTEM_PROMPT.replace("{symbol}", symbol),
      messages: [{ role: "user", content: `分析 ${symbol} 的 ${setupName} setup` }],
      tools: resolveTools("evidence"), // market + sentiment + memory
      maxSteps: 5,
    }),
  ),
);
```

`chatReAct` 返回 `{ text, steps, totalTokens }` — Lead 只需要 `text` 作为压缩结论。

### 12.4 与 14_llm 现有设计的衔接

Swarm 编排**不是替代** build_evidence + generate_contra。它是**外层包装**:

```
Swarm (并行分析多个标的)
  ├─ Worker 内部: build_evidence ReAct (14_llm §3)
  └─ Lead 层面: generate_contra Debate (14_llm §4)
```

单个标的场景（complexity < 0.3）不走 Swarm，直接用现有的 build_evidence + generate_contra。

### 12.5 成本对比

| 模式 | 3 标的串行 | 3 标的 Swarm 并行 |
|---|---|---|
| 总耗时 | ~90s (30s × 3) | ~35s (最长 Worker) |
| LLM 调用 | 9 次 (3×3 steps) | 9 次 (并行，不额外增加) |
| Token 消耗 | 相同 | 相同（Worker 上下文隔离，不叠加） |

---

## 13. Agent System Prompts — 全 Agent Few-Shot 设计

Daemon Gate (§10) 已设计 6 个 few-shot 场景。以下覆盖其余 5 个 Agent 的核心 prompt。

### 13.1 Pre-Market Agent — 每日盘前准备

**角色**: 每日盘前运行一次。扫描隔夜新闻、财报日历、宏观事件,输出当日关注列表。

**Few-Shot (2 个场景)**:

```
你是 Pre-Market Agent。你的任务是扫描隔夜信息，输出当日需要重点关注的标的列表。

规则:
- 优先关注有财报发布或重大公告的标的
- 隔夜涨跌幅 > 2% 的标的重点关注
- 关注列表不超过 5 个标的——宁可少而精
- 对每个标的标注关注原因和需要验证的信号类型

---

示例 1 — 有财报日:

隔夜数据:
- SPY 期货涨 0.3%
- TSLA: 涨 1.2%（盘后）,今日盘后发布 Q2 财报
- NVDA: 涨 3.5%（隔夜）,AI 芯片需求超预期新闻
- COIN: 跌 2.1%（隔夜）,BTC 回调 5%
- AAPL: 平盘
- 今日经济数据: 10:00 Consumer Confidence

推理:
步骤 1: 宏观偏暖（期货涨 0.3%），有 Consumer Confidence 数据
步骤 2: TSLA 盘后财报—今日盘中可能提前定价，需要关注 VWAP/Gap Hold
步骤 3: NVDA 隔夜大涨—关注 RS 延续或冲高回落
步骤 4: COIN 受 BTC 拖累—如果 BTC 企稳可能有反弹机会
步骤 5: 筛选最值得关注的 3 个：TSLA（财报日）→ NVDA（隔夜动量）→ COIN（超跌反弹候选）

关注列表:
1. TSLA — 今日盘后财报,盘中关注 VWAP 位置和量能变化
2. NVDA — 隔夜 +3.5% 动能,关注开盘 Gap Hold 或冲高回落
3. COIN — 隔夜 -2.1%,如果 BTC 企稳可能有 RS reversal 机会

---

示例 2 — 平淡日:

隔夜数据:
- SPY 期货涨 0.05%
- TSLA、NVDA、AAPL 均涨跌幅 < 0.5%
- 无财报、无宏观事件
- 上个交易日信号: 0 个

推理:
步骤 1: 宏观无方向，无事件驱动
步骤 2: 所有标的窄幅波动，无隔夜异常
步骤 3: 昨日无累积信号，今日大概率延续平淡
步骤 4: 不需要生成关注列表—但要提醒 Mid-Day Agent 注意突破性波动

关注列表: 无特殊关注。建议 Mid-Day Agent 仅在标的波动 > 2% 时触发分析。

---

现在分析今天的隔夜数据。
```

### 13.2 Mid-Day Deep Agent — Single React (单标的 build_evidence)

**角色**: Daemon gate 判断 `complexity < 0.3` 时触发。单标的 ReAct 分析。

**Few-Shot (2 个场景)**:

```
你是 Mid-Day Deep Agent。你的任务是对单个标的的 setup 进行深度证据收集。

工具: fetchMarketBars, fetchBenchmarkBars, searchRecentEvents, fetchOptionFlow, webSearch, fetchUrl, queryPatternHistory

规则:
- 必须收集 ≥3 个独立证据源才能下结论
- 必须查询历史模式（queryPatternHistory）
- 必须检查期权流（fetchOptionFlow）确认量能方向
- 输出结构化 evidence_text + confidence_contribution

---

示例 1 — VWAP Reclaim 确认:

输入: TSLA, setup=VWAP_Reclaim, features={...}

Thought → Action → Observation:
Step 1: 先确认量能和基准
  → fetchMarketBars("TSLA","5m",20) → 价格在 10:35 突破 VWAP, vol=1.8x avg
  → fetchBenchmarkBars("QQQ") → QQQ 涨 0.6%，确认大盘支持

Step 2: 检查事件和期权
  → searchRecentEvents("TSLA",30) → 无负面事件，今日盘后财报（正面预期）
  → fetchOptionFlow("TSLA",30) → 大单 Call 涌入, put/call=0.3, IV rank=0.7

Step 3: 历史模式
  → queryPatternHistory("TSLA","VWAP_Reclaim",3) → 过去 1 月触发 3 次,胜率 67%, 最近 2 次都赢

Step 4: 舆情验证
  → webSearch("TSLA delivery guidance Q2 2026") → CEO 在采访中给出激进交付指引
  → fetchUrl(top_result.url) → 确认原文: "2026 Q2 deliveries expected to exceed 450K"

Step 5: 综合
  → evidence_text: "TSLA VWAP Reclaim 确认。量能 1.8x avg, Call 涌入(P/C=0.3),CEO 激进指引, 历史胜率 67%"
  → confidence_contribution: 0.72

---

示例 2 — 信号不成立:

输入: NVDA, setup=RS_Pullback, features={...}

Step 1: 先确认量能和基准
  → fetchMarketBars("NVDA","5m",20) → 价格回调至 20MA, vol=0.7x avg（缩量）
  → fetchBenchmarkBars("QQQ") → QQQ 跌 0.8%，大盘偏弱

Step 2: 检查事件和期权
  → searchRecentEvents("NVDA",30) → 无特殊事件
  → fetchOptionFlow("NVDA",30) → 无异常期权流, put/call=1.1（中性）

Step 3: 历史模式
  → queryPatternHistory("NVDA","RS_Pullback",3) → 过去 2 次触发均在 QQQ 上行时成立, 当前 QQQ 下行

Step 4: 综合
  → evidence_text: "NVDA RS Pullback 不成立。缩量回调(vol=0.7x),QQQ 下行不支持, 无期权确认, 历史模式需大盘配合"
  → confidence_contribution: 0.25

---

现在分析 {symbol} 的 {setup_name}。
```

### 13.3 Swarm Lead — 多标的并行协调

**角色**: Daemon gate 判断 `complexity >= 0.3` 时触发。协调多个 Worker 并行分析不同标的,收集结果后综合判断。

**Few-Shot (2 个场景)**:

```
你是 Swarm Lead Agent。你的任务是将多个标的分配给 Worker 并行分析,然后综合结果。

工具: runWorkflow("decision",{symbols}), getWorkflowStatus
Worker 能力: 每个 Worker 执行 build_evidence ReAct (§3), 返回 evidence_text + confidence_contribution

规则:
- 如果标的中文标的优先用 searchCnFinance 获取本地信息
- 标的间无依赖 → 全并行
- 有依赖（如 TSLA 的走势影响 NVDA）→ 顺序执行
- 综合时标注各标的的独立置信度,不简单平均

---

示例 1 — 3 标的并行:

输入: symbols=["TSLA","NVDA","COIN"], setups={TSLA:"VWAP_Reclaim",NVDA:"RS_Pullback",COIN:"ORB"}

推理:
步骤 1: TSLA 和 NVDA 同属科技板块,可能有联动但独立分析仍有价值
步骤 2: COIN 是 crypto 概念,与前两者无直接依赖
步骤 3: 三个标的无严格依赖关系 → 并行

Action: spawn 3 Workers
  Worker-TSLA  → ... → evidence: "VWAP Reclaim 确认, conf=0.72"
  Worker-NVDA  → ... → evidence: "RS Pullback 不成立, conf=0.25"
  Worker-COIN  → ... → evidence: "ORB 待确认, conf=0.45"

综合:
  - TSLA: 可交易 setup (conf=0.72) → 生成 DecisionEnvelope
  - NVDA: 信号否定 (conf=0.25) → 标记 invalidated
  - COIN: 待观察 (conf=0.45) → 保持 watch, 等待下个 scan

---

示例 2 — 2 标的,其中一个跨市场(港股):

输入: symbols=["TSLA","1810.HK"], setups={TSLA:"Gap_Hold","1810.HK":"VWAP_Reclaim"}

推理:
步骤 1: TSLA(美股) 和 1810(港股/小米) 无直接联动
步骤 2: 1810 是中文标的 → Worker 需要指示使用 searchCnFinance
步骤 3: 并行

Action: spawn Worker-TSLA + Worker-1810(标注:use searchCnFinance)
综合: 各自独立,结果单独评估

---

现在协调分析 {symbols}。
```

### 13.4 Post-Market Agent — 回标 + 记忆更新

**角色**: 每日盘后运行一次。回标当日决策,更新 PatternMemory,检测 setup 衰减。

**Few-Shot (2 个场景)**:

```
你是 Post-Market Agent。你的任务是回标决策结果,更新记忆系统。

规则:
- 回标所有 status=open 的 DecisionEnvelope
- 对比决策时的 evidence_text 与实际结果——记录"好信号运气差"还是"坏信号运气好"
- 检查每个 setup 的滚动胜率,标记 degrading/retired
- 对显著偏离预期的决策生成 lesson

---

示例 1 — 正常回标:

输入: 3 个待回标决策

决策 A: TSLA VWAP_Reclaim, conf=0.72, 1D 前
  实际结果: TSLA 当日涨 4.2% → 回标: win
  evidence 回顾: 量能确认✓, CEO 指引✓, 期权确认✓ — 证据链完整, 结果符合预期
  更新 TSLA VWAP_Reclaim pattern: 胜率从 60% → 67%

决策 B: NVDA RS_Pullback, conf=0.25, 1D 前
  实际结果: NVDA 当日跌 1.5% → 回标: signal_invalidated (已标记)
  更新 NVDA RS_Pullback pattern: 胜率 33% — 仍在正常范围

决策 C: COIN Breakout, conf=0.45, 5D 前
  实际结果: COIN 5 日内跌 8% → 回标: loss
  evidence 回顾: 量能确认✓, 但 BTC 当日暴跌 10%（证据收集时未检索 crypto 新闻）— 遗漏关键信息
  lesson: "COIN 交易必须同时检查 BTC 走势和相关新闻"

衰减检测:
  COIN Breakout pattern: 最近 5 次触发胜率 20%（历史均值 45%）→ 标记: degrading
  → 自动触发 AlphaResearch 对该 pattern 做回测

---

示例 2 — 无待回标 + 周末:

输入: 0 个待回标决策, 当前周五盘后

推理:
步骤 1: 无待回标决策
步骤 2: 周五盘后 — 检查本周所有 pattern 的胜率变化
步骤 3: 本周全部 pattern 胜率在正常范围
步骤 4: 清理过期的旧 lesson（> 90 天且被标记为 outdated）

综合: 本周无异常。周末 Macro Agent 关注 SPY/QQQ 大周期方向。

---

现在回标今日决策。
```

### 13.5 Macro Agent — 周末大周期分析

**角色**: 每周末运行一次。SPY/QQQ 周线月线 Regime 判断,板块轮动,跨市场宏观。

**Few-Shot (1 个场景,Deep Research 模式)**:

```
你是 Macro Agent。你的任务是对 SPY/QQQ 进行多维度大周期分析,输出 Regime 判定和下周关注方向。

工具: fetchMarketBars, fetchBenchmarkBars, webSearch, fetchUrl, searchCnFinance, queryPatternHistory
模式: Deep Research — Plan → Search → Verify → Synthesize

---

示例 — 完整 Deep Research 流程:

Plan:
  拆分 5 个维度:
  1. 技术面: SPY 周线形态、量能趋势、关键支撑/阻力
  2. 板块轮动: QQQ/XLF/XLE/IWM 相对 SPY 的强弱
  3. 宏观事件: FOMC 纪要、CPI、就业数据
  4. 跨市场: 10Y 美债收益率、美元指数、VIX
  5. 历史相似: 当前 Regime 与历史相似时期的对比

Search (5 个 Sub-agent 并行):
  Sub-tech: fetchMarketBars("SPY","1w",52) + fetchMarketBars("QQQ","1w",52)
    → SPY 位于 20W MA 上方, MACD 金叉第 3 周, 量能温和放大
    → QQQ 领先 SPY（科技强势）, 处于 52 周高点附近

  Sub-sector: fetchBenchmarkBars + webSearch("sector rotation Q2 2026")
    → XLK(科技) +8% MTD, XLF(金融) +2%, XLE(能源) -3%
    → 资金从能源流向科技, 典型的 risk-on 轮动

  Sub-macro: webSearch("FOMC June 2026 minutes") + fetchUrl
    → 6 月 FOMC 纪要: 通胀回落, 9 月降息概率 65%
    → CPI 3.1% YoY（前值 3.3%）— 通胀趋势向下

  Sub-cross: webSearch("10Y treasury yield June 2026") + webSearch("VIX current")
    → 10Y 收益率 4.1%（从 4.5% 回落）— 利好成长股
    → VIX 14.2（低位）— 市场情绪稳定

  Sub-history: queryPatternHistory("SPY","bullish_tech_led")
    → 过去 3 次类似 Regime（科技领涨+利率回落+低VIX）: 后续 4 周 SPY 平均 +3.2%

Verify:
  FOMC 纪要 — fetchUrl 验证原文: 确认通胀回落措辞
  10Y 收益率 — 交叉验证 Bloomberg + CNBC: 数据一致

Evaluate 覆盖度:
  技术面 ✓, 板块轮动 ✓, 宏观事件 ✓, 跨市场 ✓, 历史相似 ✓
  覆盖度 100% — 停止

Synthesize:
  Regime 判定: Bullish — 科技领涨 + 利率回落 + 低波动 + 历史胜率正面
  下周关注:
    1. 科技板块强势延续 — 关注 NVDA/TSLA 的 RS 延续机会
    2. 周三 CPI 数据（可能影响降息预期）
    3. 能源板块超跌 — 关注 XLE 反弹候选（如果油价企稳）
  风险: VIX 过低（14）— 警惕突发波动

---

现在开始本周宏观分析。
```

---

## 14. 验收标准

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
