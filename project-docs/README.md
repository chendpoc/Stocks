# Project Docs

Internal project documentation lives here. This tree is not the VitePress
public site.

## Reading Order

1. For repo orientation, start with `overview.md`.
2. For AI workflow and task execution, use
   `workflows/agent-dev-workflow.md` only after `.agent-dev/context/ai-index.md`
   routes you there.
3. For the active trader-agent target system, start with
   `research-agent/target-system/README.md`.
4. For current project backlog and implementation ordering, use
   `backlog/README.md`.
5. For archived research-console, trader-cockpit, or agent-dev material, use
   `archive/README.md` only when historical context is explicitly requested.

## Directory Map

| Path | Purpose |
|---|---|
| `backlog/` | Project-level Now / Next / Later / Blocked backlog index and per-requirement files. |
| `research-agent/` | Active trader-agent target-system docs. |
| `archive/` | Historical research-console, trader-cockpit, legacy trader-agent, agent-dev, and migration material. |
| `workflows/` | Internal development workflow docs. |
| `adr/` | Architecture decision records. |
| `research-reports/` | Long-form research and system direction notes. |

## Boundary

Keep VitePress site content in `docs/`. Keep AI execution artifacts in
`.agent-dev/`. Do not move `docs/summaries/**`, `docs/opportunities/**`,
`docs/trading-experiences/**`, `docs/assets/**`, `docs/alerts/**`,
`docs/search*`, or `docs/index*` into this tree.
