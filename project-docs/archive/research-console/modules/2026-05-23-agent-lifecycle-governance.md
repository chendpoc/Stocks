# Agent Lifecycle Governance

## 目标

建立本项目使用 subagent 的生命周期规则，避免为了并行而并行，减少长期悬挂 agent、重复探索和上下文噪音。

## 背景

当前协作模式已经确定：

- 低决策度任务可以下发 agent。
- 主 agent 负责 review、审计、集成和最终验证。
- 每个模块开发前必须有模块文档。

但仅有这些原则还不够。agent 数量上升到几十个后，真正的问题不是数量本身，而是缺少生命周期管理：

- 哪些任务允许下发？
- 同时最多开几个？
- 完成后何时关闭？
- agent 结果如何被主 agent 审核？
- 何时必须停止继续下发？

## 契约

- 默认本地执行，只有明确低耦合、低决策、低冲突风险的任务才下发 agent。
- 同一阶段默认最多保留 2 个活跃 agent；超过时必须先关闭已完成或失效 agent。
- 每个 agent 必须有明确任务边界、写入范围和交付物。
- agent 完成后，主 agent 必须检查 diff、测试或文档证据，不能直接信任 agent 自述。
- 已完成、无后续依赖、被替代或方向过期的 agent 必须关闭。
- 不允许把阻塞主路径的关键决策任务下发给 agent。

## 边界

- 本模块只定义项目协作治理规则，不新增运行时代码。
- 不追溯清理历史已经关闭的 agent 记录。
- 不要求每次只有一个 agent；目标是受控并行，而不是取消并行。

## 测试计划

- RED：计划文档必须记录 active agent 上限。
- RED：计划文档必须记录完成后 close agent 的规则。
- RED：计划文档必须记录主 agent review 和验证责任。
- GREEN 后运行聚焦测试、`npm run test:summary`、`npm run pages:build`。

## 实施结果

- 总计划新增 `Agent lifecycle governance` 协作契约。
- 同一阶段默认最多保留 2 个活跃 agent。
- agent 完成后必须 `close agent`，除非下一步明确依赖同一 agent 上下文继续工作。
- 主 agent 负责 review、审计、集成和最终验证。

## 验证记录

- RED 已确认：`node --test --test-name-pattern "subagent lifecycle governance" test\daily-summary-assets.test.mjs` 初始失败，原因是总计划缺少 agent 生命周期治理规则。
- GREEN 已确认：同一聚焦测试实现后通过。
- 全量相关检查通过：
  - `npm run test:summary`
  - `npm run pages:build`
