# .agent-dev

Private agent development artifacts. This directory is not the public docs
site. It stores execution context, specs, tasks, worker prompts, reviews, and
change records.

## Reading Order

Default:

```text
CLAUDE.md
.agent-dev/context/ai-index.md
route.read_first
```

Only read more when the selected route requires it:

- `.agent-dev/specs/<feature>/spec.json`: implementation, review, or non-trivial
  planning.
- `.agent-dev/tasks/T00X.json`: task execution, status checks, or review.
- `.agent-dev/context/code_map.md`: code work when paths are not already clear.
- Worker prompts: only when executing or reviewing that worker task.
- Review JSON/Markdown: only when reviewing that review artifact.

## Directory Contract

```text
.agent-dev/
  README.md
  context/
    ai-index.md        # private AI route index
    code_map.md        # code locator, not a default entrypoint
  memory/
    schemas.md         # JSON schema definitions for specs/tasks/reviews
    cursor-setup.md
  specs/<feature>/
    spec.md
    spec.json
    dev-plan.md
    decision-record.json
    clarification-questions.{md,json}
  tasks/
    T00X.{md,json}
    T00X-slices/
  reviews/
  changesets/
  presentations/
  *-worker-prompt.md
```

## Artifact Rules

| Artifact | Purpose | Read by default |
|---|---|---|
| `context/ai-index.md` | Route AI to the minimal source set | yes |
| `context/code_map.md` | Locate code modules after route/spec narrowing | no |
| `specs/<feature>/spec.json` | Machine-readable scope, decisions, verification | route-dependent |
| `specs/<feature>/spec.md` | Human-readable spec | route-dependent |
| `tasks/T00X.json` | Machine-readable task steps and dependencies | route-dependent |
| `tasks/T00X.md` | Human-readable task | route-dependent |
| `*-worker-prompt.md` | Worker execution prompt | no |
| `reviews/*` | Review evidence | no |
| `changesets/*` | PR/change packaging | no |

## Spec/Task Workflow

Use this workflow only when the selected route or user request requires
non-trivial implementation or review:

1. Read the relevant `spec.json`.
2. Read the relevant `tasks/T00X.json`.
3. Confirm scope, forbidden files, decisions, and verification.
4. Use `context/code_map.md` only if code paths are unclear.
5. Use codegraph for symbols, flows, callers, callees, and impact.
6. Run the task-specific verification commands.

Do not let `.agent-dev` artifacts override current user instructions or active
source-of-truth docs.
