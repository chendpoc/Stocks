# 05 Agent Workflow Orchestration Roadmap

## 1. 目标

定义 Agent workflow 和 agent task orchestration 的后续开发边界。

这个文档不启动当前版本开发。它用于说明：当前 `/cockpit/chat` 的 DAG 只是只读活动链展示，真正的 workflow 编排必须等 Agent Core、Shared Platform 和 Cockpit 三层契约成熟后再做。

## 2. 第一性原理

Workflow 编排不是一个前端图组件问题。

它的本质是：把 Agent 的任务拆成可追踪、可恢复、可审计、可限制能力边界的运行图。前端 DAG 只能展示这个运行图，不能替代后端 runtime、队列、工具权限、审计和失败恢复。

因此当前阶段必须拆成两条线：

| Track | Meaning | Current status |
|---|---|---|
| AgentActivityGraph | 只读展示 Agent 一次分析或一次对话背后的活动节点 | 可作为 Phase 0D-2 开发 |
| AgentWorkflowOrchestrator | 真正调度、运行、恢复和审计 Agent 工作流 | 后续 Agent Core / Shared Platform 能力 |
| WorkflowBuilder | 人工或 Agent 生成 workflow draft 后，由用户确认、编辑、启用 | 后续 Cockpit 能力 |

## 3. 非目标

当前 Cockpit 第一版不做以下能力：

- 不做 workflow builder。
- 不做可编辑 DAG。
- 不做任务下发控制台。
- 不做自动激活 Agent 生成的 workflow。
- 不做工具权限管理。
- 不做调度器、队列、重试、取消、恢复。
- 不做交易、订单、账户或执行能力。

## 4. 三层职责

| Layer | Responsibility |
|---|---|
| `01 Agent Core` | workflow schema、node 执行、run 状态、tool call 计划、risk/rule 约束、run result、agent event 写入 |
| `03 Shared Platform` | 存储、事件流、调度队列、tool gateway、capability gate、audit persistence、配置与密钥边界 |
| `02 Web Cockpit` | 只读 run viewer、node inspector、workflow draft review、后续 workflow builder UI |

关键原则：Cockpit 只能消费和展示 runtime 事实。没有 canonical runtime schema 前，不允许让前端先定义真实 workflow 执行语义。

## 5. 演进路线

| Stage | Name | Deliverable | Gate |
|---:|---|---|---|
| A | Read-only Activity Graph | `/cockpit/chat` 内展示单次 Agent 分析链路 | mock graph 可解释，不能编辑 |
| B | Real Run Trace Viewer | 从 Agent Core 读取 `agent_runs` / `agent_events` | run/node/edge schema 稳定 |
| C | Run Monitor | 展示进行中 run、历史 run、失败节点和证据 | backend 支持 run status 和 event stream |
| D | Workflow Draft Review | Agent 可提出 workflow candidate，用户只读审查 | candidate 与 active workflow 分离 |
| E | Workflow Builder | 用户手动编辑 workflow draft | capability、audit、versioning 完整 |
| F | Agent-generated Workflow Candidate | Agent 基于学习结果生成 workflow proposal | 必须人工确认后才能激活 |

## 6. Future Core Types

这些类型是未来契约方向，不是当前 Cockpit 0D 的实现要求。

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

## 7. Cockpit Route Boundary

当前版本：

| Route | Allowed |
|---|---|
| `/cockpit/chat` | 展示当前 conversation / workstream 的只读 activity graph |
| `/cockpit/learning` | 管理 market learning 和 candidate review |
| `/cockpit/settings/memory` | 后续管理通用 memory candidate |

后续版本：

| Route | Condition |
|---|---|
| `/cockpit/workflows` | 只有在 Agent Core 和 Shared Platform 提供 workflow runtime contract 后新增 |
| `/cockpit/workflows/:id/runs/:runId` | 只有在 run history 和 audit event contract 稳定后新增 |

不要在 Phase 0D 里新增 `/cockpit/workflows`。当前 `/cockpit/chat` 只展示与对话上下文相关的 activity graph。

## 8. Safety Boundary

所有 workflow 能力必须遵守：

- Agent 不能静默激活 workflow。
- Agent 只能生成 workflow candidate 或 draft。
- Active workflow 必须由用户显式确认。
- Tool call 必须经过 capability policy。
- Workflow 不能绕过 Rule Engine、Risk Engine 或只读边界。
- 当前系统不接真实交易执行。
- 任何产生 signal 或 learning 的节点都必须写入审计事件。

## 9. Future Document Split

当进入 workflow 编排阶段时，再新增以下文档：

| Document | Owner | Purpose |
|---|---|---|
| `01-agent-core-development/21-agent-workflow-orchestrator.md` | Agent Core | runtime、node execution、run lifecycle |
| `03-shared-platform-workflow-runtime-prd.md` | Shared Platform | storage、event stream、queue、capability gate、audit |
| `02-web-agent-cockpit-development/18-workflow-run-monitor.md` | Web Cockpit | readonly run monitor |
| `02-web-agent-cockpit-development/19-workflow-builder.md` | Web Cockpit | human-controlled workflow draft editor |

## 10. Entry Criteria

从只读 DAG 进入 workflow orchestration 前，必须满足：

- 有 canonical workflow definition schema。
- 有 canonical workflow run schema。
- 有 node run 状态模型。
- 有 persisted run history。
- 有 agent event audit。
- 有 tool capability allowlist。
- 有失败、取消、重试、恢复语义。
- Cockpit 能只读展示 run，而不需要定义执行逻辑。
- 所有 mutating action 都需要用户显式确认。

## 11. Development Rule

后续任何 worker 如果要开发 DAG、workflow 或 agent task orchestration，必须先判断自己属于哪一层：

| Request | Correct doc |
|---|---|
| 只读 activity graph in chat | `02-web-agent-cockpit-development/16-agent-console-dlite-v3.md` |
| 真实 run trace viewer | 本文档 Stage B/C，再补具体实现文档 |
| workflow runtime | Agent Core future document |
| event stream / queue / capability | Shared Platform future document |
| workflow builder | 本文档 Stage E，再补 `19-workflow-builder.md` |

如果需求同时跨越 runtime、platform 和 cockpit，必须先拆文档，再拆 worker，不允许在一个前端任务里一次性实现。
