# 17. Agent Runtime / SDK 技术调研

> 状态: research | 非 source-of-truth | 日期: 2026-06-10
>
> 本文只用于技术选型判断。它不改变 `00`-`14` 的 Market Agent 执行口径，不创建 worker 任务，不授权迁移 LangGraph / Workflow Runtime / CLI / 数据库。

---

## 1. 结论

短期 Market Agent MVP 不迁移到 Shannon、OpenAI Agents SDK 或 Vercel AI SDK Agent。

当前主线继续使用：

```text
Workflow / Native LangGraph Graph
  -> Stage1Runtime
  -> deterministic Market Agent services
  -> bounded LLM provider adapter
```

三个外部方案的合适位置不同：

| 候选 | 合适层级 | 对当前主线的判断 |
|---|---|---|
| OpenAI SDK (`openai`) | Provider SDK | 可作为 OpenAI-first provider adapter 候选，不替代 Workflow Runtime。 |
| Vercel AI SDK | TypeScript provider / tool loop / UI streaming | 可替换或补强 `apps/trader-workflows/src/llm/provider.ts`，不替代 `Stage1Runtime`。 |
| OpenAI Agents SDK | Agent Node runtime | 可在单个 **Agent Node** 内试点，不替代现有 **Native LangGraph Graph**。 |
| Shannon / `shannon-sdk` | Production Agent Platform | 只作为未来平台化 spike；不进入 Market Agent MVP。 |

---

## 2. 当前项目事实

### 2.1 Workflow Runtime

主线 runtime 已经是 LangGraph 体系：

- `apps/trader-workflows/package.json` 依赖 `@langchain/langgraph`、`@langchain/langgraph-checkpoint-sqlite`、`@langchain/langgraph-cli`。
- `apps/trader-workflows/src/runtime/stage1Runtime.ts` 负责 **Workflow Run**、checkpoint、resume、run monitor 和 graph 包装。
- `apps/trader-workflows/src/graphs/00-decision/`、`01-outcome/`、`02-evaluation/`、`03-insightExploration/`、`04-alphaResearch/` 已经是 **Native LangGraph Graph**。

这意味着替换 LangGraph 不是 provider 迁移，而是会触及 **Workflow Run**、**Checkpoint**、CLI 验收、run monitor、测试契约和文档术语。

### 2.2 LLM Provider

当前 provider 分布不一致：

| 区域 | 当前方式 | 备注 |
|---|---|---|
| `apps/trader-workflows/src/llm/provider.ts` | 手写 OpenAI-compatible `fetch(.../chat/completions)` | 主线 DecisionGraph / InsightExplorationGraph 使用。 |
| `apps/trader-cli/src/llm/provider.ts` | Vercel AI SDK `createOpenAI` / `createAnthropic` | 旧 `trader-cli` 使用，不是 Market Agent CLI source-of-truth。 |
| `apps/trader-agent/backend/app/modules/structured_model_calls.py` | 手写 DeepSeek HTTP | 后端结构化模型调用。 |
| `utils/agent.py` | Python `openai.OpenAI` | 总结脚本/旧工具使用。 |

因此当前最小可控改造点是 provider adapter，而不是 Workflow Runtime。

### 2.3 未使用项

当前仓库没有发现：

- `@openai/agents`
- `openai-agents`
- `shannon-sdk`

这些不能被文档描述为既有依赖。

---

## 3. 外部方案定位

### 3.1 OpenAI SDK

OpenAI 官方 SDK 适合直接调用 OpenAI API。它解决的是 provider API client 问题，不负责我们的 **Workflow Run**、checkpoint、Outcome、Evaluation、Promotion 状态机。

适合替换：

- 手写 OpenAI-compatible fetch 中的 OpenAI-first 分支。
- 需要 Responses API、OpenAI hosted tools、官方 tracing/eval 生态的单点调用。

不适合替换：

- `Stage1Runtime`
- `DecisionGraph` / `OutcomeGraph` / `EvaluationGraph`
- Market Agent deterministic services

### 3.2 Vercel AI SDK

Vercel AI SDK Core 提供统一的 TypeScript LLM 调用接口，覆盖 `generateText`、`streamText`、structured output、tool calling。官方文档强调它对多 provider 做标准化，并支持结构化输出与工具调用结合。

适合替换：

- `apps/trader-workflows/src/llm/provider.ts` 里的手写 JSON parse / repair / retry 的一部分。
- 未来 Operator Surface 的 streaming / UI message protocol。
- TypeScript 侧工具调用、structured output、测试模型和 telemetry。

不适合替换：

- Python 后端 direct DeepSeek 调用，除非引入 Node sidecar。
- `Stage1Runtime` 的 checkpoint / resume 语义。
- Market Agent 的 deterministic facts layer。

注意：如果继续支持 DeepSeek，不应把 `@ai-sdk/openai` 当作 DeepSeek 的语义 source-of-truth。应优先评估 DeepSeek provider 或 OpenAI-compatible provider，并保留 `reasoning_content`、`thinking` 等 provider-specific adapter。

### 3.3 OpenAI Agents SDK

OpenAI Agents SDK 的定位是 code-first Agent runtime。官方文档明确建议在应用拥有 orchestration、tool execution、approvals、state 时使用 Agents SDK；它还支持 handoff 和 agents-as-tools 两种 multi-agent pattern。

适合试点：

- 将 `build_evidence` 或 `generate_contra` 封装为一个 **Agent Node**。
- 在单个 bounded specialist 内使用 tools、guardrails、handoff、tracing。
- OpenAI-first 的解释/审查节点。

不适合当前替换：

- `Stage1Runtime`
- 现有 **Native LangGraph Graph** 拓扑
- `OutcomeGraph` / `EvaluationGraph` / `InsightExplorationGraph`

原因：我们的 **Workflow Owner** 已经是 `Stage1Runtime` + graph contract。Agents SDK 可以是节点内部 runtime，但不应该在 MVP 阶段抢走 workflow ownership。

### 3.4 Shannon / `shannon-sdk`

Shannon 是 production-oriented multi-agent orchestration framework，不是一个普通 provider SDK。官方 quickstart 和 README 描述的核心组件包括 Gateway、Orchestrator、Agent Core、LLM Service；底层涉及 Temporal workflow、WASI sandbox、budget control、observability、OpenAI-compatible API 和 Python SDK。

`shannon-sdk` 的角色更像 Shannon Gateway 的 Python client：

```text
client -> Shannon Gateway -> Orchestrator -> Agent Core -> LLM Service -> providers
```

适合未来评估：

- 分布式 multi-agent orchestration。
- 硬 token budget、time-travel debugging、human approval workflow。
- 用 OpenAI-compatible endpoint 作为统一 agent platform。
- 把 Market Agent 的 deterministic services 暴露成 Shannon tools。

不适合 Market Agent MVP：

- 需要引入外部服务栈和部署面。
- 会绕开当前 SQLite / CLI / Stage1Runtime 验收链路。
- 会把 deterministic Market Agent pipeline 过早平台化。

---

## 4. 对比矩阵

| 维度 | 当前 LangGraph + Stage1Runtime | Vercel AI SDK | OpenAI Agents SDK | Shannon |
|---|---|---|---|---|
| Provider 抽象 | 弱，当前手写 | 强 | 中 | 强 |
| Tool calling | 由 graph / provider 自己组织 | 强 | 强 | 强 |
| Structured output | 手写 schema parse + validate | 强 | 强 | 取决于平台配置 |
| Checkpoint / resume | 已实现并进入测试 | 非核心 | 有 state，但语义不同 | 强，Temporal 级别 |
| CLI 验收 | 已有 | 需要接入 | 需要接入 | 需要外部服务 |
| Multi-agent handoff | 需自建 | 有 Agent 能力 | 强 | 强 |
| Production observability | 本地审计/SQLite | telemetry 可补 | tracing 可补 | 平台内建 |
| 引入成本 | 已存在 | 中 | 中高 | 高 |
| MVP 风险 | 低 | 中 | 中高 | 高 |

---

## 5. 推荐技术路线

### 5.1 本轮不做

本轮不做以下迁移：

- 不把 `Stage1Runtime` 替换为 OpenAI Agents SDK。
- 不把 Market Agent MVP 接入 Shannon。
- 不把 `apps/trader-workflows` 迁回旧 `apps/trader-cli` 的 Vercel AI SDK 结构。
- 不让 LLM runtime 接管 **RiskGate**、**ExecutionPolicy**、**Outcome**、**Promotion**。

### 5.2 可做的后续 spike

如果要继续验证外部 SDK，建议拆成三个互不耦合的 spike。

#### Spike A: Provider Adapter 对比

目标：比较 `apps/trader-workflows/src/llm/provider.ts` 继续手写、使用 Vercel AI SDK、使用 OpenAI SDK 三种方式。

验收：

- `DecisionEnvelope` JSON 稳定。
- DeepSeek `reasoning_content` / `thinking` 能被正确处理或明确不支持。
- `npm --prefix apps/trader-workflows test` 通过。
- 不改 graph 拓扑。

#### Spike B: OpenAI Agents SDK 作为 Agent Node

目标：只把一个 LLM-heavy 节点包装成 **Agent Node**，例如 `build_evidence` draft，不接管外层 workflow。

验收：

- 外层 **Workflow Owner** 仍是 `Stage1Runtime`。
- Agent Node 输出必须落到现有 schema。
- 失败时可降级到现有 provider。
- 不新增交易动作或 `OrderIntent`。

#### Spike C: Shannon 平台化预研

目标：验证 Shannon 是否能作为未来外部 **Workflow Orchestrator**，而不是当前 MVP runtime。

验收：

- 用 Docker Compose 启动 Shannon，不嵌入主 repo runtime。
- 通过 OpenAI-compatible endpoint 或 `shannon-sdk` 跑一个 read-only research task。
- 证明 Market Agent deterministic services 可以作为 tool 暴露。
- 记录部署成本、端口、数据隔离、审计链路和失败恢复方式。

---

## 6. 决策门槛

只有满足以下条件，才考虑从 research 升级为正式任务：

1. 明确替换的是 provider、Agent Node 还是 Workflow Runtime，不能混写。
2. 能保留 `npm run workflows -- <command>` CLI 体系。
3. 能保留 **Workflow Run**、**Checkpoint**、**Audit Event** 和现有测试契约。
4. 不改变 Market Agent MVP 的 observe-only 边界。
5. 不让 LLM 写事实层、风险门禁或 Promotion 状态。
6. 新依赖有明确回滚路径。

---

## 7. Sources

- OpenAI Agents SDK: https://developers.openai.com/api/docs/guides/agents
- OpenAI Agents orchestration: https://developers.openai.com/api/docs/guides/agents/orchestration
- Vercel AI SDK Core overview: https://ai-sdk.dev/docs/ai-sdk-core/overview
- Vercel AI SDK structured data: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data
- Vercel AI SDK tool calling: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
- Shannon quickstart: https://docs.shannon.run/en/quickstart
- Shannon repository README: https://github.com/Kocoro-lab/Shannon
