# 08 Rule Studio

## 目标与非目标

目标：

实现 `/rules`，用于查看、编辑、模拟、版本化和提交 Agent 规则。Rule Studio 让用户控制规则系统，但不能让前端承担策略判断。

非目标：

- 不在浏览器中执行最终策略判断。
- 不直接发布规则到生产，无 approval 和 audit 不可生效。
- 不把自然语言规则直接当作可执行规则。
- 不绕过 RulePack schema 校验。

## 对应 PRD 范围

对应 `02-web-agent-cockpit-prd.md` section 8：Rule Studio。

规则类型：

- signal trigger rule
- invalidation rule
- risk rule
- scoring rule
- tool permission rule
- learning proposal rule

编辑模式：

- visual builder
- JSON/YAML editor
- natural language draft

## 页面/组件拆分

| Component | Responsibility |
|---|---|
| `RuleStudioPage` | route composition |
| `RuleListPanel` | rule list, version, status, type |
| `RuleEditorTabs` | visual, YAML/JSON, natural language draft |
| `RuleVisualBuilder` | structured fields for conditions and actions |
| `RuleCodeEditor` | schema-aware YAML/JSON editor |
| `RuleDraftAssistant` | natural language to draft, clearly labeled generated |
| `RuleSimulationPanel` | run against sample signals/events |
| `RuleVersionHistory` | version diff and approval state |
| `RuleSubmitBar` | validate, simulate, submit for approval |

## 数据输入输出

Inputs:

- `agent_rules`
- `rule_versions`
- `rule_proposals`
- `playbooks`
- sample `signals`
- `event_outcomes`
- `agent_events`

Outputs:

- save draft
- validate rule
- simulate/backtest rule
- submit version for approval
- request changes on proposal
- link accepted learning proposal to rule draft

## API、WebSocket、SSE 事件

REST:

- `GET /api/rules`
- `GET /api/rules/{rule_id}`
- `POST /api/rules/{rule_id}/draft`
- `POST /api/rules/validate`
- `POST /api/rules/simulate`
- `POST /api/rules/{rule_id}/submit-version`
- `GET /api/rules/{rule_id}/versions`
- `GET /api/rule-proposals`

Realtime:

- `/ws/events`: `rule.hit`, `rule.proposal_created`
- `/ws/approvals`: `approval.created`, `approval.updated`, `approval.decided`

SSE:

- Natural language draft can use chat streaming pattern but must persist only as draft after user confirmation.

## TanStack Query key 与 Zustand UI state 边界

TanStack Query:

- `cockpitKeys.rules(filters)`
- `["cockpit", "rule", ruleId]`
- `["cockpit", "rule-versions", ruleId]`
- `["cockpit", "rule-simulation", ruleId, simulationInputHash]`

Zustand UI state:

- selected rule id
- editor tab
- diff view open
- simulation panel open
- local unsaved marker

Form/editor state:

- React Hook Form for visual builder.
- Code editor local state until save draft mutation.

## 用户交互流程

1. User opens `/rules`.
2. User selects a rule or learning proposal.
3. User edits in visual builder or code editor.
4. Client validates shape with Zod; server validates RulePack semantics.
5. User runs simulation against selected historical events/signals.
6. Simulation panel shows pass/fail, false positives, linked examples and risk impact.
7. User submits version for approval.
8. Approval Center handles publish decision.

## 权限、审批、审计要求

Required permissions:

- `modify_rule`
- `view_signal` for simulation examples.
- `approve_action` in Approval Center only.

Approval required:

- publishing new rule version.
- enabling rule with high-risk effect.
- changing risk veto or tool permission rule.

Audit required:

- draft save.
- validation and simulation run.
- version submit.
- approval decision.
- rollback or disable action.

## 空态、loading、error、reconnect、dedupe 行为

| State | Behavior |
|---|---|
| Empty rules | show RulePack load state and import/admin path |
| Empty simulation | show required inputs and sample selector |
| Loading | split layout skeleton |
| Error | preserve local editor draft, show server validation errors inline |
| Reconnect | disable submit for approval until rule version refreshes |
| Dedupe | approval/rule events apply by version number |

## 可复用现有代码

- `AgentToolPolicy`: policy display ideas for permission rules.
- `ScoreRows`: display scoring impact.
- shadcn tabs, dialog, form, input and badge primitives.

## 实现任务

1. Create `/rules` route and split editor layout.
2. Define rule schemas and form mappings.
3. Build rule list and version history.
4. Build visual builder for MVP rule fields.
5. Add YAML/JSON editor with schema validation.
6. Implement simulation panel and result rendering.
7. Implement submit-for-approval flow.
8. Wire learning proposal handoff into draft creation.

## 功能验收标准

- User can view rules by type, status and version.
- User can edit draft and receive schema validation errors.
- User can simulate rule before submit.
- User cannot publish rule without approval.
- Rule version history and audit link are visible.

## 设计交互验收标准

- Editor layout supports dense rule list plus focused editor.
- Generated natural language draft is clearly labeled as draft.
- Simulation result highlights risk and false-positive impact.
- Submit bar makes unsaved, invalid, simulated and approval states explicit.

## 测试场景

- Unit test rule schema validation.
- Component test server validation error display.
- Component test submit disabled before valid simulation when rule type requires it.
- Playwright flow: edit rule draft, validate, simulate, submit for approval.
