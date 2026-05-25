# 13 Journal

## 目标与非目标

目标：

实现 `/journal`，用于记录人工复盘、signal 反馈、ticket 观察和 outcome 评价。Journal 是 human feedback 进入 learning loop 的输入层。

非目标：

- 不替代正式 audit log。
- 不作为交易执行记录系统。
- 不允许修改不可变历史结果，只能追加反馈或修正说明。

## 对应 PRD 范围

对应 `02-web-agent-cockpit-prd.md` section 13：Journal。

字段：

- date
- ticker
- signal
- setup
- action taken
- outcome
- mistake
- lesson
- linked playbook
- linked rule
- feedback

## 页面/组件拆分

| Component | Responsibility |
|---|---|
| `JournalPage` | route composition |
| `JournalEntryTable` | dense entries list |
| `JournalEntryDrawer` | read and edit feedback |
| `JournalEntryForm` | append feedback, lesson, mistake |
| `OutcomeSummaryCards` | recent outcome metrics |
| `LinkedSignalPanel` | signal and ticket context |
| `LearningImpactPanel` | how feedback affects learning |

## 数据输入输出

Inputs:

- `human_feedback`
- `signals`
- `trade_tickets`
- `event_outcomes`
- `playbooks`
- `agent_rules`
- `learning_summaries`

Outputs:

- create journal entry
- append feedback to signal
- classify outcome
- link playbook/rule
- open signal/playbook/rule

## API、WebSocket、SSE 事件

REST:

- `GET /api/journal`
- `GET /api/journal/{entry_id}`
- `POST /api/journal`
- `POST /api/journal/{entry_id}/feedback`
- `POST /api/signals/{signal_id}/feedback`
- `GET /api/learning?source=journal`

Realtime:

- `/ws/signals`: `signal.updated`, `signal.invalidated`
- `/ws/events`: `learning.summary_created`

SSE:

- Not required.

## TanStack Query key 与 Zustand UI state 边界

TanStack Query:

- `["cockpit", "journal", filters]`
- `["cockpit", "journal-entry", entryId]`
- linked signal/playbook/rule query keys

Zustand UI state:

- selected entry id
- entry drawer open
- create form open
- local filter draft

Form state:

- journal entry and feedback forms use React Hook Form + Zod.

## 用户交互流程

1. User opens `/journal`.
2. User filters by date, ticker, setup, outcome or linked signal.
3. User opens entry or creates new entry from a signal.
4. Form captures action taken, outcome, mistake, lesson and feedback.
5. Submission writes `human_feedback`.
6. Learning Center later references journal feedback in summaries or proposals.

## 权限、审批、审计要求

Required permissions:

- view linked signal.
- create feedback.
- edit own feedback if policy allows.

Approval required:

- Journal feedback does not directly change rules.
- Applying feedback into rule proposal requires Learning Center or Rule Studio approval path.

Audit required:

- create entry.
- edit or append feedback.
- link/unlink playbook or rule.

## 空态、loading、error、reconnect、dedupe 行为

| State | Behavior |
|---|---|
| Empty | show create entry and link from Signals path |
| Loading | table skeleton |
| Error | retry and preserve draft |
| Reconnect | keep form drafts, show stale linked data |
| Dedupe | feedback event upserts by entry id and version |

## 可复用现有代码

- Signal feedback form from Signals page.
- Shared table, form, drawer primitives.
- `ScoreRows` for outcome summary cards.

## 实现任务

1. Create `/journal` route.
2. Build journal table and filters.
3. Build entry drawer and form.
4. Wire signal feedback mutation.
5. Link entries to signal, playbook, rule and learning summaries.
6. Add audit metadata for feedback edits.

## 功能验收标准

- User can create and inspect journal entries.
- User can attach feedback to a signal.
- Entries show linked signal, playbook and rule when available.
- Feedback is available to Learning Center through API.
- Edits or appended feedback are audited.

## 设计交互验收标准

- Journal is compact and table-first.
- Writing form is focused and not decorative.
- Outcome and mistake fields are structured enough for later learning.
- Linked context is visible without leaving the entry drawer.

## 测试场景

- Unit test journal form schema.
- Component test draft preservation on API error.
- Component test linked signal panel.
- Playwright flow: create entry from signal context, submit feedback, see entry in table.
