# Research Workbench Fortress Visual Refactor

Date: 2026-05-24

## Purpose

Refactor the local React research console toward the Fortress Dashboard visual language.

The target is a light institutional finance admin surface: dark fixed sidebar, sticky topbar, dense metric strip, white cards with thin borders, blue primary accent, and compact research lists.

The first-screen task is fast opportunity-pool scanning. The selected row opens a research inspector for hypothesis, missing evidence, invalidation, and next checks. The Agent remains auxiliary.

## Boundaries

- Runtime surface: `apps/research-console`.
- Browser payload shape must remain bounded and sanitized.
- No new API routes, model calls, external data calls, or tool-policy bypasses.
- No public VitePress, Cloudflare, WeCom, daily summary, or GitHub Actions changes.
- Visible copy remains research-only.

## Files

- `apps/research-console/app/globals.css`
- `apps/research-console/components/ResearchWorkspace.tsx`
- `apps/research-console/components/OpportunityBoard.tsx`
- `apps/research-console/components/research/ResearchInspector.tsx`
- `apps/research-console/components/ScoreRows.tsx`
- `apps/research-console/components/AgentPanel.tsx`
- `test/daily-summary-assets.test.mjs`

## Tests

RED:

```powershell
node --test --test-name-pattern "Fortress visual refactor" test\daily-summary-assets.test.mjs
```

GREEN:

```powershell
node --test --test-name-pattern "Fortress visual refactor|opportunity board accessibility|AgentPanel exposes keyboard" test\daily-summary-assets.test.mjs
npm run console:build
```

Full visual release check after implementation:

```powershell
npm run console:lint
npm run console:build
npm run test:summary
git diff --check
```

## Agent Split

No subagent is required for Task 1. A later low-decision UI polishing pass may be delegated after the main agent verifies source boundaries.

## Risks

- The previous dark terminal UI can imply trade execution. The Fortress version should read as a controlled research/admin surface instead.
- Dense rows can become unreadable. The implementation must use stable row heights and clear status hierarchy.
- AgentPanel can dominate the page. The implementation must make it auxiliary.
