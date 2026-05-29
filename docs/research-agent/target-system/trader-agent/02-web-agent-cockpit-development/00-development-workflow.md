# 00 Development Workflow

版本：`v0.2`

适用范围：`02-web-agent-cockpit-development` 下 Cockpit 前端计划文档、worker prompt 和状态回写。

上级入口：[../00-workflow-router.md](../00-workflow-router.md)
Cockpit 局部路由：[00e-workflow-and-skill-routing.md](./00e-workflow-and-skill-routing.md)

## 1. 核心规则

非平凡 Cockpit 开发任务遵循：

```text
选择 workflow
  -> 通过 module-spec-quality-gate
  -> 写或更新 plans/*.md
  -> 实现
  -> 验证
  -> 回写 status / plan / module doc
```

不允许：

- 无 source-of-truth 审查就把 worker prompt 交给执行 agent。
- plan 与 PRD、implementation status、当前代码冲突仍强行开发。
- worker prompt 引用不存在的项目文件。
- 完成后不更新需要维护的 status、plan 或模块文档。

## 2. 何时需要 Plan

| 场景 | 需要 Plan | 额外门禁 |
|---|---|---|
| 新 route / 新 workspace | yes | design gate + spec gate |
| 页面结构、信息层级、交互模型变化 | yes | [00b](./00b-visual-design-review-workflow.md) |
| 新 adapter 方法或 real-readonly 接入 | yes | spec gate |
| 跨 3+ 文件的 UI 重构 | yes | spec gate |
| 新第三方 UI/graph/table 库 | yes | design gate + product-owner decision |
| 测试断言批量同步 | yes, 可小 plan | spec gate if behavior is ambiguous |
| 单文件 typo / 明显 import 修复 | optional | 最小验证 |
| 仅更新文档对齐代码 | optional | 明确 doc-only 范围 |

## 3. Plan 位置与命名

目录：

```text
docs/research-agent/target-system/trader-agent/02-web-agent-cockpit-development/plans/
```

命名：

```text
{两位序号}-{kebab-case-slug}.md
```

索引：[plans/README.md](./plans/README.md)

## 4. Plan 模板

每个新 plan 或重大修订 plan 使用以下结构。旧 plan 可以逐步迁移，但交给 worker 前必须补齐缺失项。

```markdown
# {序号} — {标题}

Status: draft | in_progress | done | cancelled
Owner: {agent 或人名}
Created: YYYY-MM-DD
Source PRD:
- {链接到 PRD / development doc / status}

Required Workflow / Skills:
- `module-spec-quality-gate`
- {如适用：`cockpit-frontend-workflow`, `agent-module-development-loop`, `phase-review-agent-workflow`}

## 1. 目标

一句话说明交付物和用户可观察结果。

## 2. 非目标

明确不做的事，尤其是交易、订单、审批、workflow builder、未确认 API contract。

## 3. Context Pack

- 当前代码位置：
- 当前测试：
- 当前 status：
- 已确认决策：
- 仍需用户确认的问题：无 / 列表

## 4. 方案摘要

架构、数据流、组件/文件清单。只写本任务需要的方案，不重复通用 workflow。

## 5. 允许修改的文件

- 白名单路径。

## 6. 禁止修改的范围

- 黑名单路径。
- 明确说明是否允许更新 status、plan、module doc。

## 7. 任务清单

- [ ] Task 1
- [ ] Task 2

## 8. 测试与断言

| 测试 | 设置 | 断言 |
|---|---|---|

## 9. Acceptance To Verification Map

| 验收标准 | 测试或命令 |
|---|---|

## 10. 验收命令

~~~powershell
pnpm --filter trader-cockpit lint
pnpm --filter trader-cockpit build
node --test test/trader-cockpit-phase0.test.mjs
~~~

## 11. Worker Prompt

自包含 prompt。必须包含 source-of-truth、允许文件、禁止文件、测试、验收命令和最终回复格式。

## 12. 完成后文档更新

- [ ] `00-implementation-status.md`
- [ ] 本 plan `Status: done`
- [ ] 相关模块 doc
```

## 5. 开发执行顺序

1. **路由**：按 [../00-workflow-router.md](../00-workflow-router.md) 和 [00e](./00e-workflow-and-skill-routing.md) 选择主 workflow。
2. **读**：`README.md` -> `00-implementation-status.md` -> 对应 PRD/module doc/current code/tests。
3. **闸**：用 `module-spec-quality-gate` 消除 source、决策、范围、验收歧义。
4. **写**：在 `plans/` 创建或修订 plan，`Status: draft`。
5. **做**：只修改 plan 白名单内文件。
6. **验**：运行 plan 中的验收命令。
7. **记**：按 plan 更新 `00-implementation-status.md`、plan status 和相关模块 doc。

## 6. Cockpit 代码约定

- 数据：页面/组件只通过 `cockpitAdapter` 或 `CockpitDataAdapter`，不直接 import fixture。
- UI：HeroUI 已有 primitives 优先；复杂控件先找成熟库，再做业务语义包装。
- 封装：重复 UI 模式放入 cockpit primitive，不在页面里堆一次性 Tailwind class。
- 文案：新增 UI 字符串进 `lib/i18n/resources.json`，`zh-CN` 与 `en-US` 同步。
- 状态：TanStack Query 管服务端数据；Zustand 只管 UI 选择/偏好。
- 路由：统一 `/cockpit/*` 前缀。
- 代码：业务/UI 逻辑使用 TypeScript / TSX；fixture 用 JSON；不得新增业务 `.js` / `.mjs`。
- import：使用 `@/*`，不得新增 parent-chain import。
- 测试：结构性约束优先放 `test/trader-cockpit-phase0.test.mjs`，避免锁死临时 class string。

## 7. Worker Prompt 规则

委托开发 agent 时，prompt 必须：

1. 指定要执行的 plan 文件路径。
2. 说明 plan 已通过 spec gate，或列出仍需主 agent/user 决定的问题。
3. 要求 worker 先读 plan，再读 plan 列出的 source-of-truth 和代码文件。
4. 明确允许文件与禁止文件。
5. 明确不得 commit。
6. 要求最终回复列出：修改文件、测试结果、失败命令输出、未解决风险。

不得把 worker prompt 当作 plan 的替代品。Worker prompt 是 plan 的执行附录。

## 8. 与上级文档关系

| 文档 | 角色 |
|---|---|
| [../00-workflow-router.md](../00-workflow-router.md) | trader-agent 全局 workflow 入口 |
| [../02-web-agent-cockpit-prd.md](../02-web-agent-cockpit-prd.md) | Cockpit 产品边界与验收 |
| [README.md](./README.md) | Cockpit 实施索引 |
| [00-implementation-status.md](./00-implementation-status.md) | 代码真值快照 |
| [00e-workflow-and-skill-routing.md](./00e-workflow-and-skill-routing.md) | Cockpit 局部 workflow 路由 |
| `plans/*.md` | 单次任务可执行规格 |
| 模块 doc（03-16） | 页面/模块长期参考；与代码冲突时以 status + 当前代码为准，并回写模块 doc |
