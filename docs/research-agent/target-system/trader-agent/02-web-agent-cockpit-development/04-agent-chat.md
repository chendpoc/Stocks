# 04 Agent Chat / Agent Console

## 实现状态

| Surface | Route / 组件 | Status |
|---|---|---|
| Agent Console 全页 | `/cockpit/chat` → `AgentConsoleWorkspace` | done（Phase 0D-1） |
| 浮动 Chat Dock | `AgentChatDock`（Shell 嵌入） | done（mock stream） |
| DeepSeek API route | `app/api/agent-chat/route.ts` | **pending** |
| Read-only DAG | `AgentActivityGraphPanel` | **pending**（Phase 0D-2） |

详细规格：[16-agent-console-dlite-v3.md](./16-agent-console-dlite-v3.md)

## 目标与非目标

目标：让用户围绕市场意图、signal、新闻、规则和学习结果与 Agent 对话；全页 Console 展示 workstream、活动 trace 与节点详情。

非目标：

- 不通过 chat 创建或修改 signal / PlaybookTheory。
- 不触发交易执行。
- 不实现 LangGraph/LangChain tool loop。
- Phase 0D-1 不接真实 Agent Core（mock `getAgentConsole`）。

## 页面/组件拆分（当前代码）

### `/cockpit/chat` — Agent Console

| Component | Responsibility |
|---|---|
| `AgentConsoleWorkspace` | 主布局、数据加载、选择状态 |
| `PriorityPushStrip` | 1–3 条高价值主动推送 |
| `WorkstreamRail` | workstream 切换 |
| `AgentConversationPanel` | 消息列表、composer、quick prompts |
| `ActivityTracePreview` | compact trace list（0D-2 将替换为 DAG） |
| `NodeInspectorPanel` | 选中节点详情 / 无选中时 workstream 摘要 |
| `ContextUsedPanel` | 只读 context 摘要 |

### 全局 — Floating Dock

| Component | Responsibility |
|---|---|
| `AgentChatDock` | expand/minimize、contextual quick prompts、`streamChat` mock |

Legacy（仍存在，chat 全页已不直接使用）：

- `AgentChatShell.tsx`
- `AgentChatDock.tsx`

## 数据输入输出

Adapter：

- `getAgentConsole({ workstreamId? })` → `AgentConsoleViewModel`
- `streamChat(input)` → `AsyncIterable<ChatStreamPart>`（Dock 使用）

Zustand（`use-cockpit-ui-store`）：

- `selectedAgentWorkstreamId`
- `selectedActivityNodeId`
- `selectedAgentMessageId`
- `chatDockMode`

## API 与模型边界

Frontend route（**pending**）：

- `POST /api/agent-chat`

当前 chat stream 由 `mock-adapter.ts` 模拟 part 序列（text / tool / source / evidence / warning / error / done）。

The route may（Phase 1）：

- fetch read-only context from Agent Core;
- call DeepSeek direct;
- return stream parts;

The route must not mutate Agent Core objects.

## Phase 0D-2 下一步

只读 `@xyflow/react` DAG — 见 [plans/01-agent-activity-graph-readonly.md](./plans/01-agent-activity-graph-readonly.md)。

## 验收标准

0D-1（**已完成**）：

- [x] Agent Console 六区域布局
- [x] push → node inspector 联动
- [x] adapter + fixtures + i18n
- [x] 无 React Flow

0D-2（pending）：

- [ ] `AgentActivityGraphPanel` 只读 DAG
- [ ] 节点点击更新 Inspector

## 开发流程

见 [00-development-workflow.md](./00-development-workflow.md)。
