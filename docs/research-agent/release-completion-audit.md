# Release Completion Audit

Date: 2026-05-23

Purpose: define the evidence required before the broader daily-report and research-workbench goal can be marked complete.

Operational checklist: `docs/research-agent/integration-handoff-checklist.md`.

## Current State

- Local branch: `main`
- Current local `HEAD`: `89ad09072d2a2885b00c12f0f696ebcfd0d3cb80`
- Current local `origin/main`: `3c006ff7d2f63eb913b695854cc7745eb7ef50d4`
- Current local `HEAD` does not match `origin/main`.
- Latest observed successful GitHub Actions run: `Daily Summary Publish` run `26273282270`
- Latest observed successful run head SHA: `89ad09072d2a2885b00c12f0f696ebcfd0d3cb80`
- Local working tree: not clean; many integration files remain modified or untracked.

## Completion Requirements

The goal is complete only when all of these are true:

1. Local release gate passes on the current worktree.
   Evidence: `npm run release:check`.
2. Public build output does not expose local-only research, agent, opportunity, raw chat, or old-month summary content.
   Evidence: `npm run public:build:audit`.
3. The current worktree is committed to `main` and pushed to GitHub.
   Evidence: `git status --short` is clean, `git rev-parse HEAD` matches `origin/main`, and `git ls-remote origin refs/heads/main` matches local `HEAD`.
4. GitHub Actions `Daily Summary Publish` succeeds on that pushed commit.
   Evidence: `npm run release:verify` confirms the successful run `headSha` equals the pushed commit SHA.
5. Cloudflare Pages serves the public VitePress site after that commit.
   Evidence: `npm run release:verify -- --date YYYY-MM-DD` confirms `https://stocks-emw.pages.dev/` returns HTTP 200 and the daily summary page is reachable.
6. WeCom delivery path is verified after the public cover asset is available.
   Evidence: either a successful real daily publish run or an intentional manual publish run after the public site deploy.
7. The React research console remains local-only unless a separate protected deployment plan is created.
   Evidence: public VitePress build excludes `research-agent`, `superpowers`, and local opportunity-only docs.

## Current Verdict

Not complete yet.

Reason: the local release gate passes, but the dirty worktree has not been committed, local `HEAD` does not match `origin/main`, and the current work has not been verified by GitHub Actions and Cloudflare Pages.

## Next Release Step

When Git mutation is explicitly approved:

```powershell
npm run release:check
git add --all
git commit -m "feat: integrate daily publish and research console workflow"
git push origin main
```

After push, verify:

```powershell
npm run release:verify -- --date YYYY-MM-DD
```
