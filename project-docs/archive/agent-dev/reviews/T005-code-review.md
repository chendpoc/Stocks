# T005 Code Review

**Date**: 2026-06-02  
**Task**: `T005`  
**Spec**: `trader-longbridge-agent-cli`  
**Reviewer**: `code-review-agent`  
**Pass**: post-fix re-review 2  
**Verdict**: `fix_required`

## Findings

### F001 [blocker] scope_violation

**File**: `apps/trader-chart/src/main.rs`, `apps/trader-chart/src/ui/draw.rs`, `apps/trader-chart/src/viewport.rs`

**Issue**: The earlier generic docs scope leak is fixed: `.agent-dev/README.md` and `project-docs/overview.md` are no longer in the tracked diff. However, the current T005 diff still includes `apps/trader-chart/*` rendering/input changes, while T005 scope in `spec.json` only allows Longbridge CLI files, T005 task/spec artifacts, env/package docs, `CLAUDE.md`, and `.agent-dev/context/code_map.md`.

**Impact**: T005 still cannot be reviewed or merged as a focused Longbridge Agent CLI task while trader-chart UI/viewport changes are mixed into the same diff.

**Correction**: Move the `apps/trader-chart/*` changes into a separate task/branch, or explicitly add them to T005 scope with a decision record explaining why trader-chart changes are required for Longbridge Agent delivery.

### F002 [resolved] api_contract_break

**File**: `apps/trader-cli/src/llm/longbridgeTools.ts:39`

**Status**: Fixed.

**Evidence**:

```text
quote.parameters.safeParse({ symbols: 11 items })
=> success:true

quote.execute({ symbols: 11 items })
=> { ok:false, code:"MULTI_SYMBOL_LIMIT" }
```

The schema no longer blocks over-limit `symbols` before `execute()`, so A312's documented tool-result contract is reachable through the normal validated tool path.

### F003 [warning] api_contract_break

**File**: `apps/trader-cli/src/services/longbridgeCli.ts:161`

**Issue**: `watchlist` is still in `TIER1_COMMANDS`, so `validateLongbridgeInvoke("watchlist", [])` returns `FORBIDDEN_COMMAND` before the later `cmd === "watchlist"` branch can return `USE_NAMED_TOOL`.

**Evidence**:

```text
validateLongbridgeInvoke("watchlist", [])
=> { ok:false, code:"FORBIDDEN_COMMAND" }
```

**Impact**: This is safe, but it contradicts `spec.json`'s `USE_NAMED_TOOL` error and `invoke_subcommand_rules.watchlist="use_named_tool_listLongbridgeWatchlist"`.

**Correction**: Move the watchlist special case before the generic `TIER1_COMMANDS` branch, or remove the unreachable branch and update the spec to accept `FORBIDDEN_COMMAND`.

### F004 [warning] evidence_drift

**File**: `.agent-dev/tasks/T005.json:45`, `.agent-dev/tasks/T005.json:109`

**Issue**: V306's source-of-truth in `spec.json` is now deterministic and passes locally, but `T005.json` still describes the old `trader scan --help <300ms` acceptance in S2/S8. `T005.md` says V303/V304 still require user manual verification while S8 is marked done.

**Evidence**:

```text
index.ts top-level await ensureLongbridgeAgentOnStartup matches: 0
buildAgentTools.ts lazy ensureLongbridgeAgentOnStartup matches: 2
```

**Impact**: The implementation evidence is good for V306, but the task record still mixes old timing acceptance with the new deterministic contract and does not attach V303/V304 evidence.

**Correction**: Update `T005.json` S2/S8 to match deterministic V306, and either attach V303/V304 manual evidence or mark them as explicitly user-verified/deferred.

### F005 [warning] untested_code

**File**: `apps/trader-cli/src/llm/longbridgeTools.test.ts:65`

**Issue**: The test suite covers `symbols.length > 10` by calling `execute()` directly and covers single-symbol fallback. It still does not test a valid `symbols[<=10]` execute path through the multi-symbol input form.

**Evidence**:

```text
quote.parameters.safeParse({ symbols: ["TSLA", "AAPL"] })
=> success:true

longbridgeTools.test.ts
=> no execute test for symbols: ["TSLA", "AAPL"]
```

**Impact**: D311's main multi-symbol behavior can regress while V305 stays green.

**Correction**: Add a test that verifies `getLongbridgeQuote({ symbols: ["TSLA", "AAPL"] })` reaches the quote path with normalized symbols and does not return `MULTI_SYMBOL_LIMIT`.

## Verification

| Command | Result |
|---|---|
| `cd apps/trader-cli && npm test` | exit 0, 36 tests passed |
| `quote.parameters.safeParse({ symbols: 11 items })` via `npx tsx` | success true |
| `quote.execute({ symbols: 11 items })` via `npx tsx` | `ok:false`, `code:"MULTI_SYMBOL_LIMIT"` |
| `quote.parameters.safeParse({ symbols: ["TSLA", "AAPL"] })` via `npx tsx` | success true |
| `validateLongbridgeInvoke("watchlist", [])` via `npx tsx` | `FORBIDDEN_COMMAND`, not `USE_NAMED_TOOL` |
| deterministic V306 grep checks | index top-level await matches 0; lazy matches 2 |
| `git diff --check` | exit 0; only CRLF warnings |

## Review Handoff

- task_id / spec_id: `T005` / `trader-longbridge-agent-cli`
- review target: current post-fix T005 diff and task completion claims
- verdict: `fix_required`
- blocker_count: 1
- warning_count: 3
- resolved_since_last_review: F002 fixed; generic docs scope leak fixed; V306 deterministic check still passes
- next step: isolate or scope `apps/trader-chart/*`, then rerun `Review task T005`
