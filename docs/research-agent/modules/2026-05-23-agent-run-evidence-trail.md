# Agent Run Evidence Trail

## Purpose

Persist each research-console agent run as a local, sanitized audit record.

The agent already returns tool traces, policy decisions, used context, and staged opportunity reasoning. Those details currently live only in the browser response. A local evidence trail makes the research workbench reproducible: we can inspect what context, tool outputs, and policy gates produced a given answer without re-running the model or external tools.

## Boundaries

- Write only to local cache under `.cache/research-agent/runs/`.
- Never write to `docs/`, `data/structured/`, summary publishing scripts, or public VitePress outputs.
- Store workspace-relative paths only; do not persist absolute local paths.
- Do not persist environment variables, API keys, webhook URLs, authorization headers, or raw external provider payloads.
- Do not persist raw source Markdown or raw structured-summary JSON.
- Keep trading language bounded to research observation. The log must not add buy/sell/long/short instructions.
- The browser may receive a `run_id` and workspace-relative evidence log path, but not the full historical log.

## Files

Expected implementation write scope:

- `packages/summary-core/src/index.ts`
- `apps/research-console/lib/agent-evidence.ts`
- `apps/research-console/lib/agent-kernel.ts`
- `apps/research-console/components/AgentPanel.tsx`
- `apps/research-console/app/globals.css`
- `test/daily-summary-assets.test.mjs`

Documentation:

- `docs/research-agent/tooling.md`
- `docs/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`

## Tests

RED first:

```powershell
node --test --test-name-pattern "agent run evidence" test\daily-summary-assets.test.mjs
```

Expected initial failure:

- `runResearchAgent(...)` response does not include `run_id`.
- `.cache/research-agent/runs/YYYY-MM-DD.jsonl` is not written.

GREEN verification:

```powershell
node --test --test-name-pattern "agent run evidence|agent response includes staged opportunity reasoning|renders staged opportunity reasoning" test\daily-summary-assets.test.mjs
npm run console:lint
npm run test:summary
npm run console:build
npm run pages:build
git diff --check
```

## Agent Split

- Low-decision agent task: inspect current chat/tool trace surfaces and propose evidence fields and privacy boundaries.
- Main-agent responsibility: own the schema, write RED tests, integrate kernel persistence, and verify that the public build is unaffected.

## Risks

- Privacy: local agent prompts may include sensitive notes. Keep logs in `.cache/`, do not publish.
- Secret leakage: external tool traces and provider failures must be sanitized before writing.
- Determinism: use append-only JSONL so each run is auditable and cheap to inspect.
- Performance: cap stored string lengths and store one line per run.
- Trading-instruction risk: evidence logs record observations and tool outputs; they do not generate new trade directives.
