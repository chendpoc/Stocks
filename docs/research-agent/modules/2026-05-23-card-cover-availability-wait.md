# Card Cover Availability Wait

## Goal

Prevent WeCom template-card pushes from referencing a summary-card cover image before the public site has deployed the new asset.

## Background

`daily:publish` generates a template-card cover PNG under `docs/assets/summary-cards/YYYY-MM-DD.png`, commits and pushes it, then sends the WeCom template card.

The card payload references a public URL such as:

```text
https://stocks-emw.pages.dev/assets/summary-cards/YYYY-MM-DD.png
```

Pushing to GitHub does not guarantee Cloudflare Pages has already deployed that asset. If WeCom fetches the card image before the asset is live, the card may render with a broken or stale cover.

## Contract

- Before sending a template card with a public cover URL, `daily:publish` must wait for the cover URL to return a successful HTTP response.
- The wait must run only for actual webhook sends, not dry runs.
- If `--skip-webhook` is used, do not wait.
- If `--skip-git-push` is used without `SUMMARY_CARD_IMAGE_URL`, keep the existing fail-fast behavior.
- The wait should be bounded and configurable through environment variables.
- The wait must not affect the base64 image push path.

## Boundaries

- JS publisher only.
- No Python summary logic changes.
- No Cloudflare API integration.
- No new secrets.
- No subagent.

## Test Plan

- RED：`daily-publish.mjs` must contain a bounded `waitForPublicUrl(...)`.
- RED：card send path must await cover availability before `sendWeWorkTemplateCard(...)`.
- GREEN：implement HTTP HEAD/GET retry with timeout and interval options.
- Run focused script contract test, `npm run test:summary`, and `npm run pages:build`.

## Verification

- RED: `node --test --test-name-pattern "public card cover" test\daily-summary-assets.test.mjs` failed because `daily-publish.mjs` did not wait for the public cover URL before sending the template card.
- GREEN: the same focused command passed after adding bounded `waitForPublicUrl(...)` and awaiting it before `sendWeWorkTemplateCard(...)`.
- Full relevant checks passed:
  - `npm run test:summary`
  - `npm run daily:publish:dry`
  - `npm run pages:build`
