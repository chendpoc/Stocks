# PRD | Codex Agent | Review And Learning Records | v1.0

Date: 2026-05-23

## Summary

This PRD defines Phase 5 review and learning records for the trading research workbench.

The goal is to turn opportunity observations into a local review archive: what was observed, what later happened, why the observation worked or failed, and what should be remembered for future research. This is a local-first feature and must remain separate from public daily summaries.

This is a Codex-agent task because it introduces durable local data, update APIs, search/index behavior, and privacy boundaries.

## Product Context

Authoritative planning docs:

- `docs/research-agent/trading-workbench-master-plan.md`
- `docs/research-agent/modules/2026-05-23-summary-to-opportunity-board.md`
- `docs/research-agent/modules/2026-05-23-codex-agent-research-flow-prd.md`

Phase 1 and Phase 2 create an inspectable opportunity object. Phase 3 and Phase 4 add evidence and agent research flow. Phase 5 records what happened after the observation.

## User Value

The user should be able to answer:

- Which opportunity observations were worth attention?
- Which ones failed, and why?
- Which admin-theory patterns repeated?
- Which evidence types were most useful or missing?
- What should future agents avoid over-weighting?

## Global Constraints

- Runtime surface: `apps/research-console`.
- Shared type surface: `packages/summary-core`.
- Local data surface: a new local-only review archive under `data/research/` or `.cache/research-agent/`, chosen during implementation and documented.
- Test surface: `test/daily-summary-assets.test.mjs` plus focused tests if new data helpers are created.
- Do not publish review records to VitePress or `stocks-emw.pages.dev`.
- Do not modify daily summary generation, `daily:publish`, WeCom delivery, Cloudflare public deployment, GitHub Actions publishing, or notification scripts.
- Do not store secrets, headers, raw provider payloads, raw Markdown, raw structured JSON, prompts, or absolute local paths in browser payloads.
- All copy remains research-only and post-hoc review oriented.

## In Scope

- Define a review-record type.
- Add local create/read/update helpers.
- Add an API route guarded by existing `api-auth`.
- Add a small UI section for selected opportunity review status.
- Add local search/filter by day, symbol, status, and failure mode.
- Add tests for storage boundary and browser payload boundary.

## Out Of Scope

- Public deployment.
- Collaboration or multi-user auth.
- Automated performance attribution.
- Brokerage integration.
- Trading journal export.
- Scheduled review reminders.
- Model-generated final verdicts.

## Proposed Review Record Contract

A review record should contain:

- `record_id`
- `source_day`
- `symbol`
- `source_summary_path`
- `source_opportunity_ref`
- `created_at`
- `updated_at`
- `status`: `watching`, `validated`, `invalidated`, `stale`, or `archived`
- `observed_result`
- `failure_mode`
- `evidence_used`
- `admin_theory_tags`
- `learning_notes`
- `next_review_at`
- `research_boundary`

Browser-facing records must use workspace-relative paths and bounded text only.

## Functional Requirements

### FR1: Local Review Storage

Review records must be stored locally and durably.

Acceptance criteria:

- Storage path is documented.
- File format is append-friendly or update-safe.
- Writes are deterministic and do not require external services.
- Records are not included in public VitePress builds.

### FR2: Review API Boundary

The workbench needs local API routes to list and update review records.

Acceptance criteria:

- Production routes use `api-auth`.
- API validates day and symbol inputs.
- API returns sanitized records only.
- API does not expose raw source Markdown, raw JSON, absolute paths, prompts, headers, or secrets.

### FR3: Research Inspector Review Section

The selected Research Inspector should show review status without turning into a trading journal.

Acceptance criteria:

- Empty state says no review record exists.
- Existing record shows status, observed result, failure mode, learning notes, and next review date.
- User can mark a record as watching, validated, invalidated, stale, or archived.
- UI copy stays post-hoc and research-only.

### FR4: Searchable Local Review Index

The workbench should list prior review records.

Acceptance criteria:

- Filter by source day, symbol, status, and failure mode.
- Result rows include bounded summary fields only.
- Search does not scan public docs or daily summary content directly in the browser.

### FR5: Boundary Tests

Tests must protect privacy and public-site separation.

Acceptance criteria:

- Review records are not referenced by VitePress config or public build scripts.
- API routes use `api-auth`.
- Browser payloads do not contain raw local source data or absolute paths.
- Storage helpers reject or sanitize secret-shaped fields.

## Target Files

Expected implementation surfaces:

- `packages/summary-core/src/index.ts`
- `apps/research-console/lib/review-records.ts`
- `apps/research-console/app/api/research/reviews/route.ts`
- `apps/research-console/components/research/ResearchInspector.tsx`
- Optional: `apps/research-console/components/ReviewRecordsPanel.tsx`
- Optional: `apps/research-console/components/ReviewRecordEditor.tsx`
- `apps/research-console/app/globals.css`
- `test/daily-summary-assets.test.mjs`

Expected documentation surfaces:

- `docs/research-agent/tooling.md`
- This PRD.

## Suggested Codex-Agent Task Split

### Task 1: Review Record Contract And Storage Tests

Add shared types and failing tests for create/read/sanitize behavior.

### Task 2: Local Storage Helper

Implement deterministic local storage with path containment and sanitized payloads.

### Task 3: Review API Route

Add guarded list/update API route with input validation and boundary tests.

### Task 4: Detail UI Integration

Render review state in `ResearchInspector` or a nearby focused component. Keep editing minimal.

### Task 5: Review List Panel

Add a local list/search panel only after create/read/update behavior is stable.

## Codex Agent Prompt

```text
Implement the next task from docs/research-agent/modules/2026-05-23-codex-review-learning-records-prd.md.

Start by reading the PRD, docs/research-agent/trading-workbench-master-plan.md, apps/research-console/components/research/ResearchInspector.tsx, apps/research-console/app/api/research/opportunities/route.ts, apps/research-console/lib/opportunity-board.ts, and packages/summary-core/src/index.ts.

Hard boundaries:
- Do not modify daily summary generation, daily:publish, WeCom delivery, Cloudflare public deployment, VitePress routing, GitHub Actions publishing, or notification scripts.
- Do not publish review records to docs, VitePress, or stocks-emw.pages.dev.
- Do not call external market-data tools or model providers in this module.
- Do not expose raw Markdown, raw JSON, absolute local paths, prompts, headers, environment variables, credentials, or provider raw payloads to browser-facing code.
- Keep all visible copy research-only and post-hoc review oriented. Do not add buy/sell, long/short, entry/exit, target price, stop loss, position sizing, or order language.

Required verification:
- npm run console:lint
- npm run console:build
- npm run test:summary
- git diff --check

Return changed files, commands run, failed command output if any, and a boundary-risk note.
```

## Review Checklist For Main Agent

- Did the patch keep review records local-only?
- Did it avoid public VitePress and Cloudflare deploy surfaces?
- Did the API use the shared auth guard?
- Did browser payloads remain sanitized and bounded?
- Did UI copy avoid transaction instructions?
- Did storage helpers sanitize secret-shaped input?

## Risks

- Review records can become a hidden trading journal. Keep language framed as research evaluation.
- Local storage can leak absolute paths if helper functions return filesystem paths directly.
- Search can become expensive if it scans all historical documents. Search review records only.
- Status labels can overfit one result. Keep failure modes explicit and updateable.
