# Git Integration Plan

Date: 2026-05-23

Purpose: define the safe path from the current dirty local integration state to a pushed `main` that can be production-verified.

## Current State

`npm run integration:status -- --json` reports:

- local working tree has many changed entries,
- local HEAD is behind origin/main by 1 commit,
- local branch is not diverged,
- remote and local dirty changes overlap at `docs/search_index.json`.

The remote commit is an automated daily publish update for 2026-05-22. It changes public daily-report assets and public site content:

- `docs/assets/summary-cards/2026-05-22.png`
- `docs/assets/summary-images/2026-05-22-daily-summary.png`
- `docs/index.md`
- `docs/search_index.json`
- `docs/summaries/2026-05/2026-05-22-每日总结.md`

## Strategy

Treat `docs/search_index.json` as a generated artifact.

Do not hand edit docs/search_index.json during conflict resolution. Its final content should come from the project search-index generation path and the public/current-month build rules, not from manually combining JSON lines.

Preserve remote daily publish artifacts. They are production output from the scheduled publish path and should not be discarded while integrating local tooling changes.

## Recommended Order

1. Preserve the current local work before any branch movement.
2. Bring in the one remote daily-publish commit from `origin/main`.
3. Keep the remote 2026-05-22 public artifacts.
4. Regenerate search index output through the summary/search-index generation path so `docs/search_index.json` reflects the final merged tree.
5. Run:

```powershell
npm run release:check
```

6. Commit and push only after the release gate passes.
7. After push, run:

```powershell
npm run release:verify -- --date YYYY-MM-DD
```

8. Verify WeCom delivery through a real scheduled or intentional publish run.

## Completion Rule

Do not mark complete until:

- local work is committed,
- local `HEAD` matches the remote `refs/heads/main`,
- GitHub Actions `Daily Summary Publish` succeeds on the pushed commit,
- Cloudflare Pages is reachable,
- WeCom card and image delivery is verified,
- agent cleanup is confirmed.
