# Dynamic Research Session PRD

Date: 2026-05-23

Owner lane: Codex Agent

## Purpose

Convert `apps/research-console` from a static collection of daily-summary panels into a Research Session driven workbench.

The session is the local-first product object that binds one selected day to summary context, opportunity observations, evidence runs, agent analyses, and review records. This creates a stable workflow:

```text
select day -> load context -> generate opportunities -> attach evidence -> interpret market -> review outcome
```

## Product Behavior

- A user selects a date and receives one `ResearchSession` for that day.
- The session shows whether structured summary, opportunity observation, and local Markdown context exist.
- The workbench layout is a three-column research cockpit:
  - left: session navigation, status, data-source readiness
  - middle: overview, opportunities, evidence, market interpretation, review records
  - right: context-bound research agent
- Evidence tool results are persisted into the session, including blocked runs.
- Review records are persisted into the session and tied to an opportunity.
- Market interpretation reads session context and persisted evidence. It does not auto-call external tools.

## Boundaries

- Storage is local JSON only: `.cache/research-sessions/YYYY-MM-DD/session.json`.
- This module must not touch daily summary generation, WeCom notification, VitePress public build, Cloudflare deploy, or GitHub Actions.
- Browser payloads may include bounded summaries, counts, statuses, relative refs, and sanitized evidence.
- Browser payloads must not include raw Markdown, raw structured JSON, absolute local paths, request headers, environment variables, provider raw payloads, model prompts, or credentials.
- All outputs remain research-only and must not contain buy, sell, long, short, entry, exit, target, stop, or order instructions.
- External tools remain disabled by default and must pass `authorizeResearchTool(...)` before execution.

## Public Interfaces

Shared types in `packages/summary-core`:

- `ResearchSession`
- `ResearchOpportunity`
- `EvidenceRun`
- `ReviewRecord`
- `MarketInterpretation`
- `SessionStatus`

Server APIs in `apps/research-console/app/api/research`:

- `GET /api/research/session?day=YYYY-MM-DD`
- `POST /api/research/session`
- `PATCH /api/research/session`
- `POST /api/research/review-record`
- `POST /api/research/market-interpretation`

Service layer:

- `apps/research-console/lib/research-session.ts`
- `loadResearchSession(day)`
- `saveResearchSession(session)`
- `patchResearchSession(day, patch)`
- `appendEvidenceRun(day, input)`
- `appendReviewRecord(day, input)`
- `buildMarketInterpretation(day)`

## Files

Implementation surfaces:

- `packages/summary-core/src/index.ts`
- `apps/research-console/lib/research-session.ts`
- `apps/research-console/app/api/research/session/route.ts`
- `apps/research-console/app/api/research/evidence/route.ts`
- `apps/research-console/app/api/research/review-record/route.ts`
- `apps/research-console/app/api/research/market-interpretation/route.ts`
- `apps/research-console/components/ResearchWorkspace.tsx`
- `apps/research-console/components/OpportunityBoard.tsx`
- `apps/research-console/app/globals.css`

Test surfaces:

- `test/daily-summary-assets.test.mjs`
- `test/market-data-sources.test.mjs` only if tool readiness or policy behavior changes

## Acceptance Criteria

- A session can be created from fixture summary context.
- Session opportunities include the selected day, symbols, source motive, hypothesis, trigger conditions, invalidation conditions, evidence needs, score, and lifecycle status.
- Evidence runs can be appended and persisted without exposing raw provider payloads.
- Review records can be appended and persisted by opportunity id.
- Market interpretation returns the fixed sections: market state, main line, symbol readings, supporting evidence, contradicting risks, next watch, and `researchOnly: true`.
- The cockpit UI contains the three-column shell and tabs for overview, opportunities, evidence, market interpretation, and review records.
- Public VitePress build remains outside this module.

## Verification

Focused red/green tests:

```bash
node --test --test-name-pattern "research session|market interpretation" test/daily-summary-assets.test.mjs
```

Full local verification:

```bash
npm run console:lint
npm run console:build
npm run test:summary
git diff --check
```

## Agent Split

Codex Agent owns:

- shared session contracts
- server APIs
- local JSON persistence
- evidence persistence
- market interpretation contract
- privacy and trading-instruction boundary tests

Cursor can own follow-up UI modules:

- cockpit visual refinement
- tab empty states
- evidence timeline polish
- review form accessibility
- responsive layout polish

Main agent must review:

- browser payload shape
- local-only storage boundary
- API auth guard
- public/private deployment separation
- research-only language boundary

## Risks

- Scope creep into public daily-summary systems. Mitigation: keep all writes inside `apps/research-console`, `packages/summary-core`, `.cache`, and module docs.
- Browser leakage of local paths or raw provider data. Mitigation: bounded text sanitization and tests.
- External tools executed accidentally. Mitigation: policy guard remains mandatory and blocked runs are first-class evidence state.
- UI density becomes unreadable. Mitigation: three-column cockpit with compact cards, tables, timelines, and explicit empty states.
- Users may interpret research output as instructions. Mitigation: research-only copy and banned trading-action language in agent contracts.
