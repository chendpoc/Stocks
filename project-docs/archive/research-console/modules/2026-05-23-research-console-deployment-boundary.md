# Research Console Deployment Boundary

Date: 2026-05-23

## Purpose

Turn the standalone-site architecture decision into an explicit deployment contract.

The research console is an application workbench. It must not be deployed through the VitePress public report site or the daily summary publishing path.

## Boundaries

- Document only in this module.
- Do not add a public research-console deployment yet.
- Do not modify `daily:publish`, WeCom delivery, VitePress routing, or Cloudflare Pages public report settings.
- Do not introduce new secrets or environment variables in this module.

## Files

- `project-docs/research-agent/research-console-deployment-boundary.md`
- `project-docs/research-agent/modules/2026-05-23-research-console-deployment-boundary.md`
- `project-docs/plans/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`
- `test/daily-summary-assets.test.mjs`

## Tests

Red:

```powershell
node --test --test-name-pattern "deployment boundary document" test\daily-summary-assets.test.mjs
```

Green:

```powershell
node --test --test-name-pattern "deployment boundary document" test\daily-summary-assets.test.mjs
```

Full gate:

```powershell
npm run test:summary
npm run console:build
npm run pages:build
```

Review fix:

- The boundary test must not only scan this document for keywords.
- It also checks that `pages:build` and `daily:publish` do not call `console:*`, the VitePress workflow does not include `apps/research-console`, the research-console workflow does not deploy `stocks-emw`, and the Cloudflare deploy helper still targets `docs/.vitepress/dist`.

## Agent Split

- Low-decision explorer task: audit whether existing docs or workflows contradict the separate deployment boundary.
- Main-agent responsibility: own the deployment decision, write the RED test, write the boundary contract, and run verification.

## Risks

- If the research console reuses the public report deployment, agent state and server-side tool assumptions can leak into a public static surface.
- If public report CI and research-console CI are coupled, unrelated workbench failures can block daily report verification.
- If hosting is enabled before auth design, a local research tool becomes an unintended public app.
