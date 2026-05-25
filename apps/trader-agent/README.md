# Trader Agent Subproject

`apps/trader-agent/` is the standalone product subproject for the trader-agent target system.

It is intentionally separate from `apps/research-console/`. The existing research console remains a migration/reference asset, not the final application surface.

## Subproject Layout

```text
apps/trader-agent/
  package.json
  backend/
    pyproject.toml
    app/
    tests/
  cockpit/
    app/
    components/
    lib/
  shared/
    rulepacks/
    schemas/
```

## Ownership

- `backend/`: Agent Core Backend implementation.
- `cockpit/`: Web Agent Cockpit implementation.
- `shared/`: product-level contracts shared by backend and cockpit, including RulePack files and schema definitions.

## Current Phase

Phase 0 starts with `backend/` only:

- FastAPI health endpoint.
- SQLite runtime schema bootstrap.
- RulePack loader reading `shared/rulepacks/v0_1_0.yaml`.
- Agent event audit writer.
- Minimal pytest coverage.

No trading execution path belongs in this subproject.

Package scripts assume the repository root `.venv` exists and contains the backend Python dependencies.
