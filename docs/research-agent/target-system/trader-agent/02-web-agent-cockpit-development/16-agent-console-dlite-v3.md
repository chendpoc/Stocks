# 16 Agent Console D-lite v3

## Implementation Status (2026-05-27)

| Phase | Status | Notes |
|---|---|---|
| 0D-1 Agent Console breadth skeleton | **done** | `AgentConsoleWorkspace` + 6 子组件 + `getAgentConsole` |
| 0D-2 Read-only AgentActivityGraph | **pending** | plan: [plans/01-agent-activity-graph-readonly.md](./plans/01-agent-activity-graph-readonly.md) |

代码：`apps/trader-cockpit/app/cockpit/chat/page.tsx` → `AgentConsoleWorkspace`。

## 1. 目标

把 `/cockpit/chat` 从普通聊天页升级为 Agent Console：用户可以和 Agent 对话，也能看到 Agent 主动推送、当前 workstream、只读上下文、活动节点和节点详情。

开发必须分成两个阶段推进：

| Phase | Scope | Principle |
|---|---|---|
| 0D-1 | Agent Console breadth skeleton | 先实现业务页面、mock 数据契约、对话体验、主动推送、节点详情 |
| 0D-2 | Read-only AgentActivityGraph module | 再引入图组件库，深度开发只读 DAG 模块 |

第一版的核心目标不是做 workflow builder，而是让用户理解 Agent 为什么推送某个市场判断，并能围绕节点继续追问。

## 2. 非目标

- 不做真实模型调用。
- 不接真实 Agent Core backend。
- 不做 workflow builder。
- 不允许新增、删除、拖拽、连线、重跑 DAG 节点。
- 不做任务下发、调度、权限、审批。
- 不做交易、订单、账户或执行能力。
- 不在 `/cockpit/chat` 管理 memory 或 learning candidate。
- 不把完整 push feed、已读、归档、过滤做进 chat 页。

## 3. Phase 0D-1：Agent Console Breadth Skeleton

### 3.1 目标

先完成 Agent Console 的普通功能骨架，验证页面职责和业务信息层级。

### 3.2 页面结构

Route：`/cockpit/chat`

```text
/cockpit/chat
  Header context from CockpitShell
  Priority Push strip
  Workstreams rail
  Conversation main
  Read-only Activity Preview
  Node Inspector + Context Used
```

**当前实现布局**（`AgentConsoleWorkspace.tsx`）：

```text
[ PriorityPushStrip ]
[ WorkstreamRail ]
[ Conversation | ActivityTracePreview | NodeInspector + ContextUsed ]
  xl+: 三列 grid；Inspector 与 Context 为右侧上下分栏
```

### 3.3 组件建议

| Component | Responsibility |
|---|---|
| `AgentConsoleWorkspace` | `/cockpit/chat` 页面主布局 |
| `PriorityPushStrip` | 高价值主动推送摘要 |
| `WorkstreamRail` | workstream 列表和当前选择 |
| `ContextUsedPanel` | 当前只读上下文摘要 |
| `AgentConversationPanel` | message list、quick prompts、composer |
| `AgentPushMessage` | Agent 主动推送 message |
| `ActivityTracePreview` | 0D-1 的轻量 trace chips / list |
| `NodeInspectorPanel` | 选中节点详情 |

### 3.4 数据契约

0D-1 先用业务类型，不引入 React Flow 类型。

```ts
type AgentWorkstream = {
  id: string;
  title: string;
  symbols: string[];
  status: "active" | "updated" | "quiet";
  unreadCount: number;
  summary: string;
  updatedAt: string;
};

type AgentConsoleMessage = {
  id: string;
  workstreamId: string;
  role: "user" | "agent" | "agent_push";
  createdAt: string;
  text: string;
  tags: CockpitTag[];
  relatedNodeIds: string[];
};

type AgentActivityNode = {
  id: string;
  workstreamId: string;
  kind:
    | "user_question"
    | "market_snapshot"
    | "news_scan"
    | "rule_match"
    | "risk_check"
    | "learning_candidate";
  status: "pending" | "running" | "completed" | "warning" | "failed";
  title: string;
  summary: string;
  evidenceBullets: string[];
  relatedLearningRefs: {
    id: string;
    title: string;
    href: string;
  }[];
  askPrompts: string[];
  createdAt: string;
};

type AgentActivityEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

type AgentActivityTrace = {
  workstreamId: string;
  nodes: AgentActivityNode[];
  edges: AgentActivityEdge[];
  selectedNodeId?: string;
};

type ContextUsedSummary = {
  workstreamId: string;
  marketFacts: string[];
  activeLearnings: string[];
  preferences: string[];
};
```

### 3.5 Adapter 方法

```ts
type AgentConsoleViewModel = {
  workstreams: AgentWorkstream[];
  selectedWorkstreamId: string;
  priorityPushes: AgentConsoleMessage[];
  messages: AgentConsoleMessage[];
  trace: AgentActivityTrace;
  contextUsed: ContextUsedSummary;
};

interface CockpitDataAdapter {
  getAgentConsole(input?: { workstreamId?: string }): Promise<AgentConsoleViewModel>;
}
```

0D-1 只在 mock adapter 中实现。

### 3.6 状态边界

允许 Zustand 保存：

- selected workstream id
- selected activity node id
- selected message id

禁止 Zustand 保存：

- canonical chat history
- canonical graph
- tool secrets
- model API key
- learning candidate review state

### 3.7 0D-1 验收标准

- [x] `/cockpit/chat` 显示 Agent Console，而不是旧单一聊天页。
- [x] 页面有 Priority Push、Workstreams、Conversation、Context Used、Activity Preview、Node Inspector。
- [x] Agent push message 能绑定 activity node。
- [x] 点击 activity trace item 或 push message 可以更新 Node Inspector。
- [x] Context Used 只读展示，不提供管理入口。
- [x] 不出现 workflow builder、任务下发、节点编辑、交易、订单、审批。
- [x] 组件和页面不直接 import fixtures，必须通过 `CockpitDataAdapter`。
- [x] 新文案进入 `resources.json`，中英文完整。

### 3.8 0D-1 测试场景

- `test/trader-cockpit-phase0.test.mjs` 检查 `/cockpit/chat` 仍存在。
- 检查 `CockpitDataAdapter.getAgentConsole` 存在。
- 检查 mock fixtures 含 workstreams、messages、activity nodes、edges、context used。
- 检查 `AgentConsoleWorkspace` 不直接 import fixtures。
- 检查页面文案使用 i18n keys。
- 检查 banned language 不出现交易、订单、审批、任务下发。

## 4. Phase 0D-2：Read-only AgentActivityGraph Module

### 4.1 目标

把 0D-1 的 Activity Preview 升级为可复用的只读 DAG 组件。

### 4.2 推荐库

使用 `@xyflow/react`。

理由：

- React 原生 node-edge UI 生态成熟。
- 支持 custom node 和 custom edge。
- 可以通过组件 props 禁用拖拽、连线、重连等编辑行为。
- 后续可演进为 workflow builder，但当前只用只读子集。

不推荐第一版使用：

| Library | Reason |
|---|---|
| Excalidraw React | 更像白板编辑器，不适合结构化 Agent node 状态 |
| D3 | 太底层，会让第一版手写 layout 和 React 状态桥接 |
| Reagraph | 更偏大规模网络图，当前节点量很小 |
| react-diagrams | 可用但生态和当前 React Flow 路线不如 `@xyflow/react` 稳 |

### 4.3 组件边界

```text
components/cockpit/activity-graph/
  AgentActivityGraphPanel.tsx
  AgentActivityNodeCard.tsx
  AgentActivityGraphLegend.tsx
  activity-graph-types.ts
  activity-graph-layout.ts
```

React Flow 类型只能出现在 `components/cockpit/activity-graph/**` 内部。业务层继续使用 `AgentActivityNode` / `AgentActivityEdge`。

### 4.4 只读约束

0D-2 必须明确禁用：

- node drag
- node connect
- edge reconnect
- node delete
- edge delete
- node create
- run / retry buttons
- workflow publish

允许：

- 点击 node 选中。
- hover node 查看摘要。
- 根据 status 显示颜色。
- fit view。
- 从 selected node 同步到 Inspector。

### 4.5 0D-2 验收标准

- `@xyflow/react` 只由 activity graph module import。
- `AgentActivityGraphPanel` 接收业务 graph props，不暴露 React Flow Node 类型给 adapter。
- DAG 渲染 market snapshot 和 news scan 并行，再合流到 rule match。
- 节点点击能更新 selected node。
- 所有编辑能力被禁用。
- 没有 workflow builder 文案或按钮。

### 4.6 0D-2 测试场景

- package dependency 包含 `@xyflow/react`。
- graph module import `@xyflow/react`，其他 cockpit 模块不直接 import。
- test 检查禁用 props：`nodesDraggable={false}`、`nodesConnectable={false}`、`edgesReconnectable={false}`。
- test 检查没有 add/delete/run/retry/publish controls。
- build 和 typecheck 通过。

### 4.7 Future Workflow Boundary

Phase 0D-2 只交付只读 `AgentActivityGraph`，不交付 workflow 编排能力。

未来的 agent task orchestration、workflow runtime、run monitor 和 workflow builder 统一放到 [05-agent-workflow-orchestration-roadmap.md](../05-agent-workflow-orchestration-roadmap.md) 跟踪。不要把 workflow builder、任务调度、节点重跑、工具权限或 active workflow 管理塞进 0D-1 / 0D-2。

## 5. Worker Prompt：Phase 0D-1

```text
你是 02 Agent Market Cockpit Phase 0D-1 的开发 worker。不要提交。

Repository:
D:\workspace\01-products\stock-community-summary

目标:
完成 Agent Console Breadth Skeleton。

本轮只做 /cockpit/chat 的广度优先页面骨架、mock 数据契约、adapter 方法和测试。
不要引入 @xyflow/react。
不要实现真实 DAG 图组件。
不要接真实模型、真实后端、任务系统、workflow builder、节点编辑、交易、订单、审批、权限。

必须先阅读:
- apps/trader-cockpit/app/cockpit/chat/page.tsx
- apps/trader-cockpit/components/cockpit/chat/AgentChatShell.tsx
- apps/trader-cockpit/components/cockpit/chat/AgentChatDock.tsx
- apps/trader-cockpit/components/cockpit/shell/CockpitShell.tsx
- apps/trader-cockpit/lib/cockpit/adapter.ts
- apps/trader-cockpit/lib/cockpit/mock-adapter.ts
- apps/trader-cockpit/lib/cockpit/fixtures.json
- apps/trader-cockpit/lib/cockpit/query-keys.ts
- apps/trader-cockpit/lib/i18n/resources.json
- test/trader-cockpit-phase0.test.mjs
- docs/research-agent/target-system/trader-agent/02-web-agent-cockpit-development/16-agent-console-dlite-v3.md

允许编辑:
- apps/trader-cockpit/app/cockpit/chat/page.tsx
- apps/trader-cockpit/components/cockpit/chat/**
- apps/trader-cockpit/lib/cockpit/adapter.ts
- apps/trader-cockpit/lib/cockpit/mock-adapter.ts
- apps/trader-cockpit/lib/cockpit/fixtures.ts
- apps/trader-cockpit/lib/cockpit/fixtures.json
- apps/trader-cockpit/lib/cockpit/query-keys.ts
- apps/trader-cockpit/lib/cockpit/use-cockpit-ui-store.ts
- apps/trader-cockpit/lib/i18n/resources.json
- test/trader-cockpit-phase0.test.mjs

禁止编辑:
- apps/trader-agent/**
- apps/research-console/**
- docs/**
- package.json
- pnpm-lock.yaml
- 不要提交

硬边界:
- mock-first。
- 不新增依赖。
- 业务逻辑只用 .ts/.tsx，数据用 .json。
- test 文件允许 .mjs。
- import 使用 @/* alias。
- 页面和组件不能直接 import fixtures。
- 不出现 workflow builder、任务下发、节点编辑、交易、订单、审批。

开发要求:
1. adapter.ts 增加 Agent Console 类型:
   - AgentWorkstream
   - AgentConsoleMessage
   - AgentActivityNode
   - AgentActivityEdge
   - AgentActivityTrace
   - ContextUsedSummary
   - AgentConsoleViewModel
   - getAgentConsole(input?: { workstreamId?: string })

2. fixtures.json 增加 mockAgentConsole:
   - 至少 3 个 workstreams
   - 至少 4 条 messages，其中包含 agent_push
   - 至少 6 个 activity nodes，覆盖 user_question、market_snapshot、news_scan、rule_match、risk_check、learning_candidate
   - edges 表达 market/news 并行后合流到 rule_match
   - contextUsed 包含 marketFacts、activeLearnings、preferences

3. mock-adapter.ts 实现 getAgentConsole。

4. /cockpit/chat 改为 Agent Console:
   - PriorityPushStrip
   - WorkstreamRail
   - ContextUsedPanel
   - AgentConversationPanel
   - ActivityTracePreview
   - NodeInspectorPanel

5. ActivityTracePreview 只用普通 React/HeroUI/Tailwind 实现 compact trace/list。
   - 不使用 @xyflow/react。
   - 点击 trace item 选中 node。

6. NodeInspectorPanel:
   - 显示 selected node summary、evidence bullets、related learning refs、ask prompts。
   - 无 selected node 时显示当前 workstream summary。

7. i18n:
   - 所有新增 UI 文案进入 resources.json。
   - zh-CN 和 en-US 都补齐。

8. 测试:
   - getAgentConsole 类型和 mock 方法存在。
   - fixtures 覆盖 workstreams/messages/nodes/edges/contextUsed。
   - /cockpit/chat 使用 AgentConsoleWorkspace。
   - ActivityTracePreview 不 import @xyflow/react。
   - 组件不直接 import fixtures。
   - banned language 无交易、订单、审批、workflow builder、任务下发。

验收命令:
- pnpm --filter trader-cockpit lint
- pnpm --filter trader-cockpit build
- node --test test/trader-cockpit-phase0.test.mjs

最终回复:
- 修改文件列表
- 测试结果
- 未完成项
- 是否触碰禁止范围
```

## 6. Worker Prompt：Phase 0D-2

```text
你是 02 Agent Market Cockpit Phase 0D-2 的开发 worker。不要提交。

Repository:
D:\workspace\01-products\stock-community-summary

前置:
Phase 0D-1 已完成 Agent Console Breadth Skeleton。
如果 getAgentConsole 或 AgentActivityNode 不存在，停止并说明，不要扩大范围。

目标:
开发只读 AgentActivityGraph 模块，把 0D-1 的 ActivityTracePreview 升级为 read-only DAG。

必须先阅读:
- apps/trader-cockpit/components/cockpit/chat/**
- apps/trader-cockpit/lib/cockpit/adapter.ts
- apps/trader-cockpit/lib/cockpit/fixtures.json
- apps/trader-cockpit/package.json
- test/trader-cockpit-phase0.test.mjs
- docs/research-agent/target-system/trader-agent/02-web-agent-cockpit-development/16-agent-console-dlite-v3.md

允许编辑:
- apps/trader-cockpit/components/cockpit/activity-graph/**
- apps/trader-cockpit/components/cockpit/chat/**
- apps/trader-cockpit/package.json
- pnpm-lock.yaml
- test/trader-cockpit-phase0.test.mjs

禁止编辑:
- apps/trader-agent/**
- apps/research-console/**
- docs/**
- 不要提交

硬边界:
- 允许新增 @xyflow/react。
- 不新增其他图形库。
- graph module 只读。
- 不做 workflow builder。
- 不做节点编辑、任务下发、重跑、调度、权限、交易、订单、审批。

开发要求:
1. 安装 @xyflow/react。
2. 新建 components/cockpit/activity-graph:
   - AgentActivityGraphPanel.tsx
   - AgentActivityNodeCard.tsx
   - AgentActivityGraphLegend.tsx
   - activity-graph-types.ts
   - activity-graph-layout.ts
3. React Flow 类型只允许出现在 activity-graph 模块内部。
4. AgentActivityGraphPanel 接收:
   - nodes: AgentActivityNode[]
   - edges: AgentActivityEdge[]
   - selectedNodeId?: string
   - onSelectNode(id: string): void
5. 禁用:
   - nodesDraggable
   - nodesConnectable
   - edgesReconnectable
   - delete / create / run / retry controls
6. 在 Agent Console 中用 AgentActivityGraphPanel 替换 ActivityTracePreview。
7. 测试:
   - @xyflow/react 只在 activity-graph 模块 import。
   - read-only props 存在。
   - 没有 workflow builder、run、retry、publish、delete controls。
   - graph 点击节点能调用 onSelectNode。

验收命令:
- pnpm --filter trader-cockpit lint
- pnpm --filter trader-cockpit build
- node --test test/trader-cockpit-phase0.test.mjs

最终回复:
- 修改文件列表
- 测试结果
- 未完成项
- 是否触碰禁止范围
```
