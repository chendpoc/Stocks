# 04 — AI / RAG / MCP 平台路线 PRD

版本：`v0.1`  
状态：目标系统补充 PRD  
文档定位：定义 Agent Core 在 AI 模型、知识检索、工具协议、市场数据和自学习能力上的轻量化实现路线。  
上游依据：`00-system-overview.md`、`01-agent-core-backend-prd.md`、`01-agent-core-implementation-plan.md`、用户最新约束。

---

## 1. 结论

当前阶段不应把 LangChain、LangGraph、LlamaIndex、Milvus、Pinecone、完整 MCP 工具网关一次性引入主链路。

第一版更合理的路线是：

```text
本地资料库
  -> SQLite / JSONL / Markdown archive
  -> SQLite FTS5 keyword search
  -> LocalToolAdapter 获取行情、公告、新闻
  -> Deterministic Rule Engine 生成 signal
  -> 可选 Direct Structured Model Calls
  -> 人工审批后进入规则候选或模拟账户 backlog
```

原因很简单：本系统的核心难点不是“缺一个 agent 框架”，而是把赵哥语料、市场数据、新闻公告、规则候选和风控边界变成可追溯的证据链。框架只能在证据链稳定后降低复杂度，不能替代证据质量。

---

## 2. 已锁定需求

| 决策项 | 当前结论 |
|---|---|
| 系统重量 | 本地优先、轻量优先；不为专业感提前引入重型基础设施 |
| SaaS | 不依赖 SaaS 作为核心数据、向量库或流程编排基础 |
| 付费模型 | DeepSeek API 可作为唯一第一版远程模型，默认关闭，人工启用 |
| 本地模型 | Codex CLI runtime 可作为第一版本地可选结构化推理通道，默认关闭，人工启用 |
| 扫描频率 | 默认支持 1 分钟扫描，可配置 5 分钟、15 分钟和手动触发 |
| 交易频率 | 不做高频；最多分钟级信息查询和机会判断 |
| 输出形态 | 允许输出明确观点、原因、观察/等待/失效/触发条件；不自动实盘下单 |
| 期权视角 | 可提供期权日、多空双杀、波动风险解释；不得生成自动执行指令 |
| Longbridge | 第一阶段可作为行情数据接入候选；模拟账户能力进入后续 backlog |
| 默认股票池 | 默认使用 RulePack 当前 7 个标的：SPY、QQQ、TSLA、NVDA、AAPL、COIN、BMNR |
| 新标的发现 | 可从新闻和异动中发现候选标的，但不能自动加入 active universe |
| 主要语料源 | `docs/summaries` 中赵哥群聊总结是第一知识源 |
| 外部资料源 | SEC / 公司公告 / 财报 / 新闻 archive 作为证据源 |
| X 资料 | `xiaozhaolucky` 公开发言和转发机器交易信号可作为辅助线索，必须本地归档后才能进入语料库 |

---

## 3. 非目标

- 不做高频交易信号挖掘。
- 不与机构级低延迟行情和撮合系统竞争。
- 不把 LLM 的自由判断当成交易信号。
- 不把 X、新闻、自媒体内容直接当作事实源。
- 不把 DeepSeek 或任何远程模型设置为默认必需依赖。
- 不构建通用 ModelGateway、provider router、Vercel AI Gateway 或 OpenRouter 抽象。
- 不让 Codex CLI runtime 拥有写文件、调用交易工具、变更 signal、审批规则或覆盖风控的权限。
- 不在第一版接入真实券商交易执行。
- 不让 agent 自动启用新规则、扩大股票池、提升风险权限。
- 不使用 Pinecone 等 SaaS 向量库作为核心依赖。

---

## 4. 第一性原理拆解

### 4.1 本系统真正需要的能力

Agent Core 需要回答五个问题：

```text
1. 赵哥过去说过什么规律？
2. 当前市场是否出现了类似结构？
3. 这个结构需要哪些行情、公告、新闻、日历、期权或加密数据验证？
4. 如果条件满足，当前状态是观察、等待、触发还是失效？
5. 这条规则是否值得继续跟踪、回测和人工审批？
```

所以第一版的技术中心不是通用 agent 框架，而是：

```text
Knowledge Corpus
Evidence Retrieval
Tool Adapter
Rule Engine
Risk Engine
Signal Lifecycle
Lite Backtest
Audit Trail
```

### 4.2 AI 模型的正确位置

AI 模型不应直接决定买卖。它在第一版只承担四类任务：

1. 从赵哥语料中抽取候选规则、触发条件、失效条件和上下文。
2. 对新闻、公告、财报和宏观信息做摘要与事件分类。
3. 为已由 deterministic services 生成的 signal 做解释。
4. 为规则候选生成证据需求和简版回测说明。

所有模型输出必须落到结构化对象：

```text
RuleCandidate
EvidenceRequirement
MarketNarrative
SignalExplanation
LiteBacktestReport
```

自由文本只能作为解释，不作为状态机输入的唯一依据。

---

## 5. 技术路线

### 5.1 Phase A：当前 Agent Core 主线

继续执行 `01-agent-core-implementation-plan.md`。

默认栈：

```text
Python
FastAPI
SQLite
JSONL / Markdown files
LocalToolAdapter
RulePack YAML
pytest
ruff
```

本阶段不引入 LangGraph / LlamaIndex / Qdrant / MCP 作为硬依赖。

验收重点：

- 固定股票池强约束。
- 分钟级市场快照。
- setup deterministic detection。
- signal 状态清晰。
- 每次状态变化写入 `agent_events`。
- 不自动下单。

### 5.2 Phase B：本地知识库与轻量 RAG

目标：让 Agent 能检索赵哥语料、总结文档、公告和新闻 archive。

默认实现：

```text
KnowledgeSourceRegistry
  - docs/summaries/**/*.md
  - data/trader-agent/raw/trader_messages.jsonl
  - data/trader-agent/raw/x_posts.jsonl
  - data/trader-agent/raw/news_events.jsonl
  - data/trader-agent/raw/filing_events.jsonl

DocumentIndexer
  - Markdown parser
  - JSONL parser
  - normalized document chunks

LocalSearchIndex
  - SQLite FTS5
  - symbol/date/source filters
  - keyword first, semantic later
```

第一版优先 SQLite FTS5，而不是直接上向量库。原因：

- 金融语料里 ticker、价格、日期、百分比、规则名更适合精确检索。
- 当前文档规模可控。
- FTS5 不引入新服务。
- 检索结果更容易审计。

升级触发条件：

| 升级项 | 触发条件 |
|---|---|
| LlamaIndex | 文档类型增多，需要统一 loader、chunk、retriever 抽象 |
| Chroma / Qdrant | 语义近似检索明显优于关键词检索，且 FTS 召回不足 |
| Hybrid retrieval | 同一问题需要同时按 ticker/date 精确过滤和按语义召回 |
| Reranker | 检索结果过多，解释质量受噪音影响 |

### 5.3 Phase C：Direct Structured Model Calls

目标：在不引入通用模型网关的前提下，让 Agent Core 可以按需调用 DeepSeek direct 或 Codex CLI runtime 完成少量结构化任务，并把结果返回 Python backend 进入审计链路。

接口形态：

```text
StructuredModelCalls.generate(
  task_type,
  input_payload,
  schema_name,
  model_channel,
  evidence_ids,
  input_digest,
  cost_policy
)
```

第一版模型通道：

| Channel | 默认状态 | 用途 | 硬边界 |
|---|---|---|---|
| `deepseek_direct` | 默认关闭 | 复杂新闻、公告、规则解释和结构化分类 | 需要 API key；不经过 Vercel AI Gateway 或 OpenRouter |
| `codex_cli_runtime` | 默认关闭 | 本地复杂文档理解、规则候选整理、解释草稿 | 只允许结构化输入输出；不得写文件、调用交易工具或修改状态 |

第一版允许任务：

| Task | 默认状态 | 用途 |
|---|---|---|
| `news_event_classification` | 手动启用 | 将新闻或公告归类为宏观、财报、减持、地缘风险、期权市场、币股联动等事件 |
| `evidence_summary` | 手动启用 | 总结一组 evidence 的要点和冲突 |
| `signal_explanation_draft` | 手动启用 | 为已存在的 deterministic signal 起草解释文本 |
| `rule_candidate_wording` | 手动启用 | 辅助把人工确认的规律整理为规则候选草案 |

约束：

- DeepSeek 必须手动启用，并且必须存在 operator-provided API key。
- Codex CLI runtime 必须手动启用，并且必须配置可执行路径、超时、输入大小上限和只读运行策略。
- 不接入 Vercel AI Gateway、OpenRouter、LangChain 或 LangGraph。
- 任何模型调用必须记录 `agent_events`。
- 发送给模型的内容必须可追踪来源，并记录 `evidence_ids` 与 `input_digest`。
- 模型不接收未脱敏的敏感账户信息。
- 如果使用 Node/TypeScript helper，结构化输出必须通过 Zod schema 校验。
- schema 校验失败不能返回给 Python backend 作为有效结果，也不能进入 signal 状态机。
- 模型输出只能解释、分类、总结或起草候选，不得创建交易执行指令。

### 5.4 Phase D：市场数据与新闻工具

目标：让 Agent 按需查阅信息，而不是凭空推断。

第一版工具能力：

| Tool | 第一版用途 | 默认状态 |
|---|---|---|
| Fixture market bars | 测试和本地回放 | 启用 |
| yfinance | 美股分钟/日线候选数据 | 手动启用 |
| Alpha Vantage | 美股行情和基础数据候选 | 手动启用 |
| Longbridge market data | 行情候选接入 | 手动启用 |
| SEC / EDGAR | 公告、持股、减持、财报事件 | 手动启用 |
| News archive | 本地新闻归档 | 启用 |
| Web search | 人工触发研究，不作为自动扫描默认工具 | 手动启用 |

AkShare 主要偏国内市场生态，不作为美股第一默认依赖。

每个 tool 返回统一证据对象：

```json
{
  "evidence_id": "string",
  "source_type": "market_bar | filing | news | x_post | calendar | model_output",
  "provider": "string",
  "symbol": "string",
  "timestamp": "ISO-8601",
  "retrieved_at": "ISO-8601",
  "payload": {},
  "confidence": "high | medium | low",
  "limitations": []
}
```

### 5.5 Phase E：MCP / Tool Gateway

MCP 的正确定位是“标准化工具连接协议”，不是第一版 Agent Core 必需骨架。

当前策略：

```text
Phase 1:
  LocalToolAdapter only

Phase 2:
  ToolRegistry
  ToolPermissionPolicy
  ToolCallAudit

Phase 3:
  MCP adapter for low-risk read-only tools
```

只允许先接入 read-only MCP 工具：

- 本地文件读取。
- 本地知识库检索。
- 行情查询。
- 公告查询。
- 新闻 archive 查询。

禁止第一阶段 MCP 工具：

- 真实下单。
- 修改 RulePack active 状态。
- 修改股票池。
- 调用未审批远程服务。
- 读取未授权本地目录。

### 5.6 Phase F：简版回测与规则发现

目标：让 Agent 可以发现新机会，但不能自动上线。

规则发现链路：

```text
市场异动 / 赵哥语料 / 新闻结构变化 / X 线索
  -> RuleCandidate
  -> EvidenceRequirement
  -> LiteBacktest
  -> LiteBacktestReport
  -> pending_shadow_tracking 或 pending_manual_approval
```

Backtrader 的位置：

- 第一版不强制引入。
- 先实现项目内 lite backtest，保证样本、触发、失效、成本、MAE/MFE 可审计。
- 当策略组合复杂、订单模型复杂、持仓状态复杂时，再封装 Backtrader adapter。

---

## 6. 知识源规范

### 6.1 赵哥群聊总结

`docs/summaries` 是第一语料源。

索引字段：

```text
source_path
summary_time
session_type
mentioned_symbols
rule_mentions
trigger_conditions
invalidation_conditions
risk_notes
confidence
```

### 6.2 X / xiaozhaolucky

公开检索到第三方镜像页中存在 `xiaozhaolucky` 账号片段，包含类似 `second handshake`、`options disturbance`、`gold signal`、TSLL / BMNR / MSTR / BTC 相关表达。但第三方镜像不是稳定事实源。

因此采用以下规则：

1. X 内容只能作为 `x_post_reference` 辅助线索。
2. 必须有原始 URL、截图、采集时间、采集人或本地快照。
3. 没有本地归档的 X 内容不能参与 RuleCandidate 评分。
4. 转发的机器交易信号原帖可以进入 `machine_signal_reference`，但必须记录原作者、原帖 URL、转发上下文和失效风险。
5. X 内容默认 `confidence=low`，除非能被行情、公告或后续结果验证。

建议本地文件：

```text
data/trader-agent/raw/x_posts.jsonl
```

最小字段：

```json
{
  "source": "x",
  "account": "xiaozhaolucky",
  "post_url": "string",
  "captured_at": "ISO-8601",
  "posted_at": "ISO-8601 or null",
  "text": "string",
  "media_paths": [],
  "symbols": [],
  "referenced_post_url": "string or null",
  "reference_type": "original | repost | quote | mirror",
  "confidence": "low"
}
```

### 6.3 SEC / 公告 / 财报

官方公告用于验证：

- 减持。
- 增持。
- 财报日期和结果。
- 重大诉讼。
- 并购、融资、拆股、监管风险。

这些源的优先级高于新闻和社交媒体。

### 6.4 新闻 archive

新闻用于建立叙事和风险背景，但不能独立触发执行状态。

新闻事件必须被分类为：

```text
macro
earnings
filing
geopolitical
sector
company_specific
options_market
crypto_beta
```

---

## 7. 输出规范

Signal 必须输出状态，而不是交易命令。

允许输出：

```text
observe
waiting_trigger
triggered
invalidated
```

允许解释：

```text
当前倾向：偏多 / 偏空 / 中性 / 不交易
理由：证据链摘要
触发条件：价格、量能、时间、新闻确认、市场 gate
失效条件：跌破/突破、量能不满足、公告冲突、风险 gate 关闭
可考虑动作：人工评估 1/3 常规仓位、尾盘观察、夜盘观察、盘前人工处理
```

禁止输出：

```text
自动买入
自动卖出
绕过审批
保证盈利
无风险套利
直接连接实盘执行
```

仓位语言必须是“人工评估建议”，不能是系统执行指令。

---

## 8. 目标架构

```text
apps/trader-agent/backend
  modules/
    knowledge_source_registry.py
    document_indexer.py
    local_search.py
    model_gateway.py
    market_snapshot.py
    setup_detection.py
    rule_engine.py
    risk.py
    signal_manager.py
    rule_discovery.py
    explanation.py
  tools/
    local_adapter.py
    sec_adapter.py
    yfinance_adapter.py
    longbridge_adapter.py
    news_archive_adapter.py
  data/
    SQLite runtime state
    JSONL raw archive
```

运行流程：

```text
Scan Scheduler
  -> Market Snapshot
  -> Setup Detection
  -> Knowledge Retrieval
  -> Optional Direct Structured Model Explanation
  -> Rule Engine
  -> Risk Engine
  -> Signal Manager
  -> Agent Events
```

---

## 9. 里程碑

### Milestone 1：完成 deterministic pipeline

对应当前 Phase 1C / 1D。

验收：

- 1 分钟 / 5 分钟 / 15 分钟 / 手动扫描配置存在。
- 只扫描 RulePack active universe。
- setup detection 能输出 `observe`、`waiting_trigger`、`invalidated`。
- 不调用模型也能跑通。

### Milestone 2：本地知识库检索

验收：

- 能索引 `docs/summaries`。
- 能按 ticker、日期、规则关键词检索。
- 能返回 evidence IDs。
- 检索结果可以进入 explanation，但不能单独触发 signal。

### Milestone 3：Direct Structured Model Calls

验收：

- DeepSeek direct 默认关闭，必须显式配置 API key 和 capability flag。
- Codex CLI runtime 默认关闭，必须显式配置 executable path、timeout、input limit 和 capability flag。
- 第一版不实现通用 ModelGateway、provider router、Vercel AI Gateway 或 OpenRouter。
- 结构化任务必须通过 Zod schema validate。
- 验证通过的结果返回 Python backend。
- 每次调用、失败、拒绝和 schema 错误都写入 `agent_events`。

### Milestone 4：外部工具扩展

验收：

- SEC / EDGAR 或等价公告源可返回 filing evidence。
- yfinance / Alpha Vantage / Longbridge 至少一个美股行情源可手动启用。
- 所有 live provider 都有 capability flag。
- Provider 不得被业务模块直接 import，必须通过 adapter。

### Milestone 5：规则发现与简版回测

验收：

- 能从语料、X 线索、新闻结构和行情异动生成 RuleCandidate。
- 能生成 EvidenceRequirement。
- 能跑 lite backtest。
- 规则只能进入 shadow tracking 或人工审批，不能自动 active。

---

## 10. 验收标准

- 文档明确 AI / RAG / MCP 不作为 Phase 1 硬依赖。
- 本地数据、免费框架、可选 DeepSeek 的边界清晰。
- `docs/summaries` 被定义为第一知识源。
- X 内容被定义为低置信辅助线索，必须本地归档。
- 默认扫描频率支持 1 分钟，并可降为 5 / 15 分钟或手动。
- 默认股票池与 RulePack 7 个标的一致。
- 输出允许明确观点，但必须以状态、证据、触发和失效条件表达。
- Longbridge 模拟账户被放入后续 backlog，不进入当前主线。
- 不要求 Pinecone、Milvus、LangSmith、Dify、Langflow 等 SaaS 或重型平台。

---

## 11. 风险

| 风险 | 影响 | 控制方式 |
|---|---|---|
| 过早引入 agent 框架 | 调试成本上升，证据链不清晰 | Phase 1 禁止框架成为主链路 |
| X 信息不可验证 | 规则污染 | X 只做低置信线索，必须本地归档 |
| 新闻叙事过强 | 模型幻觉或过度交易 | 新闻只做 evidence，不能单独触发执行 |
| 分钟级数据质量不足 | setup 误判 | provider 标记、缺口标记、fixture 回放 |
| DeepSeek 成本和隐私 | 远程泄露与不可控成本 | 默认关闭、人工启用、调用审计 |
| 模拟账户过早接入 | 把研究系统误用成交易执行系统 | 放入 backlog，等主系统稳定后再设计 |

---

## 12. 参考资料

- [SQLite FTS5 Extension](https://www.sqlite.org/fts5.html)
- [LlamaIndex Vector Store Index](https://docs.llamaindex.ai/en/stable/module_guides/indexing/vector_store_index/)
- [LangGraph overview](https://docs.langchain.com/oss/python/langgraph)
- [Qdrant Quickstart](https://qdrant.tech/documentation/quick-start/)
- [Backtrader documentation](https://www.backtrader.com/)
- [Model Context Protocol specification 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18)
- [DeepSeek API Docs](https://api-docs.deepseek.com/)
- [TwStalker mirror: xiaozhaolucky](https://twstalker.com/xiaozhaolucky)
