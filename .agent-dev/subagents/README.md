# Subagents

Reusable read-only review and bounded implementation protocols for
`.agent-dev` tasks. Parent agents pass the protocol plus a minimal task id or
review target; subagents derive scope from current repo artifacts.

| Subagent | Protocol | Purpose |
|---|---|---|
| code-task worker | `code-task-worker.md` | Implement a scoped task after spec/task boundaries are clear. |
| plan-review agent | `plan-review-agent.md` | Review plan/spec/task readiness before implementation. |
| code-review agent | `code-review-agent.md` | Review a scoped changed-file list and per-file diffs against spec/task. |

## Startup Rule

Minimal startup is a task id:

```text
Review plan T00X
Review task T00X
Implement task T00X slice <id>
```

Subagents must resolve `T00X.json`, derive `spec_id`, read the matching
spec/task/slice artifacts, and then derive read/write/review boundaries from:

- `spec.scope.create`
- `spec.scope.modify`
- `spec.scope.readonly_import`
- `spec.scope.forbidden`
- `task.steps[].files_expected`

Worker prompts, `code_map.md`, `module_map.md`, source files, and diffs are not
default startup reads. Use them only after scope is narrowed and only when the
selected task or review target requires them.

## Dispatch Templates

- `plan-review-dispatch-template.md`
- `code-review-dispatch-template.md`

The parent agent owns final verification, durable artifact writes, and any
product or architecture decisions surfaced by subagents.
