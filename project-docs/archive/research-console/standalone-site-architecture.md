# Research Console Standalone Site Architecture

Date: 2026-05-23

## Decision

The trading research workbench is a separate site from the public daily-summary site.

The current public site remains the VitePress report surface. The research workbench lives in `apps/research-console` and must not share the VitePress public deploy.

## Why

VitePress is a static publishing surface for daily reports, current-month history, card covers, and public links used by WeCom messages.

The research console is an application surface. It has mutable agent conversations, server-side market data tools, evidence logs, policy decisions, and future protected API access. Those concerns should not enter the public static build or the daily summary publisher.

## Runtime Boundaries

- Public report site: static, public, no research-console secrets, no agent state, no external market-data calls.
- Research console: `apps/research-console`, Next.js, server routes, local-first by default.
- Shared contracts: `packages/summary-core` for typed summary, opportunity, tool, and agent envelopes.
- Daily publisher: keeps generating reports and WeCom payloads through the existing scripts.

## Deployment Boundaries

The research console may later get a separate site such as `stocks-research.pages.dev`, but only as a protected deployment.

Minimum production requirements before shared hosting:

- Cloudflare Access or an equivalent protected deployment gate.
- `RESEARCH_CONSOLE_ACCESS_TOKEN` configured server-side.
- Browser requests must send `x-research-console-token` in production.
- No model, Longbridge, Alpha Vantage, news search, or webhook credentials in client bundles.
- External tools remain opt-in through `RESEARCH_ENABLE_EXTERNAL_TOOLS=1`.

## CI Boundaries

- `.github/workflows/deploy.yml` verifies only the public report build.
- `.github/workflows/research-console.yml` verifies only `apps/research-console` and shared packages.
- `daily:publish` must not build, deploy, or mutate the research console.
- Research console checks must not publish public pages or trigger WeCom delivery.

## First Development Stage

Keep the research console local-first and verified:

1. Run `npm run console:dev` for local use.
2. Run `npm run console:lint` and `npm run console:build` before integration.
3. Keep module-level development docs under `project-docs/research-agent/modules/`.
4. Keep public build audits focused on preventing research content from leaking into the report site.

## Non-Goals

- No public research-console deployment in this stage.
- No shared auth with the VitePress report site.
- No migration of the daily report site into Next.js.
- No direct trading instruction output; opportunity analysis remains research-only.
