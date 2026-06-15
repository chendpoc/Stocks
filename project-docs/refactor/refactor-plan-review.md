# Refactor Plan Review: workflow-module-refactoring-plan.md

> Reviewed against actual codebase at `apps/trader-workflows/src/`
> Date: 2026-06-15 (same day as plan)

## Executive Summary

The vast majority of the 21-commit plan has already been executed. 18 of 21 commits are fully complete; 3 are partially complete. The codebase is in a healthy post-refactor state with zero circular dependencies, clean layer separation, and a slim 56-line `index.ts`. However, several gaps remain: two command handlers still use manual arg-parsing instead of the extracted parser functions, one handler bypasses the `api/commands/` contract layer, and the plan document itself contains stale pre-refactor line counts that should be struck through or updated.

---

## Per-Commit Execution Status

### Phase 0 — Foundation

| Commit | Status | Evidence |
|--------|--------|----------|
| **P0.1** Extract CLI flag name constants | ✅ EXECUTED | `src/constants/cliFlags.ts` (26 exports), `graphNames.ts` (4 exports + union type), `errorCodes.ts` (29 codes), `apiPaths.ts` (1 export). All exist. |
| **P0.2** Extract market-agent service types | ✅ EXECUTED | `src/types/marketAgent.ts` (177 lines — plan said ~180). `src/services/marketAgent.ts` imports types from `../types/marketAgent.js` (line 4-29). |
| **P0.3** Extract outcome/evaluation/context types | ✅ EXECUTED | `src/types/outcomes.ts` (93 lines), `src/types/evaluation.ts` (138 lines), `src/types/context.ts` (88 lines). Service files became barrel re-exports. |
| **P0.4** Extract insight/alpha/decision/CLI types | ✅ EXECUTED | `src/types/insight.ts` (94 lines), `src/types/alpha.ts` (85 lines), `src/types/decisions.ts` (29 lines), `src/types/cli.ts` (21 lines). |
| **P0.5** Create types barrel export | ✅ EXECUTED | `src/types/index.ts` exists with `export type *` for all 8 modules + value exports for const arrays. |

### Phase 1 — API Layer Encapsulation

| Commit | Status | Evidence |
|--------|--------|----------|
| **P1.1** Create typed query string builder | ✅ EXECUTED | `src/api/queryBuilder.ts` exists. `buildQuery()` accepts `Record<string, string \| number \| boolean \| undefined \| null>`. |
| **P1.2** Refactor marketAgent.ts with queryBuilder | ✅ EXECUTED | `src/services/marketAgent.ts:61-64` — `withQuery()` helper wraps `buildQuery()`. All 12 functions use it. No manual `URLSearchParams` remains. |
| **P1.3** Create typed graph execution wrapper | ✅ EXECUTED | `src/api/graphRunner.ts` (82 lines). Exports `runDecisionGraphViaRuntime`, `runOutcomeGraphViaRuntime`, `runEvaluationGraphViaRuntime`, `runInsightExplorationGraphViaRuntime`. Naming differs from plan (`runDecisionGraph` vs plan's `runDecisionGraph`). |
| **P1.4** Create per-domain API command modules | ✅ EXECUTED | `src/api/commands/marketAgent.ts` (49 lines), `src/api/commands/decisions.ts` (17 lines). Both are pure re-export wrappers. |

### Phase 2 — CLI Layer Decoupling

| Commit | Status | Evidence |
|--------|--------|----------|
| **P2.1** Extract arg parsing module | ✅ EXECUTED | `src/cli/argParser.ts` (229 lines — plan said ~200). Contains all 15+ parsing functions. |
| **P2.2** Split command handlers into individual files | ✅ EXECUTED | `src/cli/commandHandlers/` contains all 12 files exactly as planned. |
| **P2.3** Extract routing table | ✅ EXECUTED | `src/cli/router.ts` (60 lines). `COMMAND_HANDLERS` map dispatches 12 commands. `handleCommandAsync` does Unknown command error handling. |

### Phase 3 — Service File Splits

| Commit | Status | Evidence |
|--------|--------|----------|
| **P3.1** Split outcomes.ts | ✅ EXECUTED | `src/services/outcomes/` → `types.ts`, `persistence.ts`, `scheduling.ts`, `labeling.ts`. Barrel at `src/services/outcomes.ts` (4 lines). |
| **P3.2** Split evaluation.ts | ✅ EXECUTED | `src/services/evaluation/` → `types.ts`, `metrics.ts`, `report.ts`. Barrel at `src/services/evaluation.ts` (3 lines). |
| **P3.3** Split contextSnapshots.ts | ✅ EXECUTED | `src/services/context/` → `types.ts`, `snapshots.ts`, `weighting.ts`. Barrel at `src/services/contextSnapshots.ts` (39 lines). |
| **P3.4** Split insightCandidates.ts | ✅ EXECUTED | `src/services/insight/` → `types.ts`, `candidates.ts`, `seeds.ts`. Barrel at `src/services/insightCandidates.ts` (51 lines). |

### Phase 4 — Contract Cleanup

| Commit | Status | Evidence |
|--------|--------|----------|
| **P4.1** Enforce types-only imports | ⚠️ PARTIAL | Most files use `import type` correctly. Gap: `src/cli/commandHandlers/context.ts:5-14` imports runtime values from `../../services/contextSnapshots.js` and `../../services/contextPackFile.js` instead of going through `api/commands/`. |
| **P4.2** Verify ApiResponse contracts | ⚠️ PARTIAL | The plan's P4.2 detail (lines 341-357) references `ApiResponse<T>` wrappers and `toApiError`. The current `src/types/cli.ts` has `WorkflowEnvelope` with `ok`/`data`/`error` pattern but no generic `ApiResponse<T>` wrapper exists. Response shapes vary across endpoints. |
| **P4.3** Remove circular dependencies | ✅ EXECUTED | `npx madge --circular --extensions ts --exclude graphs src/` reports: "No circular dependency found!" (82 files processed). |
| **P4.4** Standardize barrel exports | ⚠️ PARTIAL | `types/index.ts`, `services/outcomes.ts`, `services/evaluation.ts`, `services/contextSnapshots.ts`, `services/insightCandidates.ts` all have barrel exports. However, `services/alphaResearch.ts` (208 lines), `services/decisions.ts` (171 lines), and `services/marketAgent.ts` (250 lines) were never split into directories and lack barrel wrappers — this is acceptable per the plan scope. |

---

## Gaps Found

### GAP-1: Manual arg parsing in eval.ts and outcomes.ts (MODERATE)

`src/cli/commandHandlers/eval.ts:24-35` and `src/cli/commandHandlers/outcomes.ts:50-58` manually parse `--symbol` and `--limit` via `args.indexOf()` + `args[idx+1]` instead of using the extracted parser functions (`parseOptionalFlagValue`, `parsePositiveIntegerFlag`). This defeats the purpose of `cli/argParser.ts` and repeats validation logic.

**Fix**: Replace manual `args.indexOf(CLI_FLAG_SYMBOL)` patterns with calls to `parseOptionalFlagValue(args, CLI_FLAG_SYMBOL)` and `parsePositiveIntegerFlag(args, CLI_FLAG_LIMIT, defaultVal)`.

### GAP-2: context.ts handler bypasses api/commands/ contract layer (MODERATE)

`src/cli/commandHandlers/context.ts:5-14` imports directly from `../../services/contextSnapshots.js` and `../../services/contextPackFile.js`. All other command handlers go through `../../api/commands/` for service access. This creates an inconsistent architecture where some CLI handlers respect the contractual seam and others don't.

**Fix**: Either (a) add `contextSnapshots` and `contextPackFile` wrappers to `api/commands/`, or (b) document that `api/commands/` is only for market-agent-backed endpoints and service-direct access is acceptable for non-HTTP services. Currently the split is arbitrary.

### GAP-3: api/commands/ is pure re-export — no contract enforcement (LOW)

`src/api/commands/marketAgent.ts` (49 lines) and `src/api/commands/decisions.ts` (17 lines) contain only `export { ... } from "../../services/marketAgent.js"` and `export type { ... } from "../../types/marketAgent.js"` statements. They perform zero transformation, validation, or contract enforcement. The plan (P1.4, lines 223-229) says they "enforce typed contracts between the CLI layer and the service layer" — but they don't; the TypeScript compiler already enforces types across direct imports.

**Fix**: Either add actual contract logic (input validation, response shape normalization) or consider folding `api/commands/` into a simpler pattern where command handlers import from `api/` directly (e.g., `api/marketAgent.ts` that wraps services). The current double-hop (handler → api/commands → services) adds 2 files with zero runtime value.

### GAP-4: Stale line count claims in plan document (DOCUMENTATION)

The plan's Problem Statement (Section 4) claims:
- `index.ts` is 1245 lines → **actual: 56 lines** (the refactor already happened)
- `services/marketAgent.ts` is 425 lines → **actual: 250 lines**
- `services/outcomes.ts` is 894 lines → **actual: 4 lines** (barrel)
- `services/evaluation.ts` is 762 lines → **actual: 3 lines** (barrel)
- `services/contextSnapshots.ts` is 675 lines → **actual: 39 lines** (barrel)

The plan reads as a proposal when most of it has already been executed. The document header says "Status: proposed" but the code reflects "Status: executed."

### GAP-5: Type line count claims mismatch actual types/ files (DOCUMENTATION)

The plan's P0.3-P0.4 commit descriptions estimate type file sizes based on PRE-SPLIT service files (types interleaved with logic). The actual extracted type files are smaller because type-like runtime constructs (const arrays, guard functions, builder functions) stayed in service sub-modules:

| Type File | Plan Estimate | Actual Lines | Delta |
|-----------|--------------|-------------|-------|
| `types/outcomes.ts` | ~310 | 93 | -70% |
| `types/evaluation.ts` | ~230 | 138 | -40% |
| `types/context.ts` | ~270 | 88 | -67% |
| `types/insight.ts` | ~200 | 94 | -53% |
| `types/alpha.ts` | ~146 | 85 | -42% |
| `types/decisions.ts` | ~80 | 29 | -64% |

The plan overestimates because it counted all lines in the original service files that were type-related (including `export type { ... }` re-exports, const arrays, and runtime helper functions). The executed extraction was more surgical — only pure interfaces and type aliases moved.

---

## P4 Verification Results

### P4.1 — Types-Only Imports ✅ (minor gap)

Most files correctly use `import type` for type-only imports. `index.ts` uses `export type { ... }` and `import type` where applicable. The `cli/commandHandlers/` files consistently use `import type` for `Stage1Runtime`, `WorkflowEnvelope`, and graph types. **Gap**: `context.ts` imports runtime functions from services (see GAP-2).

### P4.2 — ApiResponse Contracts ⚠️

The plan's P4.2 section mentions:
- `ApiResponse<T>` with `ok`, `api_data`, `api_error` fields
- `toApiError(response)` helper
- `parseApiResponse<T>()`

None of these exist in the current codebase. Instead, `WorkflowEnvelope` (in `types/cli.ts`) serves a similar purpose at the CLI boundary, and individual service functions return typed promises directly (`Promise<ListDecisionOutcomesResponse>`, etc.). The plan's `ApiResponse<T>` pattern appears to be a different approach from what was actually implemented.

### P4.3 — Circular Dependencies ✅

Verified clean: `npx madge --circular --extensions ts --exclude graphs src/` → "No circular dependency found!" across 82 processed files.

### P4.4 — Barrel Exports ✅ (minor gap)

- `types/index.ts` — complete, re-exports all 8 type modules plus value exports
- `services/outcomes.ts` — complete (4-line barrel)
- `services/evaluation.ts` — complete (3-line barrel)
- `services/contextSnapshots.ts` — complete (39-line barrel with selective exports)
- `services/insightCandidates.ts` — complete (51-line barrel)
- `services/marketAgent.ts` — NOT a barrel (250 lines of function implementations + type re-exports). Per plan ~250 lines expected; acceptable.
- `services/alphaResearch.ts` — NOT a barrel (208 lines). Never planned for split; acceptable.
- `services/decisions.ts` — NOT a barrel (171 lines). Never planned for split; acceptable.

---

## api/commands/ Indirection Analysis

The `api/commands/` directory contains two files:

- `marketAgent.ts` (49 lines): Re-exports 12 functions from `services/marketAgent.js` and 19 types from `types/marketAgent.js`
- `decisions.ts` (17 lines): Re-exports 2 functions from `services/marketAgent.js` and 5 types from `types/marketAgent.js`

**Usage**: 8 of 12 command handlers import from `api/commands/` (9 total import sites across the codebase).

**Value assessment**: The files are pure pass-through re-exports. They add no validation, no transformation, no error wrapping, no contract enforcement. They introduce a 2-hop import chain (handler → api/commands → services) that the TypeScript compiler already type-checks at each hop.

**Verdict**: Low-value indirection in its current form. The plan's stated goal ("enforce typed contracts between the CLI layer and the service layer") is not achieved — TypeScript already enforces types without this layer. The files would be valuable if they contained:
- Input sanitization/validation before passing to services
- Response envelope normalization
- CLI-specific error translation
- Logging or telemetry hooks

In their current state, they could be removed and command handlers could import from `services/` directly with zero loss of type safety.

---

## Recommended Fixes (Priority Order)

### Fix 1: Eliminate manual arg parsing in eval.ts and outcomes.ts

**Files**: `src/cli/commandHandlers/eval.ts:24-35`, `src/cli/commandHandlers/outcomes.ts:50-58`

Replace `args.indexOf(CLI_FLAG_SYMBOL)` / `args[idx+1]` patterns with:
```typescript
import { parseOptionalFlagValue, parsePositiveIntegerFlag } from "../argParser.js";
const symbol = parseOptionalFlagValue(args, CLI_FLAG_SYMBOL);
const limit = parsePositiveIntegerFlag(args, CLI_FLAG_LIMIT, 500);
```

This eliminates duplicated flag-parsing logic and ensures consistent error messages.

### Fix 2: Resolve context.ts cross-layer inconsistency

**File**: `src/cli/commandHandlers/context.ts:5-14`

Either:
- **Option A**: Create `api/commands/contextSnapshots.ts` and `api/commands/contextPackFile.ts` wrappers so context.ts follows the same pattern as other handlers.
- **Option B**: Accept that non-HTTP services (context snapshots, context pack files) don't need the `api/commands/` wrapper. Remove the `api/commands/` layer entirely and have all handlers import from `services/` directly.

Option B is simpler and eliminates the low-value indirection identified above.

### Fix 3: Either add value to api/commands/ or remove it

**Files**: `src/api/commands/marketAgent.ts`, `src/api/commands/decisions.ts`

If keeping `api/commands/`:
- Add input validation (e.g., sanitize symbol strings, enforce limit bounds)
- Add response normalization (e.g., always wrap in a standard envelope)
- Add telemetry/logging hooks

If removing:
- Update all 9 import sites in `cli/commandHandlers/` to import from `services/` directly
- Delete `src/api/commands/` directory
- The TypeScript compiler provides equivalent type safety

### Fix 4: Update plan document to reflect executed state

**File**: `project-docs/refactor/workflow-module-refactoring-plan.md`

- Change header status from "proposed" to "executed" (or "partially executed")
- Strike through stale line counts in the Problem Statement tables (lines 26-43, 34-42)
- Add a note that actual type file sizes are smaller than estimated because only pure interfaces/aliases were extracted
- Strike through or comment on P4.2 `ApiResponse<T>` pattern that was not implemented

### Fix 5: Add missing `--symbol` constant usage audit

Several locations may still have hardcoded flag references. While `constants/cliFlags.ts` is comprehensive (26 flag constants), the codebase should be audited for any remaining bare `"--symbol"` or `"--limit"` string literals outside of the constants file itself. The plan claimed 40+ magic string locations; verify all have been replaced.

---

## Summary Statistics

| Metric | Plan Target | Actual | Status |
|--------|------------|--------|--------|
| `index.ts` lines | ~50 | 56 | ✅ Close |
| `services/marketAgent.ts` lines | ~250 | 250 | ✅ Exact |
| Constants files | 4 | 4 | ✅ |
| Types modules | 8 | 8 | ✅ |
| Command handler files | 12 | 12 | ✅ |
| Service sub-modules | 4 dirs (13 files) | 4 dirs (13 files) | ✅ |
| Circular dependencies | 0 | 0 | ✅ |
| `api/commands/` files | 2+ | 2 | ⚠️ Low value |
| Manual arg parsing remaining | 0 | 2 sites | ❌ Gap |
| Handlers bypassing api/commands | 0 | 1 handler | ❌ Gap |
