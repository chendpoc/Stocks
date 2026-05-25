# 14 Learning Center

## 目标与非目标

目标：

实现 `/learning`，用于查看 daily learning summary、weekly rule proposal、低置信度事件、feedback 影响和规则改进建议。Learning Center 是 Agent 复盘和规则演进的控制面。

非目标：

- 不自动发布规则。
- 不把学习摘要当作事实来源覆盖 evidence。
- 不隐藏低置信度和样本限制。

## 对应 PRD 范围

对应 `02-web-agent-cockpit-prd.md` section 14：Learning Center。

内容：

- daily summary
- weekly rule proposal
- mistakes
- high-quality cases
- low confidence events
- suggested rule changes

## 页面/组件拆分

| Component | Responsibility |
|---|---|
| `LearningCenterPage` | route composition |
| `LearningSummaryList` | daily/weekly summaries |
| `LearningSummaryDetail` | findings, examples, confidence, links |
| `RuleProposalPanel` | proposed rule change and evidence |
| `MistakeReviewTable` | missed/false positive/invalidated cases |
| `HighQualityCaseGallery` | compact case cards with linked signals |
| `LowConfidenceEventList` | events needing human review |
| `LearningActionBar` | accept proposal draft, dismiss, open Rule Studio |

## 数据输入输出

Inputs:

- `learning_summaries`
- `rule_proposals`
- `event_outcomes`
- `signal_outcomes`
- `human_feedback`
- `signals`
- `playbooks`
- `agent_rules`

Outputs:

- mark summary reviewed
- dismiss suggestion
- create rule draft from proposal
- open Rule Studio with proposal context
- request backtest task
- provide feedback on learning quality

## API、WebSocket、SSE 事件

REST:

- `GET /api/learning/summaries`
- `GET /api/learning/summaries/{summary_id}`
- `GET /api/rule-proposals`
- `GET /api/rule-proposals/{proposal_id}`
- `POST /api/learning/summaries/{summary_id}/reviewed`
- `POST /api/rule-proposals/{proposal_id}/dismiss`
- `POST /api/rule-proposals/{proposal_id}/create-rule-draft`
- `POST /api/tasks` for backtest task

Realtime:

- `/ws/events`: `learning.summary_created`, `rule.proposal_created`, `task.completed`
- `/ws/tasks`: backtest task updates
- `/ws/approvals`: approval updates for rule publish

SSE:

- Not required for list/detail; explanation can route to chat.

## TanStack Query key 与 Zustand UI state 边界

TanStack Query:

- `cockpitKeys.learning(range)`
- `["cockpit", "learning-summary", summaryId]`
- `["cockpit", "rule-proposals", filters]`
- `["cockpit", "rule-proposal", proposalId]`

Zustand UI state:

- selected summary id
- selected proposal id
- active tab
- review drawer open
- local date range draft

## 用户交互流程

1. User opens `/learning`.
2. Page shows latest daily summary and pending rule proposals.
3. User opens summary detail.
4. Detail shows mistakes, high-quality cases, low confidence events and linked evidence.
5. User marks reviewed or provides feedback.
6. User opens proposal and creates rule draft in Rule Studio.
7. Rule publish remains gated by Rule Studio validation and Approval Center.

## 权限、审批、审计要求

Required permissions:

- read learning summaries.
- `modify_rule` for create rule draft.
- `create_task` for backtest task.

Approval required:

- applying learning proposal to active rule.
- publishing rule version.
- widening tool or risk permissions suggested by learning.

Audit required:

- summary reviewed.
- proposal dismissed.
- rule draft created.
- backtest task created.
- learning feedback submitted.

## 空态、loading、error、reconnect、dedupe 行为

| State | Behavior |
|---|---|
| Empty | show latest learning task status and manual run path if permitted |
| Loading | summary list and detail skeleton |
| Error | retry and trace id |
| Reconnect | show stale badge, disable create-draft mutation |
| Dedupe | proposal updates by id and version |

## 可复用现有代码

- `AgentRunHistory`: learning task run summaries.
- `ScoreRows`: mistake/high-quality case metrics.
- Rule Studio proposal handoff.

## 实现任务

1. Create `/learning` route.
2. Build summary list/detail split.
3. Build rule proposal panel.
4. Build mistake, high-quality and low-confidence sections.
5. Implement reviewed, dismiss, create-draft and backtest mutations.
6. Wire proposal handoff to Rule Studio.
7. Subscribe to learning, task and approval events.

## 功能验收标准

- User can see daily summaries and weekly rule proposals.
- Summary detail links to concrete signals, outcomes, feedback and playbooks.
- User can create a rule draft from proposal but cannot publish it here.
- Low confidence events are visible and reviewable.
- Learning task status is visible when summary is absent.

## 设计交互验收标准

- Learning page separates facts, suggestions and generated proposals.
- Confidence and sample-size limits are visible.
- Proposal action makes validation/backtest/approval path explicit.
- Mistake review is table-first for scan speed.

## 测试场景

- Unit test proposal action permission gating.
- Component test empty learning state with task status.
- Component test create rule draft handoff.
- Playwright flow: open summary, review low confidence event, create rule draft.
