# Target System Docs

Active target-system definitions live here. At the moment the active product
system is `trader-agent/`.

## Reading Order

1. `trader-agent/README.md`
2. `trader-agent/00-workflow-router.md`
3. `../../backlog/README.md` when checking project-level backlog ordering.
4. `trader-agent/08-agent-engineering-principles-proposal.md` when adding agentic workflow, tool/MCP, skill, or long-running run behavior.
5. The route-specific PRD, roadmap, or development package named by the router.

## Authority

- Target-system docs override old research-console routes and legacy module
  documents when they conflict.
- Legacy files under `project-docs/research-agent/modules/**` can be used as migration
  evidence, not as current direction.
- Keep existing paths stable unless a dedicated migration task updates tests,
  specs, and route indexes together.

## Current System

| System | Entry | Status |
|---|---|---|
| trader-agent | `trader-agent/README.md` | active |
