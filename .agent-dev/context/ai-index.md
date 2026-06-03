# AI Context Index

Private routing index for AI agents. This file is not part of the public
VitePress docs. Its job is to keep the default read set small and route-gated.

## Default Rule

Always start with:

```text
CLAUDE.md
.agent-dev/context/ai-index.md
```

Then select one `task_type` and read only its `read_first` set. Do not read
specs, tasks, code maps, corpus, archive, or source files unless the selected
route calls for them.

## Context Guards

- Do not broad-read `project-docs/**` or `project-docs/research-agent/**`.
  Navigate through one route's `read_first` and `read_if_needed` entries.
- Do not run repository-wide document inventory as a substitute for this index.
  Use bounded paths from the selected route only.
- In a dirty worktree, start with `git status --short`. Do not read a full
  unrestricted `git diff` by default; inspect only scoped diffs such as
  `git diff -- <path>`.

## Route Table

| task_type | read_first | read_if_needed | do_not_read | spec_task_required | code_map_required | codegraph_when |
| --- | --- | --- | --- | --- | --- | --- |
| repo_orientation | project-docs/README.md | CLAUDE.md; package.json; .agent-dev/README.md; project-docs/overview.md; project-docs/research-agent/README.md | docs/summaries/**; docs/assets/**; project-docs/archive/**; .agent-dev/reviews/**; .agent-dev/*worker-prompt.md | no | no | only if asked about code ownership |
| agent_dev_spec_task | .agent-dev/README.md | .agent-dev/memory/schemas.md; project-docs/workflows/agent-dev-workflow.md; .agent-dev/context/code_map.md | docs/summaries/**; docs/assets/**; project-docs/archive/**; docs/search_index.json | yes | conditional | when implementation files are unclear |
| trader_agent_system | project-docs/research-agent/target-system/README.md; project-docs/research-agent/target-system/trader-agent/README.md; project-docs/research-agent/target-system/trader-agent/00-workflow-router.md | project-docs/research-agent/target-system/trader-agent/00-system-overview.md; project-docs/backlog/README.md | docs/summaries/**; docs/assets/**; docs/search_index.json; .agent-dev/reviews/** | conditional | conditional | when mapping target docs to code |
| trader_workflows | apps/trader-workflows/package.json | .agent-dev/context/code_map.md; project-docs/research-agent/target-system/trader-agent/05-agent-workflow-orchestration-roadmap.md; project-docs/adr/0001-langgraph-minimal-stage1.md | docs/summaries/**; docs/assets/**; project-docs/archive/**; .agent-dev/tasks/**; .agent-dev/specs/** | conditional | conditional | before editing workflow code |
| trader_cli_tui | apps/trader-cli/package.json | .agent-dev/context/code_map.md; project-docs/research-agent/target-system/trader-agent/00-workflow-router.md | docs/summaries/**; docs/assets/**; project-docs/archive/**; .agent-dev/tasks/**; .agent-dev/specs/** | conditional | conditional | before editing CLI/TUI code |
| corpus_research | project-docs/research-agent/target-system/trader-agent/03-shared-agent-memory-prd.md | docs/summaries/**; docs/opportunities/**; docs/trading-experiences/**; apps/trader-agent/backend/app/modules/artifact_catalog.py | docs/assets/**; docs/search_index.json; .agent-dev/reviews/** | conditional | conditional | when corpus code or indexing behavior is in scope |

## Lifecycle Rules

| status | meaning | default_read |
| --- | --- | --- |
| active | Current source-of-truth or active execution artifact | Allowed only through route `read_first` or `read_if_needed`. |
| runtime_corpus | Financial corpus used by tooling | Only `corpus_research` may read by default. |
| archived | Historical implementation or old route | Never read by default; use only for explicit historical context. |
| generated | Generated output, index, screenshots, cache, reports | Never read by default. |
| review_record | Historical review or worker evidence | Never read by default unless reviewing that artifact. |

## Entry Budgets

- `CLAUDE.md`: target under 180 lines.
- `.agent-dev/context/ai-index.md`: target under 220 lines.
- `.agent-dev/context/code_map.md`: target under 120 lines.
- `.agent-dev/context/module_map.md`: target under 120 lines.
- `read_first`: 1 to 3 entries per route.

These budgets are guardrails. A route is invalid if it stays small but points to
the wrong documents.

## Escalation Rules

- Need to implement or review code: read the relevant spec/task first if the
  route marks `spec_task_required = yes`.
- Need to find code paths: read `.agent-dev/context/code_map.md` only if the
  route marks `code_map_required = yes` or `conditional` and the path is not
  obvious. Read `.agent-dev/context/module_map.md` only after route, spec, or
  task scope has narrowed the code area but module ownership is still unclear.
- Need symbol/call/impact details: use codegraph after route and spec context.
- Need market evidence or historical rules: switch to `corpus_research`.
- Need old research-console or trader-cockpit material: read `project-docs/archive/README.md`
  only when the user explicitly asks for historical context.
- Need old agent-dev specs, tasks, worker prompts, reviews, presentations, or
  design notes: read `project-docs/archive/agent-dev/README.md` only when the
  user explicitly asks for historical implementation evidence.
