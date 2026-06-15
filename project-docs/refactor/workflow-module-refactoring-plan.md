# Workflow Module Refactoring Plan

> Status: proposed | Date: 2026-06-15 | Author: AI Agent (deepseek-v4-pro)
>
> References:
> - `UBIQUITOUS_LANGUAGE.md` — canonical terms for workflow, graph, evidence, candidate
> - `project-docs/adr/0001-langgraph-minimal-stage1.md` — Stage 1 runtime architecture decision
> - `apps/trader-workflows/ARCHITECTURE.md` — current workflow architecture

---

## Problem Statement

The `apps/trader-workflows` module has accumulated structural debt across 6 dimensions:

### 1. API Encode/Decode Leaked To CLI Layer

`index.ts` (1245 lines) manually constructs request bodies and parses CLI flags in command handler functions. URL parameter encoding (`URLSearchParams.set(...)`) is duplicated across 8+ service functions in `services/marketAgent.ts`. The `api/client.ts` module is the only clean layer — everything above it repeats serialization logic.

### 2. Fixed Requests Not Encapsulated

9 graph-execution calls follow the identical pattern `runtime.runGraph({ graph_name: "...", input: {...} })` across 6 handler functions, with manual input assembly each time. List/query calls like `listDecisionOutcomes({ symbol, status, limit })` expose raw parameter objects without typed convenience wrappers.

### 3. Oversized Functions With Mixed Concerns

| Function | Lines | Concerns Mixed |
|---|---|---|
| `handleContextCommandAsync` | ~70 | 3-level nested switch (context → subcommand → snapshots sub-subcommand) |
| `handleDecideCommandAsync` | ~60 | arg parsing + body assembly + graph dispatch + result decode |
| `handleRunsCommandAsync` | ~100 | 5 subcommand cases each with duplicated `runId` validation |

### 4. Type Definitions Scattered Across Service Files

| File | Total Lines | Type/Interface Lines | Type Ratio |
|---|---|---|---|
| `services/marketAgent.ts` | 425 | 178 | **42%** |
| `services/alphaResearch.ts` | 266 | 146 | **55%** |
| `services/contextSnapshots.ts` | 675 | ~270 | ~40% |
| `services/evaluation.ts` | 762 | ~230 | ~30% |
| `services/insightCandidates.ts` | 567 | ~200 | ~35% |
| `services/outcomes.ts` | 894 | ~310 | ~35% |
| `index.ts` | 1245 | 25 (inline) | 2% |

Types live beside business logic, forcing every consumer to import the entire service module. Cross-file type dependencies form a deep chain: `decisions.ts → outcomes.ts → evaluation.ts → insightCandidates.ts → contextSnapshots.ts`.

### 5. Magic Strings In 40+ Locations

| String | Occurrences | Current Location |
|---|---|---|
| `"--symbol"` | 14 | 12 handler functions |
| `"--limit"` | 11 | 11 handler functions |
| `"--status"` | 6 | 6 handler functions |
| `"DecisionGraph"` | 3 | `index.ts`, `WORKFLOW_RESUME_HANDLERS` |
| `"SYMBOL_REQUIRED"` | 7 | 7 error throws |
| `"RUN_ID_REQUIRED"` | 3 | `handleRunsCommandAsync` |
| `"/market-agent/"` | 12 | `services/marketAgent.ts` |

Every flag name, error code, graph name, and API path prefix is a bare string literal.

### 6. No Central Type Contract

`import type { DecisionOutcomeRow } from "../services/outcomes.js"` crosses 4 files. Changing one interface forces cascading type-check rebuilds across the import graph. No barrel export, no single source of truth for shared types.

---

## Solution

Reorganize the module into a layered architecture with clear seams between:

```
src/
├── index.ts            (~50 lines — pure entrypoint: exports + CLI bootstrap)
├── constants/          (NEW — extracted magic strings)
│   ├── cliFlags.ts          --flag-name constants
│   ├── graphNames.ts        --graph name constants
│   ├── errorCodes.ts        --error code constants
│   └── apiPaths.ts          --API path prefix constants
├── types/              (NEW — centralized type contracts)
│   ├── index.ts             --barrel re-export
│   ├── cli.ts               --WorkflowEnvelope, WorkflowError
│   ├── marketAgent.ts       --all market-agent service types
│   ├── outcomes.ts          --DecisionOutcomeRow, outcome types
│   ├── evaluation.ts        --EvaluationOutcomeRow, report types
│   ├── context.ts           --ContextSnapshot, weighted item types
│   ├── insight.ts           --InsightCandidate, alpha seed types
│   └── decisions.ts         --ModelDecision, outcome horizon types
├── api/                (EXPANDED — request construction + graph dispatch)
│   ├── client.ts            --(unchanged) fetchIntel / fetchStage1
│   ├── queryBuilder.ts      --(NEW) typed URLSearchParams builder
│   ├── graphRunner.ts       --(NEW) typed graph execution wrapper
│   └── commands/            --(NEW) one file per API domain
│       ├── marketAgent.ts
│       ├── decisions.ts
│       └── ...
├── cli/                (NEW — CLI concern separation)
│   ├── argParser.ts         --all flag parsing functions
│   ├── router.ts            --handleCommandAsync routing table
│   └── commandHandlers/     --one file per top-level command
│       ├── memory.ts
│       ├── runs.ts
│       ├── decide.ts
│       ├── outcomes.ts
│       ├── decisions.ts
│       ├── eval.ts
│       ├── insights.ts
│       ├── context.ts
│       ├── marketMonitor.ts
│       ├── marketData.ts
│       ├── patternMemory.ts
│       └── failureMemory.ts
├── services/           (SPLIT — large files become directories)
│   ├── marketAgent.ts       (~250 lines after type extraction)
│   ├── outcomes/            (split from 894-line outcomes.ts)
│   │   ├── types.ts
│   │   ├── persistence.ts
│   │   ├── scheduling.ts
│   │   └── labeling.ts
│   ├── evaluation/          (split from 762-line evaluation.ts)
│   │   ├── types.ts
│   │   ├── metrics.ts
│   │   └── report.ts
│   ├── context/             (split from 675-line contextSnapshots.ts)
│   │   ├── types.ts
│   │   ├── snapshots.ts
│   │   └── weighting.ts
│   ├── insight/             (split from 567-line insightCandidates.ts)
│   │   ├── types.ts
│   │   ├── candidates.ts
│   │   └── seeds.ts
│   ├── alphaResearch.ts
│   ├── decisions.ts
│   ├── candidateFamilies.ts
│   └── contextPackFile.ts
├── llm/                (unchanged)
├── runtime/            (unchanged)
└── graphs/             (unchanged)
```

---

## Commits

### Phase 0 — Foundation (zero behavior change)

**P0.1: Extract CLI flag name constants**

```
NEW   src/constants/cliFlags.ts       (~40 lines)
NEW   src/constants/graphNames.ts     (~15 lines)
NEW   src/constants/errorCodes.ts     (~30 lines)
NEW   src/constants/apiPaths.ts       (~15 lines)
MOD   src/index.ts                    replace 30+ string literals with imports
```

All `"--symbol"`, `"--limit"`, `"DecisionGraph"`, `"SYMBOL_REQUIRED"`, `"/market-agent/"` literals replaced with named constants. Tests unchanged. Compile check pass.

**P0.2: Extract market-agent service types**

```
NEW   src/types/marketAgent.ts        (~180 lines — all interfaces from services/marketAgent.ts)
MOD   src/services/marketAgent.ts     remove type definitions, import from types/
MOD   src/index.ts                    update type import paths
```

All 11 interfaces (`ListDecisionOutcomesInput`, `ModelDecisionRecord`, `MarketMonitorRunInput`, `MarketDataFetchInput`, `ContextBootstrapInput`, `PatternMemoryRecord`, `FailureMemoryRecord`, etc.) move to `types/marketAgent.ts`. Service file keeps only function implementations.

**P0.3: Extract outcome / evaluation / context types**

```
NEW   src/types/outcomes.ts           (~310 lines from services/outcomes.ts)
NEW   src/types/evaluation.ts         (~230 lines from services/evaluation.ts)
NEW   src/types/context.ts            (~270 lines from services/contextSnapshots.ts)
MOD   src/services/outcomes.ts        remove type definitions
MOD   src/services/evaluation.ts      remove type definitions
MOD   src/services/contextSnapshots.ts remove type definitions
MOD   affected importers (index.ts, decisions.ts, insightCandidates.ts, alphaResearch.ts)
```

**P0.4: Extract insight / alpha / decision types + CLI types**

```
NEW   src/types/insight.ts            (~200 lines from services/insightCandidates.ts)
NEW   src/types/alpha.ts              (~146 lines from services/alphaResearch.ts)
NEW   src/types/decisions.ts          (~80 lines from services/decisions.ts)
NEW   src/types/cli.ts                (~25 lines from index.ts — WorkflowEnvelope, WorkflowError, OutcomeListStatus)
MOD   affected source files
```

**P0.5: Create types barrel export**

```
NEW   src/types/index.ts              (~20 lines — re-exports all type modules)
MOD   all importers (use barrel import where multiple types needed from same domain)
```

### Phase 1 — API Layer Encapsulation (internal behavior change, zero external effect)

**P1.1: Create typed query string builder**

```
NEW   src/api/queryBuilder.ts         (~30 lines)
```

Provides `buildQuery(params: Record<string, string | number | undefined>): string`. Replaces the 8+ duplicated `new URLSearchParams()` + `.set()` patterns across service files.

**P1.2: Refactor marketAgent.ts with queryBuilder**

```
MOD   src/services/marketAgent.ts     replace all manual URLSearchParams with buildQuery()
```

8 functions updated: `listDecisionOutcomes`, `listModelDecisions`, `fetchMarketData`, `getMarketDataHealth`, `getMarketDataQuality`, `listInsightCandidates`, `getLatestContext`, `listPatternMemories`.

**P1.3: Create typed graph execution wrapper**

```
NEW   src/api/graphRunner.ts          (~40 lines)
```

Exports `runDecisionGraph`, `runOutcomeGraph`, `runEvaluationGraph`, `runInsightExplorationGraph` — each a typed function that wraps `runtime.runGraph()` with the correct `graph_name`, input type, and output type.

**P1.4: Create per-domain API command modules**

```
NEW   src/api/commands/marketAgent.ts (~100 lines — wrappers for all market-agent endpoints)
NEW   src/api/commands/decisions.ts   (~60 lines — persistModelDecision, scheduleOutcomes, etc.)
```

Service-level functions remain, but CLI handlers now call through `api/commands/` which enforces typed contracts between the CLI layer and the service layer.

### Phase 2 — CLI Layer Decoupling (behavior-preserving restructure)

**P2.1: Extract arg parsing module**

```
NEW   src/cli/argParser.ts            (~200 lines — all parse* functions from index.ts lines 94-268)
MOD   src/index.ts                    remove arg parser functions, import from cli/argParser
```

All 15 parsing functions (`parseArgs`, `parseLimit`, `parseOptionalFlagValue`, `parseRequiredFlagValue`, `parseRequiredCsvFlag`, `parseOptionalBooleanFlag`, `parsePositiveIntegerFlag`, `parseOptionalIntFlag`, `parseSessionIdOrProfile`, `parseOptionalStatus`, `parseOptionalOutcomeStatus`, `parseOptionalGraphName`, `parseRunObservabilityLimit`, `parseOptionalFailureType`, `parsePatternMemoryPromoteInput`, `parsePatternMemoryDegradeInput`, `parsePositiveLimitFlag`) extracted.

**P2.2: Split command handlers into individual files**

```
NEW   src/cli/commandHandlers/memory.ts
NEW   src/cli/commandHandlers/runs.ts
NEW   src/cli/commandHandlers/decide.ts
NEW   src/cli/commandHandlers/outcomes.ts
NEW   src/cli/commandHandlers/decisions.ts
NEW   src/cli/commandHandlers/eval.ts
NEW   src/cli/commandHandlers/insights.ts
NEW   src/cli/commandHandlers/context.ts
NEW   src/cli/commandHandlers/marketMonitor.ts
NEW   src/cli/commandHandlers/marketData.ts
NEW   src/cli/commandHandlers/patternMemory.ts
NEW   src/cli/commandHandlers/failureMemory.ts
MOD   src/index.ts                    remove handler functions
```

Each handler file exports a single async function with signature `(runtime: Stage1Runtime, args: string[]) => Promise<WorkflowEnvelope>`. Shared helpers (`toEnvelope`, `normalizeStatus`, `WORKFLOW_RESUME_HANDLERS`) move to `cli/helpers.ts`.

**P2.3: Extract routing table**

```
NEW   src/cli/router.ts               (~45 lines)
MOD   src/index.ts                    replace handleCommandAsync body with router.table.dispatch()
```

The router is a simple map: `Record<string, HandlerFn>` dispatched by `args[0]`. Error handling for unknown commands stays in `index.ts` main flow.

**P2.4: Slim index.ts to pure entrypoint**

```
MOD   src/index.ts                    (~50 lines: exports + bootstrap + main)
```

Final state: exports (lines 1-25), `main()` function (~15 lines), `isCliEntrypoint()` (~5 lines).

### Phase 3 — Service Module Splitting (behavior-preserving file reorg)

**P3.1: Split outcomes.ts → outcomes/ directory**

```
NEW   src/services/outcomes/types.ts       (~310 lines)
NEW   src/services/outcomes/persistence.ts (~200 lines — CRUD for DecisionOutcome + InsightCandidateOutcome)
NEW   src/services/outcomes/scheduling.ts  (~200 lines — schedule/poll/close outcome cycles)
NEW   src/services/outcomes/labeling.ts    (~180 lines — normalizeDecisionLabel, barrier computation)
MOD   src/services/outcomes.ts → re-export barrel from outcomes/
MOD   all importers (evaluation.ts, insightCandidates.ts, index.ts)
```

**P3.2: Split evaluation.ts → evaluation/ directory**

```
NEW   src/services/evaluation/types.ts     (~230 lines)
NEW   src/services/evaluation/metrics.ts   (~250 lines — PathMetrics, DeltaHumanValue, TripleBarrierMetrics computation)
NEW   src/services/evaluation/report.ts    (~280 lines — evaluation report assembly + persistence)
MOD   src/services/evaluation.ts → re-export barrel
```

**P3.3: Split contextSnapshots.ts → context/ directory**

```
NEW   src/services/context/types.ts        (~270 lines)
NEW   src/services/context/snapshots.ts    (~200 lines — CRUD for ContextSnapshot)
NEW   src/services/context/weighting.ts    (~200 lines — WeightedContextItem ranking + dedup)
MOD   src/services/contextSnapshots.ts → re-export barrel
```

**P3.4: Split insightCandidates.ts → insight/ directory**

```
NEW   src/services/insight/types.ts        (~200 lines)
NEW   src/services/insight/candidates.ts   (~200 lines — CRUD for InsightCandidate)
NEW   src/services/insight/seeds.ts        (~160 lines — AlphaSeedV1 construction + validation)
MOD   src/services/insightCandidates.ts → re-export barrel
```

### Phase 4 — Contract Convergence (cleanup only)

**P4.1: Enforce types-only imports**

```
MOD   ~8 files — change `import { X } from "../services/Y.js"` to `import type { X } from "../types/Y.js"`
```

**P4.2: Add generic response contracts to api/client.ts**

```
MOD   src/api/client.ts — add ApiResponse<T> generic wrapper, document error shape
```

**P4.3: Verify zero circular dependencies**

```
RUN   npx madge --circular src/
EXPECT  no cycles
```

**P4.4: Update barrel exports for backward compatibility**

```
MOD   src/index.ts — ensure all public exports preserved (no breaking change)
```

---

## Testing Decisions

### What Makes A Good Test

Tests should verify external behavior, not implementation details. A refactored module passes the same tests as before — the test suite is the invariant.

### Existing Test Coverage (Baseline)

| Test File | Status |
|---|---|
| `services/marketAgent.test.ts` | ✅ passing |
| `services/outcomes.test.ts` | ✅ passing |
| `services/evaluation.test.ts` | ✅ passing |
| `services/contextSnapshots.test.ts` | ✅ passing |
| `services/insightCandidates.test.ts` | ✅ passing |
| `services/candidateFamilies.test.ts` | ✅ passing |
| `services/alphaResearch.test.ts` | ✅ passing |
| `runtime/stage1Runtime.test.ts` | ✅ passing |
| `llm/decisionEnvelope.test.ts` | ✅ passing |
| `llm/decisionGraphLlmDeps.test.ts` | ✅ passing |
| `llm/provider.test.ts` | ✅ passing |
| `index.test.ts` | ✅ passing |

### Testing Protocol Per Commit

1. Run full test suite: `cd apps/trader-workflows && npm test`
2. If tests were only in source files being split, move to new directory without changing assertions
3. No new tests required for pure extraction moves (Phase 0, Phase 2)
4. New tests added only for net-new modules (Phase 1's `queryBuilder.ts`, `graphRunner.ts`)

---

## Decision Document

### Module Boundaries

| Layer | Responsibility | Must Not |
|---|---|---|
| `constants/` | Named values for flags, paths, error codes, graph names | No logic, no imports from other layers |
| `types/` | Pure TypeScript interfaces and type aliases | No runtime code, no imports from services/ |
| `api/` | HTTP request construction, response parsing, graph dispatch | No CLI arg parsing, no business logic |
| `cli/` | Arg parsing, command routing, envelope wrapping | No HTTP calls directly (delegates to api/) |
| `services/` | Business logic, data transformation, state machines | No CLI flag awareness, no HTTP construction (delegates to api/) |

### API Contract (`api/client.ts`)

- `fetchIntel<T>(path, options) → Promise<T>` — for intel API endpoints
- `fetchStage1<T>(path, options) → Promise<T>` — for Stage1 API endpoints
- `Stage1ApiError` — typed error with HTTP status

No changes to the HTTP client layer. All refactoring is above this seam.

### Graph Execution Contract

Graphs are registered in `src/graphs/` and consumed by `runtime.runGraph()`. The `WORKFLOW_RESUME_HANDLERS` map in `index.ts` will move to `cli/helpers.ts` — no change to graph internals.

### Service Re-export Compatibility

All split service modules retain a barrel file at the original path:
```typescript
// src/services/outcomes.ts (after split)
export * from "./outcomes/types.js";
export * from "./outcomes/persistence.js";
export * from "./outcomes/scheduling.js";
export * from "./outcomes/labeling.js";
```

This preserves backward compatibility for any external consumers while allowing internal consumers to import from the slimmer sub-modules.

---

## Out Of Scope

- Graph internals (`graphs/`) — no changes to graph files, node logic, or StateGraph definitions
- LLM module (`llm/`) — decision envelope, evidence tools, chat agent unchanged
- Runtime module (`runtime/`) — Stage1Runtime, checkpoint store unchanged
- LangGraph Web UI configuration (`langgraph.json`)
- Adding new features or changing any API response shape
- Changing the CLI command interface (`trader workflow ...`) — all commands and flags preserved
- Package.json scripts or dependencies

---

## Further Notes

### Risk Assessment

| Phase | Risk | Mitigation |
|---|---|---|
| P0 | Very Low | Pure extraction — types and constants moved, no logic change |
| P1 | Low | New modules (`queryBuilder`, `graphRunner`) are additive; existing functions refactored internally |
| P2 | Medium | CLI handlers split across files; `handleCommandAsync` router is the critical control point |
| P3 | Medium-High | Service files split into directories; barrel re-exports maintain backward compat |
| P4 | Low | Import path cleanup only |

### Rollback Strategy

Every commit is independently reversible. The `git reflog` between phases provides clean restore points. Since Phase 0-4 never change external behavior, any problematic commit can be reverted without affecting the rest of the chain.

### Estimated Effort

| Phase | Commits | Approximate Changes |
|---|---|---|
| P0 Foundation | 5 | ~800 lines moved, ~50 lines new |
| P1 API Layer | 4 | ~250 lines new, ~80 lines modified |
| P2 CLI Decouple | 4 | ~800 lines moved, ~80 lines new |
| P3 Service Split | 4 | ~2200 lines moved, ~100 lines new |
| P4 Contract Cleanup | 4 | ~50 lines modified |
| **Total** | **21** | **~3800 lines moved, ~560 lines new** |
