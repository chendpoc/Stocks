# Cockpit Development Plans

本目录存放可执行任务规格。上级规则：

- Trader-agent workflow 入口：[../../00-workflow-router.md](../../00-workflow-router.md)
- Cockpit plan contract：[../00-development-workflow.md](../00-development-workflow.md)
- Cockpit workflow router：[../00e-workflow-and-skill-routing.md](../00e-workflow-and-skill-routing.md)

## 状态索引

| Plan | Status | 说明 | 规格状态 |
|---|---|---|---|
| [00-fix-phase0-test-drift.md](./00-fix-phase0-test-drift.md) | done | 同步 3 个失败的 phase0 测试断言 | legacy |
| [01-agent-activity-graph-readonly.md](./01-agent-activity-graph-readonly.md) | in_progress | Phase 0D-2：@xyflow/react 只读 DAG（scaffold exists, not wired） | legacy |
| [02-dashboard-reference-page-quality-reset.md](./02-dashboard-reference-page-quality-reset.md) | active | Dashboard 标杆页质量重置：先设计系统、再实现页面 | design-gated |
| [02-dashboard-reference-page-image2-prompt.md](./02-dashboard-reference-page-image2-prompt.md) | active | Dashboard 标杆页草图生成提示文件 | prompt artifact |
| [03-script-dedup-and-cockpit-quality-foundation.md](./03-script-dedup-and-cockpit-quality-foundation.md) | done | Script 函数抽离 + Cockpit 前端质量基础 | legacy |
| [04-agent-core-api-gap-fix.md](./04-agent-core-api-gap-fix.md) | done | 01 Agent Core 补 API endpoint（signals、market gate/snapshot） | legacy |
| [05-real-readonly-adapter.md](./05-real-readonly-adapter.md) | draft | Cockpit 接入真实 Agent Core 数据（real-readonly-adapter + env 开关） | needs spec gate before worker |
| [06-settings-data-source-toggle.md](./06-settings-data-source-toggle.md) | draft | Settings 页面 Mock/Real 数据源切换 | needs spec gate before worker |

新增 plan 时请在此表登记。完成后将 Status 改为 `done`，并在对应 status/module doc 回写。

## 命名规则

```text
{两位序号}-{kebab-case-slug}.md
```

## 规格状态说明

| 状态 | 含义 |
|---|---|
| `legacy` | 旧模板计划。继续执行前必须补齐 source、scope、verification 或重跑 spec gate |
| `design-gated` | 已进入视觉/交互门禁流程 |
| `prompt artifact` | 不是实现计划，只是生成或评审提示文件 |
| `needs spec gate before worker` | 不能直接交给 worker；先用 `module-spec-quality-gate` |
| `revised to spec-gate format` | 已按新规格门禁修订，可继续审查或执行 |

## 快速创建

1. 先按 [../../00-workflow-router.md](../../00-workflow-router.md) 选择主 workflow。
2. 非平凡任务先使用 `module-spec-quality-gate`。
3. 复制 [../00-development-workflow.md](../00-development-workflow.md) §4 模板。
4. 填完 source-of-truth、confirmed decisions、allowed/forbidden files、tests、acceptance-to-verification map。
5. 再写 worker prompt；不要复制旧 prompt 后局部替换。
