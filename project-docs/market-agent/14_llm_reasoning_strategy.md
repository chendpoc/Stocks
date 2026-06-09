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

ReAct 循环 (max 3 steps):
┌──────────────────────────────────────────────────────┐
│ Step 1: Thought → "需要验证量能和基准背景"              │
│         Action → fetch_market_bars(symbol, 5m, 20)    │
│         Action → fetch_benchmark_bars(symbol)          │
│         Observation → { bars, benchmark }              │
│                                                       │
│ Step 2: Thought → "量能确认，但需要检查事件"            │
│         Action → search_recent_events(symbol, 30min)   │
│         Observation → { events }                       │
│                                                       │
│ Step 3: Thought → "证据充分，综合输出"                  │
│         → final answer (no tool call)                  │
└──────────────────────────────────────────────────────┘
输出: { evidence_text, confidence_contribution, evidence_sources[] }
```

### 3.2 工具白名单（仅 3 个）

| 工具 | 签名 | 用途 |
|---|---|---|
| `fetch_market_bars` | `(symbol, timeframe, limit)` → `MarketBar[]` | 读取标的 K 线 |
| `fetch_benchmark_bars` | `(symbol)` → `MarketBar[]` | 读取基准 (QQQ/SPY) K 线 |
| `search_recent_events` | `(symbol, window_minutes)` → `Event[]` | 搜索近期事件 |

### 3.3 输出格式

```json
{
  "evidence_text": "string (≤200 words)",
  "confidence_contribution": 0.0 - 1.0,
  "evidence_sources": ["market_bars:TSLA:5m", "benchmark:QQQ:5m", "events:TSLA:30m"]
}
```

### 3.4 降级路径

```
LLM 不可用 / 超时 5s
  → evidence_text = "LLM unavailable — evidence not generated"
  → confidence_contribution = 0
  → evidence_sources = []
  → RiskGate 检测到 confidence=0 → 标记 needs_review
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
  "top_failure_paths": [
    {"path": "无量假突破", "score": 0.8, "detail": "..."},
    {"path": "基准反向破位", "score": 0.7, "detail": "..."}
  ]
}
```

### 4.4 降级路径

```
Proposer 不可用 → 跳过，evidence 直接作为支撑
Opponent 不可用 → 跳过，无 risk_flags
Judge 不可用 → 取 Opponent 的 top_failure_paths 直接作为 contra
全部不可用 → contra_text = "LLM unavailable — contra not generated"
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
| `build_evidence` ReAct | **Flash** | off | 工具调用 → 推理深度中等 |
| `contra` Proposer | **Flash** | off | 轻量正向论证 |
| `contra` Opponent (ToT) | **Pro** | **on** | 需要深度多路径推理 |
| `contra` Judge | **Pro** | off | 综合裁决，不需要长链思考 |
| DAG Research Tasks | **Flash** | off | 并行多个轻量研究 |
| DAG Synthesis | **Pro** | **on** | 汇聚多研究结果 |
| Context Planning | **Flash** | off | 轻量规划 |
| Context Reflection | **Pro** | off | 自我审查 |

### 5.3 成本预算（单 tick，5 symbols）

| 调用 | 模型 | 并行 | 耗时 | 成本/tick |
|---|---|---|---|---|
| 5× build_evidence (ReAct, ~3 steps) | Flash | ∥ | ~4s | ~$0.002 |
| 5× contra Proposer | Flash | ∥ | ~1.5s | ~$0.001 |
| 5× contra Opponent (ToT) | Pro-thinking | ∥ | ~6s | ~$0.02 |
| 5× contra Judge | Pro | ∥ | ~1.5s | ~$0.005 |
| **合计** | | | **~6s** | **~$0.03** |

按 5m 频率：78 tick/天 × $0.03 = **$2.34/天**。1d 频率：1 tick/天 × $0.03 = **$0.03/天**。

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

## 7. 非目标

1. 不让 LLM 直接决定 setup 是否成立（SetupDetector 是确定性的）
2. 不让 LLM 直接决定交易动作（RiskGate + DecisionEnvelope 是规则驱动的）
3. 不让 LLM 访问原始市场数据（只有 FeatureEngine 输出的结构化特征 + 白名单工具）
4. 不让 LLM 写入数据库
5. 不把 30 年历史数据塞进 prompt

---

## 8. Prompt 模板索引

| 模板 ID | 角色 | 位置 |
|---|---|---|
| `EVIDENCE_SYSTEM` | build_evidence 系统消息 | `src/services/marketAgentPrompts.ts` |
| `EVIDENCE_USER` | build_evidence 用户 prompt | 同上 |
| `CONTRA_PROPOSER` | contra Proposer 系统 + user | 同上 |
| `CONTRA_OPPONENT` | contra Opponent (ToT) 系统 + user | 同上 |
| `CONTRA_JUDGE` | contra Judge 系统 + user | 同上 |

---

## 9. 验收标准

1. ModelRouter 可以按环境变量选择 Flash/Pro 两种模型
2. EvidenceBuilder 在 ReAct 循环中正确调用白名单工具
3. ContraGenerator 三角色完整执行（Proposer → Opponent → Judge）
4. Opponent Tree of Thoughts 正确剪枝（保留 top 2 路径）
5. LLM 不可用时降级路径正确触发
6. 单 symbol 的 evidence + contra 总延迟 < 10 秒
