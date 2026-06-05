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

Minimal startup is a task id prefix or full task artifact basename:

```text
Review plan T00X
Review task T00X
Implement task T00X slice <id>
```

Subagents must resolve active task artifacts before reading source files:

- `T00X` resolves to exactly one `.agent-dev/tasks/T00X-*.json`.
- `T00X-<slug>` resolves to `.agent-dev/tasks/T00X-<slug>.json`.
- The matching task markdown uses the same basename with `.md`.
- Matching slice docs, when present, live under
  `.agent-dev/tasks/T00X-<slug>-slices/`.
- If no active task matches, or multiple active tasks match, stop and report an
  artifact-gate finding. Do not fall back to `project-docs/archive/agent-dev/**`.

After resolving the task JSON, derive `spec_id`, read the matching
spec/task/slice artifacts, and then derive read/write/review boundaries from:

- `spec.scope.create`
- `spec.scope.modify`
- `spec.scope.readonly_import`
- `spec.scope.forbidden`
- `task.steps[].files_expected`

Worker prompts, `code_map.md`, `module_map.md`, source files, and diffs are not
default startup reads. Use them only after scope is narrowed and only when the
selected task or review target requires them.

## Current Project Structure Guard

Route current trader-agent system work through
`project-docs/research-agent/target-system/trader-agent/README.md` and
`.agent-dev/context/ai-index.md`. The active implementation surfaces are
`apps/trader-agent/backend`, `apps/trader-agent/shared`,
`apps/trader-workflows`, and `apps/trader-cli`; use `apps/trader-chart` only
when the task/spec explicitly names it. `apps/research-console`,
`apps/trader-cockpit`, and `project-docs/archive/**` are historical context
only unless the user explicitly asks for an archive audit.

## Dispatch Templates

- `plan-review-dispatch-template.md`
- `code-review-dispatch-template.md`

The parent agent owns final verification, durable artifact writes, and any
product or architecture decisions surfaced by subagents.
