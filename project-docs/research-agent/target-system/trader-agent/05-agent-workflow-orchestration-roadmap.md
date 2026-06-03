# 05 Agent Workflow Orchestration Roadmap

## 1. 目标

定义 Agent workflow 和 agent task orchestration 的后续开发边界。

当前实现优先级是 `apps/trader-workflows` 与 `apps/trader-cli`。已删除的
research-console / trader-cockpit 不再承载 workflow 展示或编辑职责；相关
历史文档仅保留在 `project-docs/archive/`。

## 2. 第一性原理

Workflow 编排不是一个前端图组件问题。

它的本质是：把 Agent 的任务拆成可追踪、可恢复、可审计、可限制能力边界的运行图。任何 UI 或 TUI 都只能消费 runtime 事实，不能替代后端 runtime、队列、工具权限、审计和失败恢复。

因此当前阶段拆成三条线：

| Track | Meaning | Current status |
|---|---|---|
| Workflow Runtime | 调度、运行、恢复和审计 Agent 工作流 | `apps/trader-workflows` |
| CLI / TUI Operator Interface | 查看 run、触发命令、输出 JSON / TUI 结果 | `apps/trader-cli` |
| Backend Domain Services | 提供数据、规则、记忆、工具和领域 API | `apps/trader-agent/backend` |

## 3. 非目标

当前版本不做以下能力：

- 不做 Web workflow builder。
- 不做可编辑 Web DAG。
- 不做自动激活 Agent 生成的 workflow。
- 不做交易、订单、账户或执行能力。
- 不做绕过 backend/domain API 的 workflow source import。
- 不做绕过 Rule Engine、Risk Engine 或 capability policy 的运行路径。

## 4. 职责边界

| Layer | Responsibility |
|---|---|
| `apps/trader-workflows` | workflow schema、graph execution、run 状态、checkpoint、run result、event 写入 |
| `apps/trader-cli` | thin command wrapper、TUI operator view、JSON output、manual trigger |
| `apps/trader-agent/backend` | market/intel API、rule/risk/scoring、memory/context、tool adapters、domain persistence |
| Shared Platform | durable storage、event stream、tool gateway、capability gate、audit persistence、配置与密钥边界 |

关键原则：workflow runtime 定义执行语义；CLI/TUI 只能触发、查看和解释 runtime 事实。

## 5. 演进路线

| Stage | Name | Deliverable | Gate |
|---:|---|---|---|
| A | Stage 1 Runtime | durable run + checkpoint + graph execution | workflow tests pass and backend schema/API boundary remains clean |
| B | Real Run Trace Viewer | CLI/TUI 查看 run、node、event、evidence | run/node/event schema stable |
| C | Run Monitor | 展示进行中 run、历史 run、失败节点和证据 | backend/workflow supports run status and event stream |
| D | Workflow Draft Review | Agent 可提出 workflow candidate，用户只读审查 | candidate 与 active workflow 分离 |
| E | Workflow Builder | 用户手动编辑 workflow draft | capability、audit、versioning 完整；需单独重新立项 UI/TUI |
| F | Agent-generated Workflow Candidate | Agent 基于学习结果生成 workflow proposal | 必须人工确认后才能激活 |
| G | Specialized Research/Judgment Graphs | `AlphaResearchGraph`、`MarketJudgmentGraph`、`ModelLearningGraph` 进入独立规格 | 见 [06-self-learning-market-judgment-model-roadmap.md](./06-self-learning-market-judgment-model-roadmap.md) |

## 6. Future Core Types

这些类型是未来契约方向，不是当前 UI 实现要求。

```ts
type AgentWorkflowDefinition = {
  id: string;
  version: number;
  name: string;
  description: string;
  status: "draft" | "active" | "paused" | "archived";
  trigger: AgentWorkflowTrigger;
  nodes: AgentWorkflowNode[];
  edges: AgentWorkflowEdge[];
  capabilityPolicy: AgentWorkflowCapabilityPolicy;
  createdAt: string;
  updatedAt: string;
};

type AgentWorkflowNode = {
  id: string;
  kind:
    | "market_snapshot"
    | "news_scan"
    | "knowledge_search"
    | "rule_match"
    | "risk_check"
    | "model_reasoning"
    | "signal_update"
    | "learning_candidate";
  title: string;
  inputSchemaRef: string;
  outputSchemaRef: string;
  timeoutMs: number;
  retryPolicy: {
    maxAttempts: number;
    backoffMs: number;
  };
};

type AgentWorkflowEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  condition?: string;
};

type AgentWorkflowTrigger = {
  kind: "manual" | "schedule" | "market_condition" | "news_event";
  description: string;
};

type AgentWorkflowRun = {
  id: string;
  workflowId: string;
  workflowVersion: number;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  startedAt: string;
  finishedAt?: string;
  nodeRuns: AgentWorkflowNodeRun[];
};

type AgentWorkflowNodeRun = {
  id: string;
  runId: string;
  nodeId: string;
  status: "queued" | "running" | "completed" | "failed" | "skipped";
  startedAt?: string;
  finishedAt?: string;
  inputSummary: string;
  outputSummary?: string;
  evidenceRefs: string[];
  errorMessage?: string;
};

type AgentWorkflowCapabilityPolicy = {
  allowedTools: string[];
  requiresHumanActivation: boolean;
  maxRunFrequency: "manual" | "hourly" | "daily";
};
```

## 7. Operator Boundary

当前版本：

| Surface | Allowed |
|---|---|
| CLI commands | 手动触发 workflow、查看 run、输出 JSON |
| TUI pages | 查看当前 run、信号、解释和错误状态 |
| Backend API | 提供 workflow 所需领域事实和审计写入 |

后续版本：

| Surface | Condition |
|---|---|
| Run monitor | run history 和 event stream contract 稳定后新增 |
| Workflow builder | workflow definition、versioning、capability、audit contract 稳定后重新立项 |
| Web UI | 只有在用户重新确认 Web surface 为核心需求后单独立项 |

## 8. Safety Boundary

所有 workflow 能力必须遵守：

- Agent 不能静默激活 workflow。
- Agent 只能生成 workflow candidate 或 draft。
- Active workflow 必须由用户显式确认。
- Model learning workflow 可以自动训练和评估 challenger model，但不能自动替换生产模型。
- Tool call 必须经过 capability policy。
- Workflow 不能绕过 Rule Engine、Risk Engine 或只读边界。
- 当前系统不接真实交易执行。
- 任何产生 signal 或 learning 的节点都必须写入审计事件。

## 9. Future Document Split

当进入 workflow 编排阶段时，再新增以下文档：

| Document | Owner | Purpose |
|---|---|---|
| `01-agent-core-development/21-agent-workflow-orchestrator.md` | Agent Core / workflow runtime | runtime、node execution、run lifecycle |
| `03-shared-platform-workflow-runtime-prd.md` | Shared Platform | storage、event stream、queue、capability gate、audit |
| future operator-surface doc | CLI/TUI or separately approved UI | readonly run monitor and human-controlled workflow draft editor |

## 10. Entry Criteria

从当前 Stage 1 runtime 进入更完整 workflow orchestration 前，必须满足：

- 有 canonical workflow definition schema。
- 有 canonical workflow run schema。
- 有 node run 状态模型。
- 有 persisted run history。
- 有 agent event audit。
- 有 tool capability allowlist。
- 有失败、取消、重试、恢复语义。
- CLI/TUI 能只读展示 run，而不需要定义执行逻辑。
- 所有 mutating action 都需要用户显式确认。

## 11. Development Rule

后续任何 worker 如果要开发 workflow 或 agent task orchestration，必须先判断自己属于哪一层：

| Request | Correct doc |
|---|---|
| 真实 run trace viewer | 本文档 Stage B/C，再补具体实现文档 |
| workflow runtime | Agent Core / workflow future document |
| event stream / queue / capability | Shared Platform future document |
| workflow builder | 本文档 Stage E，再单独立项 operator-surface 文档 |

如果需求同时跨越 runtime、platform 和 operator surface，必须先拆文档，再拆 worker，不允许在一个 UI/TUI 任务里一次性实现。
