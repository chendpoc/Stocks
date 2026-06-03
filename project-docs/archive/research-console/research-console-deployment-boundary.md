# Research Console Deployment Boundary

Date: 2026-05-23

## Decision

The trading research workbench requires a separate deployment from the public daily-report site.

The existing `stocks-emw.pages.dev` surface stays dedicated to VitePress daily reports, current-month history, card covers, and WeCom public links. The research console should use a separate protected surface, such as `stocks-research.pages.dev`, only after an authentication and secret-handling design is complete.

## Why

The public report site and the research console have different security and runtime models.

- VitePress public deploy: static pages, public summaries, no agent state, no market-data credentials, no server-side research APIs.
- Research console: Next.js application, mutable conversations, tool traces, evidence logs, server routes, optional external market-data tools, and future model-backed agent calls.

Sharing the same public deploy would increase blast radius. A report-site build should not ship workbench routes, and a workbench build should not decide whether daily public summaries or WeCom links are valid.

## Deployment Contract

The research console must not reuse the VitePress public deploy.

Required separation:

- Public report deploy: `stocks-emw.pages.dev`, `docs/.vitepress/dist`, VitePress build, no research-console runtime.
- Research console deploy: separate deployment, separate project name, separate environment variable scope, protected by Cloudflare Access or equivalent.
- CI: `Verify VitePress site` stays scoped to `docs/**`; `Verify Research Console` stays scoped to `apps/research-console/**` and `packages/**`.
- Publish path: `daily:publish` must not build, deploy, or mutate the research console.

## Required Protection Before Hosting

A shared or remote research console deployment is not allowed until these controls exist:

- Cloudflare Access or equivalent protected entry point.
- Server-side `RESEARCH_CONSOLE_ACCESS_TOKEN`.
- Production browser requests must send `x-research-console-token`.
- Server-side-only model, Longbridge, Alpha Vantage, news, and webhook credentials.
- External tools remain opt-in through `RESEARCH_ENABLE_EXTERNAL_TOOLS=1`.
- Evidence logs stay bounded and sanitized before any browser exposure.

## Local Development

Use the local app until the protected deployment is designed:

```powershell
npm run console:dev
npm run console:build
```

Use the public report commands only for the daily summary site:

```powershell
npm run pages:build
npm run daily:publish
```

## Non-Goals

- No public research-console deployment in this step.
- No migration of the VitePress report site to Next.js.
- No shared Cloudflare project for reports and research tooling.
- No new production secrets.
