# Agent Research Plan Status

## 目标

让 AgentPanel 中的 `researchPlan` 不只是静态研究流程，而是能根据当前回答里的工具执行结果和策略阻断结果显示阶段状态。

## 背景

当前 `researchPlan` 已经提供公开研究步骤：

- hypothesis
- evidence
- falsification
- data_plan
- synthesis

同时 Agent 回答已经包含：

- `tool_trace[]`：实际执行的工具及摘要。
- `policy_decisions[]`：允许或阻断的工具策略。

缺口是 UI 没有把两者连接起来。用户点击“刷新缺失证据”后，虽然工具结果会出现，但研究计划区仍看不出哪个阶段被推进、哪个阶段被策略挡住。

## 契约

在 AgentPanel 内部派生每个 `researchPlan` step 的状态：

- `done`：该阶段的 `toolHints` 中至少一个工具已执行。
- `blocked`：该阶段的 `toolHints` 中至少一个工具被策略阻断。
- `pending`：该阶段有 `toolHints`，但未执行也未阻断。
- `process`：该阶段没有 `toolHints`，属于方法论/归纳型步骤。

展示要求：

- 每个研究计划卡片展示状态 badge。
- 有执行或阻断工具时，显示对应工具名。
- 不暴露 raw JSONL、raw Markdown、prompt、secret 或绝对路径。
- 不改变 provider、tool policy、tool execution。

## 边界

- 只做浏览器展示层派生状态。
- 不把 `done` 当作机会成立，只表示工具阶段被推进。
- 不新增后端字段，避免和 evidence log 契约耦合。
- 不启动 subagent。

## 测试计划

- RED：AgentPanel 应包含 `researchPlanStepStatus(...)`。
- RED：AgentPanel 应从 `tool_trace` 派生 executed tools，从 `policy_decisions` 派生 blocked tools。
- RED：UI 应渲染 `agent-plan-status` 和状态 class。
- GREEN 后运行 `npm run console:lint`、`npm run test:summary`、`npm run console:build`、`npm run pages:build`。

## 实施结果

- `AgentPanel` 新增 `researchPlanStepStatus(...)`，从当前回答的 `tool_trace` 派生已执行工具，从 `policy_decisions` 派生被阻断工具。
- 研究计划卡片新增状态 badge：`done`、`blocked`、`pending`、`process`。
- 有状态相关工具时，卡片底部显示对应工具名；方法论步骤不强行展示工具。
- CSS 新增 `agent-plan-status-*` 状态样式。

## 验证记录

- RED 已确认：`node --test --test-name-pattern "research plan status" test\daily-summary-assets.test.mjs` 初始失败，原因是 `AgentPanel` 尚无状态派生函数和状态样式。
- GREEN 已确认：同一聚焦测试实现后通过。
- 全量检查通过：
  - `npm run console:lint`
  - `npm run test:summary`
  - `npm run console:build`
  - `npm run pages:build`
