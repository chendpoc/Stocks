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
4. For old research-console material, use `research-agent/README.md` and
   `research-agent/modules/README.md` only through the `legacy_migration` route.

## Directory Map

| Path | Purpose |
|---|---|
| `research-agent/` | Trader-agent target system plus historical research-console material. |
| `workflows/` | Internal development workflow docs. |
| `adr/` | Architecture decision records. |
| `research-reports/` | Long-form research and system direction notes. |
| `legacy/` | Superseded or historical planning docs. |
| `plans/superpowers/` | Historical execution plans. |

## Boundary

Keep VitePress site content in `docs/`. Keep AI execution artifacts in
`.agent-dev/`. Do not move `docs/summaries/**`, `docs/opportunities/**`,
`docs/trading-experiences/**`, `docs/assets/**`, `docs/alerts/**`,
`docs/search*`, or `docs/index*` into this tree.
