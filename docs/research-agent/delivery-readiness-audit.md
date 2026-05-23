# Delivery Readiness Audit

Date: 2026-05-23

Purpose: record what is currently shippable, what is local-only, and which verification command proves each operational surface.

## Summary

The daily report pipeline is usable, but the repository is still in an integration-heavy state. The production path is the GitHub Actions daily publisher plus the Cloudflare/VitePress public site. The React research console is a local research workbench, not a public production app yet.

Before pushing an integration branch, run:

```powershell
npm run release:check
```

This command is implemented in JS and runs the core local gates without committing, pushing, sending webhooks, or deploying.

After pushing, run:

```powershell
npm run release:verify -- --date YYYY-MM-DD
```

This command is also JS and read-only. It proves the pushed `main` commit matches the latest successful `Daily Summary Publish` run and that the public Cloudflare site is reachable.

## Daily Summary Pipeline

Status: usable with configured secrets.

What exists:

- `npm run daily:publish` generates the daily summary, card cover, long image, commits public assets, pushes the current branch, and sends WeCom messages.
- `npm run daily:publish:dry` validates the rendering and payload path without network side effects.
- `.github/workflows/daily-publish.yml` runs on GitHub Actions at `30 0 * * *`, which is 08:30 Asia/Shanghai.
- Required GitHub Secrets: `WHOP_HEADERS_JSON`, `MODEL_KEY_JSON`, `WEWORK_WEBHOOK_URL`.
- Optional GitHub Secret: `SUMMARY_DEPLOY_HOOK_URL` for explicit public-site deployment before webhook delivery.

Evidence:

- `npm run release:check`
- `npm run daily:publish:dry`
- `npm run test:summary`
- `node --test --test-name-pattern "GitHub Actions schedules daily publish" test\daily-summary-assets.test.mjs`

Remaining boundary:

- A real production run still depends on valid GitHub Secrets and external API availability.
- The workflow pushes generated content; the repo must keep `contents: write`.

## WeCom Notification

Status: usable.

What exists:

- `notify:text` remains available for text summaries.
- `notify:card` sends a template card.
- `daily:publish` sends both the template card and image payload path.
- The image path uses `base64 + md5`; card cover delivery waits for the public cover URL before sending.
- The optional deploy hook can reduce race conditions between git publish and public asset availability.

Evidence:

- `npm run release:check`
- `npm run notify:text:dry`
- `npm run notify:card:dry`
- `npm run daily:publish:dry`
- `npm run test:summary`

Remaining boundary:

- WeCom delivery is still externally dependent on webhook availability and robot limits.
- The public card cover URL must be reachable from WeCom clients.

## Cloudflare Public Site

Status: usable for the current-month public archive.

What exists:

- `npm run pages:build` builds the VitePress site through the pnpm workspace wrapper.
- `npm run pages:deploy:dry` builds locally and prints the Cloudflare Pages deploy plan.
- `npm run public:build:audit` scans the generated public dist and fails if local-only research, agent, opportunity, raw chat, or old-month summary content leaks into Cloudflare output.
- `scripts/deploy-cloudflare-pages.mjs` uses `scripts/pnpm-workspace.mjs run docs:build`, so it does not require a globally installed `pnpm.cmd`.
- Public build excludes local research docs and audit-only records.
- Public history is intentionally limited to current-month daily summaries.

Evidence:

- `npm run release:check`
- `npm run pages:build`
- `npm run pages:deploy:dry`
- `npm run public:build:audit`
- `node --test --test-name-pattern "cloudflare deploy helper builds" test\daily-summary-assets.test.mjs`

Remaining boundary:

- Actual Cloudflare deploy still requires Wrangler authentication or Cloudflare Pages integration.
- The public site is static; it should not receive research-console secrets.

## Local Research Console

Status: local-only prototype/workbench with working build checks.

What exists:

- `apps/research-console` is a Next.js app inside the pnpm workspace.
- `npm run console:dev` starts the local research UI.
- `npm run console:build` verifies the Next.js app builds.
- The UI includes an opportunity board, floating agent panel, evidence detail panel, run history, data-source readiness, and research-plan status.
- Production API routes use the shared `RESEARCH_CONSOLE_ACCESS_TOKEN` guard.

Evidence:

- `npm run release:check`
- `npm run console:lint`
- `npm run console:build`
- `npm run test:summary`

Remaining boundary:

- This is not yet a deployed product surface.
- It is intentionally local-only until complete hosting, access control, secret rotation, and data retention rules are explicitly designed.

## Agent Tooling And External Data

Status: implemented behind explicit opt-in gates.

What exists:

- Local deterministic agent planning is available without external network calls.
- `score_opportunities` is local and non-actionable.
- `news_search`, `alpha_vantage_quote`, `longbridge_quote`, `yfinance_quote`, and `yfinance_history` are policy-gated.
- Runtime external tools require `RESEARCH_ENABLE_EXTERNAL_TOOLS=1`.
- Tool outputs are sanitized and cached under `.cache/research-tools/...` or `.cache/research-agent/...`.
- Model-backed planning uses the same structured context sections and evidence-needs contract.

Evidence:

- `npm run release:check`
- `npm run test:summary`
- `node --test test\opportunity-reasoning.test.mjs`
- `node --test test\market-data-sources.test.mjs`

Remaining boundary:

- External market data quality depends on each provider and configured credentials.
- The tool outputs are research observations only and must not be rendered as buy/sell instructions.
- The workbench needs a separate deployment/security design before any public or shared hosting.

## Current Decision

Do not mark the broader project goal complete yet.

Reason:

- The production daily-report path is close to usable and has automated verification.
- The research console is intentionally local-only and not yet deployed.
- The working tree is large and should be integrated carefully before pushing or merging.

Next highest-value work:

1. Run one clean end-to-end GitHub Actions publish after secrets and optional deploy hook are configured.
2. Verify the public Cloudflare URL displays the latest summary and current-month archive after that run.
3. Decide whether the research console remains local-only or gets a separate protected deployment plan.
