# Agent Evidence Refresh Action

## 目标

在机会观察 Agent 面板中增加一个低决策成本的快捷入口，让用户能直接触发“刷新缺失证据”，而不是手动输入固定提示词。

## 背景

当前 Agent 已能输出 `evidenceNeeds`，并且本地 provider 已能把“refresh all missing evidence”类请求映射到 `yfinance_quote`、`yfinance_history`、`news_search` 等工具。但 UI 仍停留在被动展示阶段，用户需要知道内部提示词才能推进下一步。

## 交互契约

- 在问题输入区附近显示“刷新缺失证据”快捷按钮。
- 点击按钮后立即提交一次 Agent 请求，不只填充输入框。
- 快捷请求使用当前回答中的第一个非 `GENERAL` 证据标的；如果还没有回答，则使用上下文预检中的第一个管理员标的预览。
- 请求文案必须保持工具规划可识别，例如 `refresh all missing evidence for LITE before comparing the opportunity`。
- 请求提交后仍写入对话上下文和本地 evidence log，不能绕过现有 `/api/agent/chat`、tool policy、run history 机制。

## 边界

- 不新增外部数据源。
- 不改变 provider 的工具规划策略。
- 不把快捷按钮做成交易建议按钮；它只负责补齐证据。
- 不启动 subagent；本模块由主 agent 本地实现和审计。

## 测试计划

- 静态测试确认 AgentPanel 暴露“刷新缺失证据”按钮。
- 静态测试确认按钮为 `type="button"`，避免误触普通 form submit。
- 静态测试确认快捷按钮调用独立执行函数并生成 `refresh all missing evidence for ...` 请求。
- 静态测试确认主提交按钮和快捷按钮样式分离，避免快捷入口被误呈现为主命令。
- 运行 `npm run console:lint`、`npm run test:summary`、`npm run console:build`、`npm run pages:build`。

## Verification

- RED: `node --test --test-name-pattern "one-click evidence refresh action" test\daily-summary-assets.test.mjs` failed before implementation because `AgentPanel.tsx` did not contain `runEvidenceRefresh`.
- GREEN: the same focused command passed after adding the quick action.
- `npm run console:lint` passed.
- `npm run test:summary` passed with 87 Node tests and 37 Python tests.
- `npm run console:build` passed.
- `npm run pages:build` passed.
