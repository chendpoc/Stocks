# Research Console Standalone Boundary

Date: 2026-05-23

## Purpose

Convert the product decision into enforceable repo structure: the research workbench is a separate application surface, while the public daily report site stays static and lightweight.

## Boundaries

- May add verification workflow and architecture documentation.
- May add tests that prove the CI and deployment boundary.
- Must not deploy the research console publicly in this step.
- Must not change daily summary generation, WeCom delivery, or VitePress content behavior.

## Files

- `.github/workflows/research-console.yml`
- `docs/research-agent/standalone-site-architecture.md`
- `test/daily-summary-assets.test.mjs`

## Tests

Red:

```powershell
node --test --test-name-pattern "research console.*separate|research console standalone" test/daily-summary-assets.test.mjs
```

Green:

```powershell
node --test --test-name-pattern "research console.*separate|research console standalone" test/daily-summary-assets.test.mjs
```

Full gate:

```powershell
npm run release:check
```

## Agent Split

- Main agent owns the boundary decision, final review, and release gate.
- A read-only explorer may audit whether the repo already reflects the boundary.
- No worker should modify daily publishing or research-console runtime files for this module.

## Risks

- If the research console shares the public report deployment, secrets and agent-only content can leak into the public site.
- If the CI remains coupled, unrelated workbench failures can block daily report verification or daily report changes can hide workbench regressions.
- If deployment is added before auth design, a local research tool becomes an unintended public app.
