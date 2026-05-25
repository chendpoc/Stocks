# 01 Design Style and Interaction Principles

## Goal

定义 Web Agent Cockpit 的专业设计语言。目标是让界面像金融交易工作台和 Agent 控制台，而不是普通 SaaS 管理后台或营销页。

## Design Reference

- Primary mood reference: [Fortress Dashboard](https://fortress-dashboard.pages.dev/)
- UI component foundation: shadcn/ui + Radix + Tailwind
- AI-native interaction references: [AI Elements](https://elements.ai-sdk.dev/), [assistant-ui](https://www.assistant-ui.com/docs)
- HITL references: Ant Design X and CopilotKit 只作为交互范式参考，不进入主 UI 栈。

## Product Language

| Axis | Decision |
|---|---|
| Domain | 金融交易工作台 |
| Interaction mode | Agent supervision and human-in-the-loop control |
| Density | 高密度，优先扫描和比较 |
| Tone | 冷静、专业、低装饰 |
| Color | 深色为主，使用有限语义色 |
| Motion | 只用于状态变化和实时更新，不做装饰动画 |

## Visual Principles

1. 第一屏直接进入工作台，不做 landing page。
2. 使用深色终端式背景和清晰层级，但避免单一蓝紫渐变主题。
3. 页面区域用 full-width bands 或 grid layout，不把大 section 做成浮动卡片。
4. 卡片只用于 repeated item、局部面板、modal、drawer、tool panel，圆角不超过 8px。
5. 重要数字、时间、状态、风险等级使用等宽数字和紧凑行高。
6. 金融图表必须保留足够画布，不被侧栏或解释文本挤压。
7. Agent 解释必须靠近对应 signal、tool call 或 approval，避免让用户跨页面找证据。
8. 高风险 action 不显示孤立的 Approve 按钮，按钮前必须有 reason、scope、risk、evidence、expiry、audit trail。

## Layout System

### Cockpit Shell

```text
Top command bar
  ├─ market status
  ├─ global symbol / task search
  ├─ connection state
  └─ user / permission state

Left navigation rail
  ├─ Live
  ├─ Chat
  ├─ Inbox
  ├─ Tasks
  ├─ Rules
  ├─ Capabilities
  ├─ Approvals
  ├─ Signals
  ├─ Playbooks
  ├─ Journal
  ├─ Learning
  ├─ Settings
  └─ Audit

Main workspace
  ├─ primary chart / table / editor
  └─ contextual side panel
```

### Dashboard Layout

`/dashboard/live` uses a market terminal layout:

- Top: `MarketGateBar` and session status.
- Left: watchlist, setup board, signal queue.
- Center: chart, signal context, rule/risk panels.
- Right: Agent state, chat handoff, action timeline, pending approvals.
- Bottom or drawer: ticket draft and evidence detail.

## Component Style Rules

| Component | Rule |
|---|---|
| Buttons | Use icon buttons for compact tools; text buttons only for clear commands |
| Tabs | Use for mutually exclusive views inside a page |
| Tables | Dense rows, sticky header, row status stripe, keyboard navigable selection |
| Cards | Repeated entities only; no card inside card |
| Toasts | Non-blocking status only; approval and risk cannot be hidden in toast |
| Drawers | Use for detail inspection without losing table/chart context |
| Dialogs | Use for irreversible or high-risk decisions |
| Tooltips | Required for compact icon controls |
| Charts | Keep legends and crosshair readable; never replace financial chart with decorative chart |

## Color Semantics

| Semantic | Use |
|---|---|
| Neutral | layout, table cells, inactive controls |
| Blue or cyan | information and live stream |
| Green | valid signal, completed task, favorable pass |
| Amber | watch, waiting trigger, needs attention |
| Red | risk block, invalidated, failed, destructive |
| Violet | agent reasoning or generated summary accent only |

Do not use color alone. Every status must also have text, icon, shape or table column.

## Typography and Density

- Use existing sans stack for Chinese and English UI.
- Use tabular numbers for prices, percentage, score and time.
- Avoid hero-sized text inside workbench panels.
- Tables and side panels prioritize scan speed: compact headings, aligned labels, predictable spacing.
- Line length in explanation cards should be constrained; dense does not mean unreadable.

## Interaction Principles

1. Every realtime update is inspectable. New events can highlight rows but cannot silently replace user-selected detail.
2. Every AI answer has provenance. Show source/evidence cards near the relevant paragraph or tool part.
3. Every user command has visible scope. For example, "pause task" shows which task, symbol, rulepack and current version.
4. Every risky command has a review step. Review step includes object version to avoid approving stale requests.
5. Every failure has a next action. Error states must expose retry, refresh, reconnect or contact admin path.
6. Keyboard flows matter for terminal-style work: command palette, row navigation, chat send/stop, panel focus.
7. Empty states are operational, not marketing. They explain the missing upstream object and the next valid action.

## Agent Interaction Rules

| Interaction | Required UI |
|---|---|
| Streaming answer | token stream, stop button, retry button after error |
| Tool call | pending/running/succeeded/failed part with tool name, args summary and duration |
| Evidence | source cards with object id, timestamp, confidence and link to detail |
| Suggestion | explicit generated label and reason |
| Approval prompt | reason, scope, risk, evidence, expiry, audit history, approve/reject/request changes |
| Low confidence | show confidence and ask for review instead of presenting as fact |

## Anti-patterns

- Do not build a decorative landing page before the actual cockpit.
- Do not use a generic admin dashboard palette without finance-specific density and status treatment.
- Do not hide risk or audit details behind hover-only interactions.
- Do not let chat become the only way to operate the cockpit.
- Do not put API data into UI store for convenience.
- Do not use a single "Approve" button for high-risk actions.

## Design Acceptance

- First viewport immediately communicates: market state, agent state, active signals and pending human decisions.
- A user can identify live/reconnecting/stale data state in under 3 seconds.
- A user can trace a signal from setup evidence to rule hit to risk decision to approval request.
- A user can stop, retry or inspect an Agent chat stream without leaving the page.
- Dense tables remain readable on desktop and degrade to drawer/detail flows on narrower screens.

## Tests

- Visual review at desktop `1440x900` and laptop `1280x800`.
- Responsive review for navigation collapse and detail drawer at tablet width.
- Keyboard navigation through command bar, table selection, chat send/stop and approval decision.
- Contrast checks for semantic colors against dark background.
- Screenshot review for text clipping in dense cards, badges and buttons.
