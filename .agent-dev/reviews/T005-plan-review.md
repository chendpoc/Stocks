# T005 Plan Review

**Date**: 2026-06-01  
**Task**: `T005`  
**Spec**: `trader-longbridge-agent-cli`  
**Reviewer**: `plan-review-agent`  
**Verdict**: `revise_required`

## Findings

### P001 [critical] source_conflict

**File**: `.agent-dev/tasks/T005.md:5`

**Issue**: `T005.json` marks the task and every S0-S8 step as `done`, but `T005.md` still says `status=in_progress`, and `T005-slices/README.md` still says the next phase is to execute S0. The S0 drift table also still describes pre-patch facts, for example `index.ts top-level await 阻塞` and `longbridgeCli.ts 仅 alert/sharelist 有规则`.

**Impact**: A future worker or reviewer gets contradictory instructions and may either repeat completed patches or trust the wrong artifact.

**Correction**: Reconcile `T005.md` and `T005-slices/README.md` with the JSON status. Either update the markdown to a completed audit record with actual evidence, or revert `T005.json` to `in_progress` until the audit table is actually closed.

### P002 [critical] verification_gap

**File**: `.agent-dev/tasks/T005.json:108`

**Issue**: S8 is marked `done`, but its `verification` only references `V303`; the step description and exit criteria require V303, V304, and V306 evidence. I also ran the planned V306 command form locally:

```text
Measure-Command { npx tsx src/index.ts scan --help > $null }
result: about 2167ms
```

That does not satisfy the stated `<300ms` target.

**Impact**: The task claims completion without the manual evidence it requires. Also, the current V306 command may be measuring `npx`/`tsx` startup overhead rather than Longbridge probe overhead, making the acceptance criterion brittle on Windows.

**Correction**: Track V303/V304/V306 as separate manual evidence items, attach the three screenshots/logs, and revise V306 to a stable metric such as "no `probeLongbridge` call on `scan --help`" or a delta comparison against a known baseline.

### P003 [important] artifact_gap

**File**: `.agent-dev/tasks/T005.json:8`

**Issue**: `review_plan` points to `c:\Users\31089\.cursor\plans\t005_开发计划深度_review_53319747.plan.md`. That file exists locally, but it is not a repo-versioned `.agent-dev` artifact.

**Impact**: A fresh reviewer can read `T005.json`, but cannot reconstruct the deep-review basis from the repository alone.

**Correction**: Preserve the durable conclusions under `.agent-dev/reviews/` or `.agent-dev/specs/trader-longbridge-agent-cli/dev-plan.md`; keep external Cursor paths as optional provenance only.

### P004 [important] verification_gap

**File**: `apps/trader-cli/src/llm/longbridgeTools.test.ts:65`

**Issue**: A312 requires `getLongbridgeQuote` to accept `symbol:string` or `symbols:string[<=10]`. The current test suite covers tool count, Tier1 mapping, `order`, `check`, and `symbols.length > 10`, but does not verify the valid multi-symbol success path.

**Impact**: The most important new D311 behavior can regress while V305 remains green.

**Correction**: Add a test that stubs `runLongbridgeJson` or otherwise verifies `getLongbridgeQuote({ symbols: ["TSLA", "AAPL"] })` calls the quote path with normalized symbols and does not return `MULTI_SYMBOL_LIMIT`.

## Evidence

### CodeGraph

- `codegraph query longbridgeAgent` found `longbridgeAgent.ts`, `buildAgentTools.ts` import usage, and `SettingsPage.tsx` import usage.
- `codegraph context "Review T005..."` returned relevant entries for `SettingsPage`, `longbridgeCli`, and `longbridgeTools`.
- `codegraph callers ensureLongbridgeAgentOnStartup` returned no callers despite direct source imports/calls, so CodeGraph call-edge evidence was treated as incomplete.
- Primary evidence therefore used `rg`, direct file reads, and current `git diff`.

### Verification Run

| Command | Result |
|---|---|
| `npm test -- src/services/longbridgeAgent.test.ts src/services/longbridgeCli.test.ts src/llm/longbridgeTools.test.ts` | exit 0, 35 passed |
| `npm test` | exit 0, 35 passed |
| `Measure-Command { npx tsx src/index.ts scan --help > $null }` | exit 0, about 2167ms |

## Open Decisions

- Should V306 remain a wall-clock `<300ms` target for `npx tsx`, or should it become a deterministic "no Longbridge probe on non-Agent command" assertion?
- Should the deep review plan be copied into `.agent-dev/reviews/` as provenance, or should T005 use a proper `.agent-dev/specs/trader-longbridge-agent-cli/dev-plan.md` artifact?

## Plan Review Handoff

- task_id / spec_id: `T005` / `trader-longbridge-agent-cli`
- review target: full T005 plan and current completion claims
- verdict: `revise_required`
- critical_count: 2
- important_count: 2
- CodeGraph evidence: used as secondary evidence; call graph incomplete for `ensureLongbridgeAgentOnStartup`
- next gate: fix plan artifacts, then run `Review task T005` for implementation diff
