# Agent Public Research Plan

## 目标

给机会观察 Agent 增加一个公开、结构化、可展示的 `researchPlan`，让机会推演不只是“给结论”，而是明确展示研究路径：如何把管理员理论转成假设、如何找证据、如何优先反证、如何规划数据工具、如何保持研究边界。

## 背景

当前 `opportunity_reasoning` 已包含：

- `adminTheory`
- `marketIntelNeeds`
- `evidenceNeeds`
- `candidateOpportunities`
- `invalidationPlan`
- `nextChecks`
- `reasoningSummary`

这些字段能表达“需要什么证据”和“下一步做什么”，但缺少一层稳定的方法论结构。用户明确希望机会观察模式有 thinking / CoT / plan 这类系统化思考能力。实现上必须避免输出私密 chain-of-thought；我们只展示公开的推理摘要和可执行研究计划。

## 契约

新增 `researchPlan` 到 `OpportunityReasoningResult`：

- `stage`：固定阶段标识。
- `title`：短标题，用于 UI。
- `question`：这一阶段要回答的问题。
- `method`：公开方法摘要，不包含私密 CoT。
- `expectedOutput`：该阶段应产出的判断材料。
- `toolHints`：可选工具名称，例如 `yfinance_quote`、`yfinance_history`、`news_search`。

默认阶段：

1. `hypothesis`：把管理员理论转为可证伪假设。
2. `evidence`：识别缺失证据和已有证据。
3. `falsification`：优先寻找反证条件。
4. `data_plan`：把证据需求映射到工具或人工检查。
5. `synthesis`：只输出研究观察、置信度约束和下一步检查，不输出买卖指令。

## 边界

- 不暴露私密 chain-of-thought。
- 不新增外部工具。
- 不改变 tool policy。
- 不把 `researchPlan` 作为证据；它只是研究流程。
- 不启动 subagent。

## 测试计划

- RED：`buildOpportunityReasoning(...)` 应返回 `researchPlan`，且包含五个固定阶段。
- RED：shared core type 应声明 `ResearchPlanStep` 与 `researchPlan: ResearchPlanStep[]`。
- RED：AgentPanel 应渲染 `researchPlan`，并使用专门样式。
- RED：OpenAI-compatible prompt 应包含 research plan 摘要，让模型也看到同一套公开研究流程。
- GREEN 后运行 `npm run console:lint`、`npm run test:summary`、`npm run console:build`、`npm run pages:build`。

## Verification

- RED: `node --test --test-name-pattern "public research plan" test\opportunity-reasoning.test.mjs` failed before implementation because `ResearchPlanStep` did not exist.
- RED: `node --test --test-name-pattern "renders staged opportunity reasoning|prompt includes structured evidence needs" test\daily-summary-assets.test.mjs` failed before implementation because the UI and prompt did not include `researchPlan`.
- GREEN: both focused commands passed after implementation.
- `npm run console:lint` passed.
- `npm run test:summary` passed with 87 Node tests and 37 Python tests.
- `npm run console:build` passed.
- `npm run pages:build` passed.
