# Longbridge Quote Tool

## Purpose

Add `longbridge_quote` as an explicit opt-in evidence tool for the React research console. The tool provides latest quote context for a single symbol so the opportunity agent can compare local admin theory against market state.

This belongs in the research console because it is interactive, policy-gated, and evidence-oriented. It does not belong in the daily summary publishing pipeline.

## Boundaries

- Read: server-side environment variables and local `.cache/research-tools/longbridge_quote/`.
- Write: sanitized quote cache under `.cache/research-tools/longbridge_quote/YYYY-MM-DD/SYMBOL.json`.
- Browser exposure: only readiness status and bounded tool trace summaries.
- External calls: allowed only when `RESEARCH_ENABLE_EXTERNAL_TOOLS=1` and Longbridge credentials are configured.
- Trading boundary: return quote evidence only. Do not produce buy, sell, long, short, or position instructions.
- Secret boundary: never expose `LONGBRIDGE_APP_KEY`, `LONGBRIDGE_APP_SECRET`, `LONGBRIDGE_ACCESS_TOKEN`, request headers, or raw provider metadata in traces or cache.

## Files

- `apps/research-console/lib/tool-policy.ts`
- `apps/research-console/lib/agent-tools.ts`
- `apps/research-console/lib/market-data-sources.ts`
- `apps/research-console/lib/agent-provider.ts`
- `test/daily-summary-assets.test.mjs`
- `docs/research-agent/tooling.md`
- `docs/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`

## Tests

RED first:

```powershell
node --test --test-name-pattern "longbridge" test\daily-summary-assets.test.mjs
```

Expected red state:

- `longbridge_quote` remains blocked or not executable after opt-in.
- No executor writes sanitized Longbridge cache.
- The provider does not expose `longbridge_quote` in model planning metadata.

GREEN verification:

```powershell
node --test --test-name-pattern "longbridge|market data source" test\daily-summary-assets.test.mjs
npm run console:lint
npm run test:summary
npm run console:build
npm run pages:build
git diff --check
```

## Agent Split

- Main agent owns module doc, tests, implementation, and final integration.
- One review agent may audit the completed patch for policy leakage and scope creep.
- No parallel implementation agents for this module because the write set is small and coupled.

## Risks

- Policy risk: live quote access must remain blocked by default.
- Privacy risk: credentials must never enter cache, traces, browser payloads, or docs examples.
- Determinism risk: tests must use fixture or mocked fetch, not real Longbridge network calls.
- Product risk: quote evidence can improve context but must not become automated trading advice.
- API drift risk: the executor accepts a configurable endpoint and normalizes common quote fields instead of assuming a brittle provider response shape.
