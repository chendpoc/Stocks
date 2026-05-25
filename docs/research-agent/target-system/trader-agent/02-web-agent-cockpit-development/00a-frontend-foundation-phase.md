# 00a Frontend Foundation Phase

## Decision

`02-web-agent-cockpit` 可以和 `01-agent-core` 并行开发，但第一阶段只能实现不依赖 Agent Core 业务判断的前端基础层。

这不是端到端业务 MVP。它是 Web Cockpit 的 UI、路由、状态、mock runtime 和交互基础。等 `01-agent-core` 和 `03-shared-platform` 稳定输出 DTO、事件、审批和审计契约后，再进入真实业务对接。

## Why

如果 Web 端提前假设 `SignalDTO`、`TradeTicketDTO`、`ApprovalRequestDTO`、`AgentEventDTO` 的真实字段，后续和 Agent Core 集成时会发生返工。

更优路径是：

1. Web 端先做可运行、可演示、可测试的 cockpit shell。
2. 所有业务数据先走 mock fixture 和 adapter。
3. mock fixture 只表达 UI 场景，不宣称是最终后端契约。
4. 真实契约确认后替换 adapter，不重写页面结构。

## Phase 0 Scope

Phase 0 只交付可独立开发的前端基础能力。

| Area | Build now | Agent Core dependency |
|---|---|---|
| App shell | cockpit route group, left nav, top bar, workspace grid, right rail | No |
| Design system | shadcn/ui primitives, Tailwind tokens, dark cockpit theme, density rules | No |
| Layout primitives | table shell, detail drawer, split panel, status rail, command bar | No |
| State primitives | TanStack Query provider, UI-only Zustand store, query key factory shape | No |
| Status primitives | empty, loading, error, reconnect, stale, permission denied | No |
| Mock runtime | fixture loader, mock API adapter, mock realtime event pump, mock stream | No |
| Chart wrapper | TradingView Lightweight Charts wrapper with mock OHLC and markers | No |
| Chat UI shell | composer, stream parts, stop/retry controls, source/tool/evidence card layout | No |
| Timeline UI | generic event list, grouped mode, detail drawer, live follow behavior | No |
| Inbox UI | notification list, priority display, message detail, linked object placeholder | No |
| Settings basics | display density, theme mode, layout preference form | No |

## Not in Phase 0

These features wait for `01-agent-core` or `03-shared-platform` contracts:

| Area | Reason to defer |
|---|---|
| Final signal schema | Needs Agent Core `SignalDTO`, status enum, evidence model |
| Ticket generation | Needs ticket generator and approval state machine |
| Approval decision payload | Needs permission, idempotency and audit contract |
| Rule Studio real editing | Needs RulePack schema, validation, simulation and versioning API |
| Capability real enable/disable | Needs Tool Gateway permissions and rate limit model |
| Task mutations | Needs Scheduler / Worker status model |
| Learning proposal apply | Needs Reflection Engine output and rule proposal model |
| Full audit center | Needs `AuditEntryDTO`, persistence and export permission |
| Real WebSocket channels | Needs canonical event registry and producer contracts |

## Phase 0 Pages

Phase 0 can create route shells and mock-backed UI for these routes:

| Route | Phase 0 behavior |
|---|---|
| `/dashboard/live` | render shell, mock market gate, mock chart, mock signal queue, mock timeline, mock rail |
| `/chat` | render streaming chat UI with mock stream parts |
| `/inbox` | render mock event/message inbox with priority and detail states |
| `/signals` | render mock table and detail drawer using provisional fixture fields |
| `/approvals` | render mock approval detail layout with disabled real decision mutation |
| `/settings` | implement local display/layout preferences where possible |

Other routes may mount placeholders with navigation, empty state and "contract required" messaging. They should not receive full feature implementations in Phase 0.

## Adapter Boundary

Every mock-backed page must depend on an adapter interface, not fixture imports inside components.

```ts
export interface CockpitDataAdapter {
  listSignals(input: SignalListInput): Promise<SignalListViewModel>;
  getSignal(input: SignalDetailInput): Promise<SignalDetailViewModel>;
  listInboxMessages(input: InboxInput): Promise<InboxMessageListViewModel>;
  listAgentEvents(input: AgentEventInput): Promise<AgentEventListViewModel>;
  streamChat(input: ChatStreamInput): AsyncIterable<ChatStreamPartViewModel>;
}
```

Rules:

- Components consume view models, not raw backend DTOs.
- Mock adapter lives beside fixture data.
- Real adapter can later map Layer 3 DTOs into the same view models.
- View models are allowed to be UI-shaped; DTOs are not.
- Any field marked as provisional must stay inside adapter or fixture files, not spread through route components.

## Mock Fixture Rules

Mock data exists to exercise UI states, not to define final business truth.

Required fixture scenarios:

- no signals
- active signal
- invalidated signal
- pending approval
- expired approval
- tool call running
- tool call failed
- chat stream with source/evidence/tool parts
- realtime reconnect
- stale object version
- permission denied
- empty inbox

Fixture naming:

- `mock-signal-active`
- `mock-signal-invalidated`
- `mock-approval-pending`
- `mock-approval-expired`
- `mock-event-tool-running`
- `mock-event-tool-failed`

## Phase 0 Implementation Order

1. Add cockpit route group and shell.
2. Add shadcn/ui primitives needed by cockpit: table, tabs, sheet, dialog, popover, dropdown-menu, toast/sonner, skeleton, tooltip, scroll-area.
3. Add cockpit design tokens and density utilities.
4. Add `CockpitDataAdapter` and mock adapter.
5. Add shared empty/loading/error/reconnect/stale components.
6. Add chart wrapper with mock data.
7. Add timeline and inbox primitives.
8. Add chat UI shell with mock streaming.
9. Add dashboard, signals and approvals route shells.
10. Add visual and component tests for all common states.

## Acceptance Criteria

- All Phase 0 routes mount without a real Agent Core backend.
- No component imports mock fixture data directly.
- Mock data can be swapped by replacing adapter implementation.
- UI states cover empty, loading, error, reconnect, stale and permission-denied behavior.
- Chat UI supports streaming layout, stop, retry, tool part, source card and evidence card with mock stream.
- Dashboard can show mock chart, signal list, timeline and right rail in one viewport.
- Approval UI can show reason, scope, risk, evidence, expiry and audit placeholder, but real decision mutation is disabled.
- No Phase 0 code claims final DTO, event or approval schema ownership.

## Design Acceptance Criteria

- First viewport looks like a financial cockpit, not a blank scaffold.
- Dense tables and side panels are readable at desktop size.
- Real-time and stale states are visible without blocking the page.
- Mock content is realistic enough to validate layout density and interaction cost.
- Controls that depend on real backend contracts are visibly disabled or marked as contract-gated.

## Test Plan

- Component tests for shared state primitives.
- Component tests for table, drawer, timeline, inbox and chat part rendering.
- Playwright smoke test for route navigation and cockpit shell.
- Visual screenshot review for dashboard, chat, signals and approval mock states.
- Static check that production route components do not import fixture files directly.

## Exit Criteria

Phase 0 ends when the cockpit frontend can run against mock adapter and demonstrate the primary interaction surfaces without relying on Agent Core.

Phase 1 starts only after these contracts are available:

- `SignalDTO`
- `TradeTicketDTO`
- `ApprovalRequestDTO`
- `AgentEventDTO`
- `AuditEntryDTO`
- `ChatStreamPart`
- canonical event registry
- permission, approval and audit enums
- ticket to approval state machine
