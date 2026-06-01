# Subagents — 专用 Worker 协议

> 父 agent 通过 Cursor **Task** 工具 dispatch；编排说明见 `.cursor/skills/code-task/SKILL.md`。

| Subagent | 协议文件 | 用途 |
|---|---|---|
| **code-task worker** | [code-task-worker.md](./code-task-worker.md) | 理解任务意图 → 读 spec/源码 → 锁定范围 → 实现 → 验证 → Handoff |
| **plan-review agent** | [plan-review-agent.md](./plan-review-agent.md) | 实现前只读审查 plan/spec/task/worker prompt 是否可交给 worker |
| **code-review agent** | [code-review-agent.md](./code-review-agent.md) | 只读对比 task/spec/decision/diff/verification，输出 Review Gate findings |

## 与 worker prompt 的区别

| 类型 | 路径 | 何时用 |
|---|---|---|
| **Subagent 协议** | `.agent-dev/subagents/*.md` | 通用执行纪律（所有 code task 共用） |
| **Task worker prompt** | `.agent-dev/*-worker-prompt.md` | 某一 Task 的具体步骤（如 T005 S1–S8） |

Dispatch 时：**协议 + 最小任务 id +（可选）task worker prompt / review target** 一起发给 subagent。

Review agent 的最小启动方式是只给 task id。它必须从 `T00X.json` 自动解析 `spec_id`、task markdown、slice docs、worker prompt、spec/decision、diff 和验证证据。

Plan review agent 的最小启动方式也是只给 task id。它必须从 `T00X.json` 自动解析 `spec_id`、task markdown、slice docs、dev plan、worker prompt、spec/decision、workflow、code map 和 CodeGraph 上下文。

## 示例

```text
Task(generalPurpose):
  prompt = Read(.agent-dev/subagents/code-task-worker.md)
         + 任务包（T005 / S1 / may_edit / verification）
         + Read(.agent-dev/trader-longbridge-agent-worker-prompt.md § S1)
```

```text
Task(generalPurpose):
  prompt = Read(.agent-dev/subagents/plan-review-agent.md)
         + "Review plan T00X"
```

```text
Task(generalPurpose):
  prompt = Read(.agent-dev/subagents/code-review-agent.md)
         + "Review task T00X"
```

完整可复制模板：

- [plan-review-dispatch-template.md](./plan-review-dispatch-template.md)
- [code-review-dispatch-template.md](./code-review-dispatch-template.md)

父 agent 必须亲自跑 verification，见 `verification-before-completion` skill。
