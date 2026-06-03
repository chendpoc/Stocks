# Shared Research Console API Auth Guard

## Purpose

Deduplicate the production access-token guard used by React research-console API routes.

The current API routes each define their own `isAuthorizedProductionRequest(...)`. That is acceptable for a small prototype, but it creates a security drift risk: one route can silently diverge from the others. The shared guard should make the protected local/prod boundary explicit and testable.

## Boundaries

- Runtime surface: `apps/research-console/app/api/**/route.ts`.
- Shared implementation: `apps/research-console/lib/api-auth.ts`.
- Behavior must stay unchanged:
  - Non-production requests are allowed.
  - Production requests require `RESEARCH_CONSOLE_ACCESS_TOKEN`.
  - The request header must be `x-research-console-token`.
  - Missing or wrong token returns `403`.
- Do not change route business payloads.
- Do not expose token values to browser responses.

## Files

Expected implementation write scope:

- `apps/research-console/lib/api-auth.ts`
- `apps/research-console/app/api/agent/chat/route.ts`
- `apps/research-console/app/api/agent/runs/route.ts`
- `apps/research-console/app/api/research/context/route.ts`
- `apps/research-console/app/api/research/data-sources/route.ts`
- `apps/research-console/app/api/research/opportunities/route.ts`
- `apps/research-console/app/api/research/tools/route.ts`
- `test/daily-summary-assets.test.mjs`

Documentation:

- `project-docs/research-agent/tooling.md`
- `project-docs/plans/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`

## Tests

RED first:

```powershell
node --test --test-name-pattern "shared research console API auth" test\daily-summary-assets.test.mjs
```

Expected initial failure:

- `apps/research-console/lib/api-auth.ts` does not exist, or routes still define local auth guard copies.

Observed RED on 2026-05-23:

- `Cannot find module ... apps/research-console/lib/api-auth.ts`
- `ENOENT ... apps/research-console/lib/api-auth.ts`

GREEN verification:

```powershell
node --test --test-name-pattern "shared research console API auth|agent evidence log viewer" test\daily-summary-assets.test.mjs
npm run console:lint
npm run test:summary
npm run console:build
npm run pages:build
git diff --check
```

Observed targeted GREEN on 2026-05-23:

- `shared research console API auth guard protects production route handlers`
- `shared research console API auth guard is imported by every console API route`
- `shared research console API auth guard rejects unauthorized production requests for every console API route`

## Agent Split

- Low-decision review task suitable for a subagent: confirm every route imports the shared guard and no route keeps a local production-token guard copy.
- Main-agent responsibility: TDD, route-handler behavior tests, implementation, and full regression.

## Risks

- Security drift: leaving one route with copied guard defeats the purpose.
- Behavioral regression: changing development-mode behavior could break local console use.
- Secret leakage: error payloads must mention the missing configuration name, not the token value.
