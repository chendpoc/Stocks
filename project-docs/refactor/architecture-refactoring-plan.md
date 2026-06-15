# trader-workflows Architecture Refactoring Plan

> Date: 2026-06-16 | Status: proposed
>
> References:
> - `project-docs/refactor/nodejs-ecosystem-audit.md` — library migration recommendations
> - `project-docs/refactor/refactor-plan-review.md` — previous refactoring review
> - `project-docs/refactor/workflow-module-refactoring-plan.md` — executed refactoring (historical)

---

## 0. Issue Inventory — All Problems Discovered

This section aggregates every issue found across all review sessions, organized by category and resolution status.

### 0.1 Original Code Smells (from `workflow-module-refactoring-plan.md`)

| # | Problem | Severity | Status |
|---|---------|----------|--------|
| 1 | API encode/decode leaked to CLI layer (`index.ts` manually constructed bodies) | 🔴 | ✅ Resolved (P1.1-P1.4) |
| 2 | Fixed requests not encapsulated (9 `runtime.runGraph()` calls with bare strings) | 🔴 | ✅ Resolved (P1.3 graphRunner) |
| 3 | Oversized functions (`handleContextCommandAsync` 70 lines, 3-level nested switch) | 🟡 | ✅ Resolved (P2.2) |
| 4 | Type definitions scattered across service files (42%-55% type ratio) | 🟡 | ✅ Resolved (P0.2-P0.5) |
| 5 | Magic strings in 40+ locations (`"--symbol"` ×14, `"DecisionGraph"` ×3, etc.) | 🟡 | ✅ Resolved (P0.1) |
| 6 | No central type contract (cross-file import chain, no barrel export) | 🟡 | ✅ Resolved (P0.5) |

### 0.2 Review Gaps (from `refactor-plan-review.md`)

| # | Problem | Severity | Status | Commit |
|---|---------|----------|--------|--------|
| R1 | P4.1 incomplete: 8 graph files imported types from `services/` not `types/` | 🟡 | ✅ Fixed | `20c8f8d7` |
| R2 | `eval.ts` (lines 24-35) used manual `args.indexOf()` pattern | 🟡 | ✅ Fixed | `1b004a2a` |
| R3 | `outcomes.ts` (lines 50-58) used manual `args.indexOf()` pattern | 🟡 | ✅ Fixed | `1b004a2a` |
| R4 | `api/commands/` was 66-line dead indirection layer (2 thin re-exports) | 🟢 | ✅ Removed | `a1c1a6f1` |
| R5 | `context.ts` handler inconsistently used `api/commands/` for some calls, `services/` for others | 🟢 | ✅ Resolved (via R4) | `a1c1a6f1` |

### 0.3 Architecture Layer Issues (from `architecture-refactoring-plan.md` §1)

| # | Problem | Severity | Status |
|---|---------|----------|--------|
| A1 | `services/marketAgent.ts` is not domain logic — 12 HTTP proxy functions, zero business logic | 🔴 | ⬜ Pending (Phase C) |
| A2 | `alphaResearch.ts`, `outcomes/persistence.ts`, `outcomes/scheduling.ts` bypass `api/client.ts` | 🔴 | ⬜ Pending (Phase D) |
| A3 | Domain modules cross-call (`evaluation/` → `outcomes/` → `decisions.ts`) | 🟡 | ⬜ Pending (Phase F) |
| A4 | `api/graphRunner.ts` depends on orchestration layer (`runtime/`, `graphs/`) — inverted dependency | 🟡 | ⬜ Pending (Phase E) |

### 0.4 Ecosystem Modernization Gaps (from `nodejs-ecosystem-audit.md`)

| # | Problem | Severity | Status |
|---|---------|----------|--------|
| E1 | Hand-rolled `fetchIntel`/`fetchStage1` (77+94 lines) — no timeout/retry/interceptors | 🔴 | 🔄 In progress — B1+B2 done, B3 (marketAgent update) pending |
| E2 | `console.log`/`console.error` scattered — no levels, no structured output | 🟡 | ✅ Phase A complete (pino installed) |
| E3 | Bare `process.env` reads without defaults/validation (10+ locations) | 🟡 | ✅ Phase A complete (dotenv+env-var installed) |
| E4 | `cli/argParser.ts` 229 lines hand-written — commander already in trader-cli | 🟡 | ⬜ Pending (Phase G) |
| E5 | `bootstrap-env.js` 43 lines hand-written .env loading | 🟢 | ✅ Obsolete (replaced by dotenv) |

### 0.5 Pre-existing TypeScript Errors (not introduced by refactoring)

| File | Error Count | Type |
|------|------------|------|
| `cli/commandHandlers/context.ts` | 2 | TS2783 duplicate `snapshot_id` |
| `cli/commandHandlers/marketData.ts` | 2 | TS2322 index signature missing |
| `cli/commandHandlers/marketMonitor.ts` | 1 | TS2322 index signature missing |
| `cli/commandHandlers/memory.ts` | 1 | TS2322 index signature missing |
| `cli/helpers.ts` | 1 | TS2345 missing `symbol` property |
| `graphs/03-insightExploration/*.test.ts` | 18 | TS2322/TS2339 type mismatches in test mocks |
| `graphs/04-alphaResearch/*.test.ts` | 1 | TS2552 `RequestInfo` → `RequestInit` |
| `runtime/checkpointStore.ts` | 1 | TS2709 namespace as type |
| `runtime/stage1Runtime.test.ts` | 2 | TS2719/TS2339 type incompatibilities |
| `services/alphaResearch.test.ts` | 1 | TS2552 `RequestInfo` → `RequestInit` |
| `services/contextSnapshots.test.ts` | 2 | TS2322 mock return type mismatch |

> **Total: 32 pre-existing errors across 10 files.** None caused by refactoring.

---

## 1. Current Architecture Diagnosis

### 1.1 Layer Reality vs. Intended Design

```
Intended (Clean Architecture)           Actual (Current Code)
────────────────────────────            ─────────────────────
Orchestration: graphs/cli/runtime       ✅ Correct
    ↓ calls                                  ↓ calls
Domain: services/                       ⚠️ Mixed — contains HTTP proxies
    ↓ calls                                  ↓ calls
Data Proxy: (missing)                   ❌ Absent — domain modules call HTTP directly
    ↓ calls
API: api/                               ⚠️ Contains non-HTTP code (graphRunner)
```

### 1.2 Four Critical Structural Issues

| # | Issue | Severity | Files Affected | Lines |
|---|-------|----------|---------------|-------|
| 1 | `services/marketAgent.ts` is not domain logic — it's an HTTP data proxy | 🔴 High | 1 file | 250 |
| 2 | `alphaResearch.ts`, `outcomes/persistence.ts`, `outcomes/scheduling.ts` bypass `api/client.ts` for HTTP calls | 🔴 High | 3 files | ~80 |
| 3 | Domain modules call each other (`evaluation/` → `outcomes/` → `decisions.ts`) | 🟡 Medium | 3 modules | — |
| 4 | `api/graphRunner.ts` depends on orchestration layer (`runtime/`, `graphs/`) — inverted dependency | 🟡 Medium | 1 file | 82 |

#### Issue 1 Detail: marketAgent.ts (250 lines)

Every function follows the same pattern — HTTP call with no domain logic:

```
listDecisionOutcomes  → fetchStage1 GET  /decision-outcomes
listModelDecisions    → fetchStage1 GET  /model-decisions
runMarketMonitor      → fetchIntel   POST /market-monitor/run
fetchMarketData       → fetchIntel   GET  /market-data/fetch
bootstrapContext      → fetchIntel   POST /context/bootstrap
getLatestContext      → fetchIntel   GET  /context/latest
listInsightCandidates → fetchStage1 GET  /insight-candidates
listPatternMemories   → fetchIntel   GET  /pattern-memory
promotePatternMemory  → fetchIntel   POST /pattern-memory/promote
degradePatternMemory  → fetchIntel   POST /pattern-memory/degrade
listFailureMemories   → fetchIntel   GET  /failure-memory
initMarketAgentMemory → fetchIntel   POST /memory/init
```

**All 12 functions are thin HTTP wrappers — zero domain logic.** This is a Data Access Object, not a domain service.

#### Issue 2 Detail: HTTP Bypasses

| File | Bypass Method | HTTP Calls |
|------|--------------|------------|
| `services/alphaResearch.ts:47-79` | `fetch()` bare call | `fetchRuleCandidates` |
| `services/outcomes/persistence.ts:51` | `fetchIntel()` direct | 1 call |
| `services/outcomes/scheduling.ts:63-75, 106-118` | `fetchStage1()` + manual `URLSearchParams` | 2 calls |

These three files cannot benefit from centralized timeout/retry/error handling in `api/client.ts`.

#### Issue 3 Detail: Domain Cross-Calls

```
evaluation/report.ts
  → outcomes/scheduling.ts   (calls scheduleOutcomePolling)
  → outcomes/persistence.ts  (calls persistOutcomeResult)
  → decisions.ts             (calls persistModelDecision)
```

These cross-calls make unit testing harder and violate the principle that domain modules should be independently testable.

#### Issue 4 Detail: graphRunner Location

```
api/graphRunner.ts
  ├── imports from runtime/stage1Runtime.ts   ← orchestration layer
  ├── imports from constants/graphNames.ts    ← fine
  └── imports from graphs/00-decision/...     ← orchestration layer
```

`graphRunner` wraps `runtime.runGraph()` — this is orchestration infrastructure, not an HTTP API. It belongs in `runtime/` or a dedicated `orchestration/` module.

---

## 2. Target Architecture

```
src/
├── api/                              PURE HTTP LAYER
│   ├── client.ts                     fetchIntel, fetchStage1 (ky-based)
│   ├── queryBuilder.ts               delete — ky.searchParams replaces it
│   └── marketAgentClient.ts          NEW — 12 HTTP proxy functions moved from services/
│
├── data/                             DATA PROXY LAYER (new)
│   ├── marketAgent.ts                re-exports from api/marketAgentClient.ts, adds domain type mapping
│   └── ruleCandidates.ts             HTTP logic extracted from services/alphaResearch.ts
│
├── services/                         DOMAIN LAYER (independent modules)
│   ├── outcomes/
│   │   ├── scheduling.ts             remove fetchStage1 calls — take data as parameter
│   │   ├── persistence.ts            remove fetchIntel calls — take data as parameter
│   │   ├── labeling.ts               (unchanged — pure domain logic)
│   │   └── types.ts
│   ├── evaluation/
│   │   ├── metrics.ts                (unchanged)
│   │   ├── report.ts                 remove cross-calls to outcomes/ — take data as parameter
│   │   └── types.ts
│   ├── context/
│   │   ├── snapshots.ts              (unchanged)
│   │   ├── weighting.ts              (unchanged)
│   │   └── types.ts
│   ├── insight/
│   │   ├── candidates.ts             (unchanged)
│   │   ├── seeds.ts                  (unchanged)
│   │   └── types.ts
│   ├── decisions.ts                  remove fetchIntel — take data as parameter
│   ├── alphaResearch.ts              remove HTTP calls — delegate to data/ruleCandidates.ts
│   ├── candidateFamilies.ts
│   └── contextPackFile.ts
│
├── constants/                        (unchanged)
├── types/                            (unchanged)
├── llm/                              (unchanged)
│
├── orchestration/                    ORCHESTRATION LAYER (new, from api/graphRunner)
│   └── graphRunner.ts                moved from api/ — wraps runtime.runGraph()
│
├── runtime/                          RUNTIME INFRASTRUCTURE
│   ├── stage1Runtime.ts
│   ├── checkpointStore.ts
│   └── config.ts                     NEW — centralized env config with dotenv+env-var
│
├── cli/                              CLI LAYER
│   ├── argParser.ts                  to be replaced by commander
│   ├── router.ts
│   ├── commandHandlers/
│   ├── helpers.ts
│   └── logger.ts                     NEW — pino logger
│
├── graphs/                           GRAPH DEFINITIONS (unchanged)
│   ├── 00-decision/
│   ├── 01-outcome/
│   ├── 02-evaluation/
│   ├── 03-insightExploration/
│   └── 04-alphaResearch/
│
└── index.ts                          ENTRYPOINT (~56 lines, clean)
```

### Dependency Rules (enforced by architecture)

| Layer | Can Import From | Must Not Import From |
|-------|----------------|---------------------|
| `api/` | `constants/`, `types/`, `runtime/config.ts` | `services/`, `orchestration/`, `cli/`, `graphs/` |
| `data/` | `api/`, `types/` | `services/`, `orchestration/` |
| `services/` | `types/`, `constants/` | `api/`, `data/`, other `services/` modules |
| `orchestration/` | `runtime/`, `graphs/`, `constants/` | `cli/`, `api/` |
| `cli/` | `orchestration/`, `data/`, `runtime/`, `services/` | `api/` (goes through `data/`) |
| `runtime/` | `services/`, `types/` | `cli/`, `api/` |

---

## 3. Merged Modernization + Architecture Migration Plan

### Phase A: Configuration + Logging (zero behavior change, ~30 min)

| Step | Action | Replaces |
|------|--------|----------|
| A1 | `npm install ky dotenv env-var pino pino-pretty` | ✅ Done |
| A2 | Create `src/runtime/config.ts` with dotenv+env-var | `api/client.ts:1` bare `process.env` reads |
| A3 | Create `src/cli/logger.ts` with pino | Scattered `console.log`/`console.error` |
| A4 | Update `api/client.ts` to use `config.ts` instead of `process.env` | 1 line |

**Commit**: `feat(trader-workflows): add ky, dotenv, env-var, pino dependencies`

### Phase B: Replace HTTP Client with ky (internal change, ~1 hr)

| Step | Action | Deletes |
|------|--------|---------|
| B1 | Rewrite `api/client.ts` using ky (timeout, retry, error hooks) | 77 lines → ~30 lines |
| B2 | Delete `api/queryBuilder.ts` (ky.searchParams replaces it) | 11 lines |
| B3 | Update `services/marketAgent.ts` — use ky instance for all 12 functions | Replace `withQuery()` with ky searchParams |
| B4 | Verify all existing tests pass | — |

**Commit**: `feat(trader-workflows): replace hand-rolled fetch with ky`

### Phase C: Move marketAgent to api/ layer (structure only, ~30 min)

| Step | Action | Files |
|------|--------|-------|
| C1 | Move `services/marketAgent.ts` (250 lines) → `api/marketAgentClient.ts` | 1 move |
| C2 | Create `data/marketAgent.ts` as thin re-export with domain type mapping | ~15 lines new |
| C3 | Update all importers (cli/commandHandlers/*, outcomes/, evaluation/) | ~12 files |
| C4 | Verify compilation + tests | — |

**Commit**: `refactor(trader-workflows): move marketAgent HTTP proxy to api/ layer`

### Phase D: Extract HTTP from outcomes/ and alphaResearch (cleanup, ~1 hr)

| Step | Action | Deletes |
|------|--------|---------|
| D1 | Extract `fetchRuleCandidates` from `alphaResearch.ts` → `data/ruleCandidates.ts` | ~30 lines moved |
| D2 | Remove `fetchIntel`/`fetchStage1` calls from `outcomes/persistence.ts` and `outcomes/scheduling.ts` — inject data as parameters | ~20 lines removed |
| D3 | Update callers (`evaluation/report.ts`, `graph nodes`) to pass data | ~15 lines |
| D4 | Verify all tests pass | — |

**Commit**: `refactor(trader-workflows): extract HTTP calls from domain services`

### Phase E: Move graphRunner to orchestration/ (structure only, ~15 min)

| Step | Action | Files |
|------|--------|---------|
| E1 | Move `api/graphRunner.ts` (82 lines) → `orchestration/graphRunner.ts` | 1 move |
| E2 | Update all importers (cli/commandHandlers/*, graphs/*) | ~12 files |
| E3 | Verify compilation + tests | — |

**Commit**: `refactor(trader-workflows): move graphRunner from api/ to orchestration/`

### Phase F: Decouple domain module cross-calls (behavior change, ~2 hr)

| Step | Action |
|------|--------|
| F1 | In `evaluation/report.ts`: replace direct calls to `outcomes/scheduling.ts` and `decisions.ts` with parameter injection |
| F2 | Update `02-evaluation/evaluationGraph.nodes.ts` to orchestrate the calls that `report.ts` used to make |
| F3 | Verify evaluation graph output is identical |

**Commit**: `refactor(trader-workflows): decouple domain module cross-calls`

### Phase G: Replace CLI argParser with commander (optional, ~2 hr)

| Step | Action | Deletes |
|------|--------|---------|
| G1 | Define commander program with all 12 commands | ~80 lines new |
| G2 | Migrate `cli/router.ts` to commander action dispatch | ~20 lines |
| G3 | Delete `cli/argParser.ts` | 229 lines |
| G4 | Verify all CLI commands produce identical output | — |

---

## 4. Metrics Summary

| Phase | New | Modified | Deleted | Net Δ | Risk |
|-------|-----|----------|---------|-------|------|
| A (config + logging) | 60 | 1 | 0 | +61 | Low |
| B (ky HTTP) | 0 | 13 | 88 | -75 | Low |
| C (marketAgent move) | 15 | 12 | 250 | -223 | Medium |
| D (extract HTTP) | 30 | 5 | 50 | -15 | Medium |
| E (graphRunner move) | 0 | 12 | 82 | -70 | Low |
| F (decouple domains) | 5 | 4 | 10 | -1 | High |
| G (commander CLI) | 80 | 1 | 229 | -148 | Medium |
| **Total** | **190** | **48** | **709** | **-471** | |

---

## 5. Dependency Graph (Before → After)

```
BEFORE                                    AFTER
─────────────────────                     ─────────────────────
api/                                      api/
├── client.ts (fetch)                     ├── client.ts (ky-based)
├── queryBuilder.ts                       ├── marketAgentClient.ts (moved from services/)
└── graphRunner.ts ❌ (depends runtime)    └── queryBuilder.ts ❌ deleted

services/                                 data/ (new)
├── marketAgent.ts ❌ (HTTP proxy)        ├── marketAgent.ts (re-export)
├── outcomes/                             └── ruleCandidates.ts
│   ├── persistence.ts ❌ (fetchIntel)
│   └── scheduling.ts ❌ (fetchStage1)    services/ (pure domain)
├── evaluation/                           ├── outcomes/ (clean)
│   └── report.ts ❌ (calls outcomes)     ├── evaluation/ (no cross-calls)
├── alphaResearch.ts ❌ (fetch bare)      ├── alphaResearch.ts (no HTTP)
├── context/                              └── ...
└── ...

                                          orchestration/ (new)
                                          └── graphRunner.ts (from api/)
```

---

## 6. Migration Progress Tracker

### 6.1 Dependency Status

| Library | trader-workflows | trader-cli | Installed Version |
|---------|:---:|:---:|-------------------|
| `ky` | ✅ installed | ⬜ not installed | ^2.0.2 |
| `commander` | ⬜ not installed | ✅ installed | ^12.0.0 / ^13.x |
| `pino` | ✅ installed | ⬜ not installed | ^10.3.1 |
| `pino-pretty` | ✅ installed | ⬜ not installed | ^13.1.3 |
| `dotenv` | ✅ installed | ⬜ not installed | ^17.4.2 |
| `env-var` | ✅ installed | ⬜ not installed | ^7.5.0 |
| `zod` | ✅ installed | ✅ installed | ^3.23.0 |
| `chalk` | n/a | ✅ installed | ^5.3.0 |
| `madge` | ✅ devDep | n/a | ^8.0.0 |

### 6.2 Phase Execution Status

| Phase | Status | Commits |
|-------|--------|---------|
| A (config + logging) | ✅ completed | — |
| B (ky HTTP) | 🔄 in progress | B1+B2 done, B3 pending |
| C (marketAgent move) | ⬜ pending | — |
| D (extract HTTP from services) | ⬜ pending | — |
| E (graphRunner move) | ⬜ pending | — |
| F (decouple domains) | ⬜ pending | — |
| G (commander CLI) | 🔄 in progress | T035-S1 done, S2-S6 pending |

### 6.2.1 Phase A Deliverables

| Deliverable | trader-workflows | trader-cli |
|------------|:---:|:---:|
| `ky` installed (^2.0.2) | ✅ | ✅ |
| `dotenv` installed (^17.4.2) | ✅ | ✅ |
| `env-var` installed (^7.5.0) | ✅ | ✅ |
| `pino` installed (^10.3.1) | ✅ | ✅ |
| `pino-pretty` installed (^13.1.3) | ✅ | ✅ |
| `runtime/config.ts` (dotenv+env-var) | ✅ | ✅ `src/config.ts` |
| `cli/logger.ts` or `src/logger.ts` (pino) | ✅ | ✅ |
| `api/client.ts` uses config (not process.env) | ✅ | — |

### 6.2.2 Phase B Progress

| Step | Action | Status |
|------|--------|--------|
| B1 | Rewrite `api/client.ts` with ky (timeout, retry, error hooks) | ✅ Done |
| B2 | Delete `api/queryBuilder.ts` + `api/queryBuilder.test.ts` | ✅ Done |
| B3 | Update `services/marketAgent.ts` — replace `buildQuery`/`withQuery` with ky `searchParams` | ⬜ Pending |
| B4 | Verify all existing tests pass | ⬜ Pending |

### 6.3 Library Mapping (Modernization ↔ Architecture)

**Original below:**

| Library | Phase | Architecture Impact |
|---------|-------|-------------------|
| `ky` | Phase B | Enables clean `api/client.ts` with timeout/retry/hooks |
| `dotenv` + `env-var` | Phase A | Eliminates `api/client.ts:1` bare `process.env` |
| `pino` | Phase A | Replaces `console.log` across all layers |
| `commander` | Phase G | Replaces `cli/argParser.ts` 229 lines |
