# 04 Agent Chat

## 目标与非目标

目标：

实现 `/chat`，提供 streaming-first 的 Agent 对话界面。它必须支持 stop、retry、tool part、source/evidence card、approval request part，并能接收 dashboard、signals、rules、learning 等页面传入的上下文。

非目标：

- 不让 Agent 绕过 approval 执行高风险动作。
- 不用纯聊天替代任务、规则、审批等结构化页面。
- 不在前端生成交易判断。
- 不隐藏 tool call 或 evidence。

## 对应 PRD 范围

对应 `02-web-agent-cockpit-prd.md` section 4：Agent Chat。

关键能力：

- 用户主动问 Agent。
- Agent 解释 signal、rule、risk、market setup。
- 支持上下文：当前 signal、当前 watchlist、当前 rulepack、当前 task、当前 approval。
- 支持快捷按钮和结构化回答格式。

## 页面/组件拆分

| Component | Responsibility |
|---|---|
| `AgentChatPage` | route composition |
| `ChatThread` | message list, virtualized scroll, stream anchoring |
| `ChatComposer` | input, send, stop, retry, context chips |
| `ContextRibbon` | selected signal/task/rule/approval/watchlist context |
| `AssistantMessage` | text parts, structured summary, confidence |
| `ToolCallPart` | tool name, args summary, status, duration, result |
| `EvidenceCard` | source object, timestamp, confidence, route link |
| `ApprovalPart` | high-risk request preview and handoff |
| `QuickPromptBar` | explain signal, why invalidated, what changed, simulate rule |

## 数据输入输出

Inputs:

- `agent_messages`
- selected context ids from route query or UI store
- signal detail and evidence
- rule detail
- task detail
- approval detail
- playbook references

Outputs:

- user chat message
- stop stream request
- retry stream request
- create task from prompt when backend returns allowed action
- create approval request from high-risk tool suggestion
- open evidence/source route

## API、WebSocket、SSE 事件

REST:

- `GET /api/chat/sessions`
- `GET /api/chat/sessions/{session_id}/messages`
- `POST /api/chat/sessions`
- `POST /api/chat/sessions/{session_id}/stop`
- `POST /api/chat/sessions/{session_id}/retry`
- `GET /api/signals/{signal_id}`
- `GET /api/signals/{signal_id}/evidence`

SSE:

- `POST /api/chat/stream`

Required stream parts:

- `text-delta`
- `tool-call-start`
- `tool-call-delta`
- `tool-call-result`
- `source`
- `evidence`
- `approval-request`
- `warning`
- `error`
- `finish`

WebSocket:

- `/ws/events`: `agent.tool_call_started`, `agent.tool_call_finished`, `capability.blocked`
- `/ws/approvals`: `approval.created`, `approval.updated`

## TanStack Query key 与 Zustand UI state 边界

TanStack Query:

- `["cockpit", "chat-sessions"]`
- `["cockpit", "chat-session", sessionId]`
- `cockpitKeys.signal(signalId)` for context cards
- `cockpitKeys.approvals({ objectId })` for approval parts

Zustand UI state:

- active chat session id
- composer focused state
- selected context ids
- side context panel open
- message density

Streaming runtime state:

- current stream parts live in chat runtime until persisted response is acknowledged.
- completed message history is loaded from Chat API.

## 用户交互流程

1. User opens chat directly or from another page with context.
2. Context ribbon shows selected signal/task/rule/approval ids and freshness.
3. User sends prompt or clicks quick prompt.
4. Assistant starts stream immediately.
5. Tool call part appears when Agent uses a tool.
6. Evidence/source cards render as independent parts.
7. User can stop stream; stopped response remains visible with stopped status.
8. If high-risk action is proposed, `ApprovalPart` links to Approval Center instead of executing action.
9. Failed stream keeps prior parts and exposes retry.

## 权限、审批、审计要求

Required permissions:

- `view_signal` for signal context.
- `create_task` when prompt becomes task creation.
- `approve_action` only for approval decisions; chat itself should hand off to Approval Center.

Approval required:

- any trade ticket action.
- high-risk tool execution.
- rule version publish.
- capability permission upgrade.

Audit required:

- prompt that creates a task.
- prompt that triggers tool use.
- prompt that creates approval request.
- stop/retry actions with session id and trace id.

## 空态、loading、error、reconnect、dedupe 行为

| State | Behavior |
|---|---|
| Empty | show context-aware quick prompts, not generic marketing text |
| Loading history | message skeleton with composer available if allowed |
| Streaming error | preserve completed parts, show retry and trace id |
| Tool error | show failed tool part and remediation |
| Reconnect | resume session history; current stream shows interrupted state |
| Dedupe | stream part ids prevent duplicate tool/evidence cards |

## 可复用现有代码

- `AgentPanel`: reuse agent status and evidence disclosure ideas.
- `AgentEvidenceDetail`: reuse evidence card concepts.
- shadcn primitives: button, card, badge, separator, command input.

## 实现任务

1. Create chat route and chat runtime adapter compatible with AI SDK part model.
2. Build message part renderer for text, tool, source, evidence, warning, approval and error.
3. Build context ribbon and quick prompt bar.
4. Wire stop, retry and stream error recovery.
5. Add source/evidence links to cockpit routes.
6. Add approval handoff card for high-risk actions.
7. Add tests for stream part rendering and partial failure.

## 功能验收标准

- Chat streams text progressively.
- User can stop an active response.
- User can retry failed response without losing previous source cards.
- Tool calls are visible with status and result summary.
- Evidence/source cards include object id, timestamp and route link.
- High-risk action appears as approval handoff, not direct execution.

## 设计交互验收标准

- Chat reads as an operational panel, not a casual messenger.
- Tool and evidence parts are visually distinct but compact.
- Composer controls use icons with tooltips for stop, retry and attach context.
- Context ribbon makes scope obvious before user sends.
- Long answers remain scannable through structured sections and evidence cards.

## 测试场景

- Unit test stream part parser.
- Component test stop, error and retry states.
- Component test approval part does not expose direct approve button without full approval detail.
- Playwright flow: open chat with signal context, send quick prompt, receive tool part, stop stream.
