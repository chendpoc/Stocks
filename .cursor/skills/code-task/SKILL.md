---
name: code-task
description: >-
  Dispatch and run the code-task worker subagent to understand task intent,
  lock spec scope, implement surgically, and verify with evidence. Use when the
  user asks to complete a code task, implement a T00X step or slice, run a
  worker prompt, fix a bounded bug, or says「完成 code task」「执行 T005-S1」
  「按 worker prompt 实现」.
---

# Code Task Subagent

把「理解意图 → 读源码与 spec → 锁定范围 → 实现 → 验证 → 结构化 handoff」交给专用 worker subagent，父 agent 负责编排与验收。

## 何时启用

| 场景 | 做法 |
|---|---|
| 用户给出 `.agent-dev/tasks/T00X` 某 step / slice | 走 spec-driven 路径 |
| 用户指向 `*-worker-prompt.md` | 以 worker prompt 为任务源 |
| 用户描述 bounded 代码改动（1–5 文件、行为明确） | 压缩 spec，仍走同一 worker |
| 纯问答 / 大范围重构 / 无验收标准 | **不** dispatch；父 agent 直接处理或先走 Plan Gate |

## 父 Agent 流程（编排者）

### 1. 解析任务意图

填写以下字段（缺则向用户澄清，**最多 1 个阻塞问题**）：

```text
task_id:        T005 | ad-hoc | none
spec_id:        trader-longbridge-agent-cli | none
slice_or_step:  S1 | P2-S1 | none
intent_summary: 一句话（用户要什么、为什么）
task_type:      implement | audit_patch | bugfix | test_only | docs
success_criteria: 可检查的完成条件（来自 task.json verification 或用户原话）
```

非平凡任务必须先确认存在可读 spec/task；若无 spec 且改动跨模块 → 停止 dispatch，提示走 spec-driven workflow。

### 2. 组装 dispatch 包

必读（按 task 类型裁剪）：

- `CLAUDE.md` — 规约与 gotchas
- `.agent-dev/context/code_map.md` — 结构定位
- `.agent-dev/specs/<spec_id>/spec.json` — scope / decisions / verification
- `.agent-dev/tasks/T00X.json` + 对应 slice/step md
- 任务专属 `*-worker-prompt.md`（若有）

### 3. 启动 Subagent

用 Cursor **Task** 工具，`subagent_type: generalPurpose`，`readonly: false`。

**Prompt 结构**（把下面模板 + 任务包发给 subagent）：

```text
你是 stock-community-summary 的 code-task worker。

## 执行协议
完整步骤见仓库文件：.agent-dev/subagents/code-task-worker.md
必须先 Read 该文件并严格遵循，不得跳过 Verify 与 Handoff 章节。

## 本次任务包
Repository: d:\workspace\01-products\stock-community-summary
task_id: <T00X | ad-hoc>
spec_id: <feature | none>
slice_or_step: <Sx | none>
task_type: <implement | audit_patch | ...>
intent_summary: <一句话>
may_edit: <glob 列表>
must_not_edit: <来自 spec.scope.forbidden + CLAUDE.md forbidden>
verification: <命令列表，来自 spec.verification 或 task step>
worker_prompt_path: <可选，绝对或 repo 相对路径>
extra_context: <用户补充约束>

## 交付要求
按 code-task-worker.md 的 Handoff 模板输出；不要 commit；不要改 git config。
```

并行：若 S1/S2/S3 仅依赖 S0 且文件无交集，可 **同时** 启动多个 Task（每个带不同 slice 包）。

### 4. 父 Agent 验收（不可委托）

Subagent 返回后，父 agent **必须**：

1. 读 git diff — 确认无 scope.forbidden 文件
2. **亲自**跑 verification 命令（不信 subagent 口头报告）
3. 对照 `success_criteria` / task exit_criteria
4. 有问题：带 evidence 让 subagent resume 或本地窄补丁

完成前读 `verification-before-completion` skill。

## 与现有 workflow 的关系

```text
module-spec-quality-gate（spec 模糊时 upstream）
  → code-task subagent（实现）
  → code-reviewer / phase-review（Review Gate）
  → verification-before-completion（父 agent Claim 前）
```

## 详细 Worker 协议

→ [.agent-dev/subagents/code-task-worker.md](../../.agent-dev/subagents/code-task-worker.md)

## 示例 dispatch

**T005-S1 patch longbridgeCli：**

```text
task_id: T005
spec_id: trader-longbridge-agent-cli
slice_or_step: S1
task_type: audit_patch
intent_summary: validateLongbridgeInvoke 加 _default_allowed_first_args；longbridgeCli.test 加 3 项
may_edit: apps/trader-cli/src/services/longbridgeCli.ts, apps/trader-cli/src/services/longbridgeCli.test.ts
must_not_edit: apps/trader-cockpit/**, app/modules/**, apps/trader-cli/src/services/longbridge.ts
verification: cd apps/trader-cli && npm test -- src/services/longbridgeCli.test.ts
worker_prompt_path: .agent-dev/trader-longbridge-agent-worker-prompt.md（§ S1）
```
