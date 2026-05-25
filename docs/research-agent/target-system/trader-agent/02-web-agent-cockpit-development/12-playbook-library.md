# 12 Playbook Library

## 目标与非目标

目标：

实现 `/playbooks`，用于查看交易员历史 playbook、关联案例、命中规则和 signal 表现。Playbook Library 是解释和学习的知识资产页。

非目标：

- 不让用户在此页直接发布规则。
- 不把 playbook 当作当前 signal 的唯一决策依据。
- 不隐藏历史样本数量、置信度和失效条件。

## 对应 PRD 范围

对应 `02-web-agent-cockpit-prd.md` section 12：Playbook Library。

字段：

- playbook name
- setup type
- market regime
- evidence pattern
- outcome stats
- linked rules
- linked signals
- examples

功能：

- browse playbook
- open historical examples
- compare with current signal
- ask Agent to explain

## 页面/组件拆分

| Component | Responsibility |
|---|---|
| `PlaybookLibraryPage` | route composition |
| `PlaybookList` | searchable list by setup/regime |
| `PlaybookDetailPanel` | thesis, pattern, stats, examples |
| `PlaybookStatsCards` | win/loss, sample count, confidence |
| `PlaybookExampleTable` | historical cases and outcomes |
| `LinkedRulesPanel` | rules derived from playbook |
| `CompareSignalDrawer` | current signal vs playbook |

## 数据输入输出

Inputs:

- `playbooks`
- `event_outcomes`
- `signals`
- `agent_rules`
- `trader_semantic_events`
- `human_feedback`

Outputs:

- select playbook
- filter examples
- open linked signal/rule/event
- compare current signal
- ask Agent with playbook context

## API、WebSocket、SSE 事件

REST:

- `GET /api/playbooks`
- `GET /api/playbooks/{playbook_id}`
- `GET /api/playbooks/{playbook_id}/examples`
- `GET /api/playbooks/{playbook_id}/linked-rules`
- `GET /api/playbooks/{playbook_id}/linked-signals`

Realtime:

- `/ws/events`: `learning.summary_created`, `rule.proposal_created`
- `/ws/signals`: `signal.created`, `signal.updated`

SSE:

- Ask Agent handoff uses chat stream contract.

## TanStack Query key 与 Zustand UI state 边界

TanStack Query:

- `["cockpit", "playbooks", filters]`
- `["cockpit", "playbook", playbookId]`
- `["cockpit", "playbook-examples", playbookId, filters]`
- `["cockpit", "playbook-linked-rules", playbookId]`

Zustand UI state:

- selected playbook id
- compare drawer open
- selected example id
- filter draft

## 用户交互流程

1. User opens `/playbooks`.
2. User searches by setup, regime or ticker pattern.
3. User selects playbook.
4. Detail shows pattern, evidence, stats, examples and linked rules.
5. User opens historical example or linked signal.
6. User compares selected playbook with current signal when context exists.
7. User asks Agent to explain mismatch or similarity.

## 权限、审批、审计要求

Required permissions:

- read access to playbooks and linked signals.
- `view_audit` only for linked audit expansion.

Approval required:

- No direct approval action in this page.
- Rule changes from playbook insight route to Rule Studio and Approval Center.

Audit required:

- feedback or annotation edits.
- export of examples.
- creating rule proposal from playbook insight.

## 空态、loading、error、reconnect、dedupe 行为

| State | Behavior |
|---|---|
| Empty | show corpus ingestion / learning prerequisite |
| Loading | list and detail skeleton |
| Error | retry and trace id |
| Reconnect | show stale stats badge |
| Dedupe | new linked signal updates only matching playbook ids |

## 可复用现有代码

- `ScoreRows`: stats display pattern.
- `AgentEvidenceDetail`: source evidence cards.
- Table and tabs primitives.

## 实现任务

1. Create `/playbooks` route.
2. Build playbook list and detail panel.
3. Build examples table and linked rules panel.
4. Build compare signal drawer.
5. Add chat handoff with playbook context.
6. Subscribe to learning and signal events for freshness.

## 功能验收标准

- User can browse playbooks and inspect linked examples.
- Detail shows sample count and outcome stats.
- User can open linked rules and signals.
- Compare drawer can show current signal against playbook when context exists.
- No direct rule publishing exists on this page.

## 设计交互验收标准

- Playbook page feels like a research library inside a trading terminal.
- Stats do not overstate confidence when sample count is small.
- Historical cases are table-first, with detail drawer for evidence.

## 测试场景

- Unit test playbook stat formatting.
- Component test empty corpus state.
- Component test compare drawer with and without signal context.
- Playwright flow: search playbook, open example, ask Agent.
