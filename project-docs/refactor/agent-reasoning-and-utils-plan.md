# Development Plan: Agent Reasoning & Utils Cleanup

> Date: 2026-06-16 | Status: **Track B done** | Track A → `trader-agent-reasoning-architecture.md`
>
> Two parallel tracks:
> - **Track A**: Trader Agent CLI Chat 推理架构（详见 `trader-agent-reasoning-architecture.md`）
> - **Track B**: Utils 抽离与代码架构优化（本文档）

---

## Track B: Utils Extraction Plan

### B.1 Principle

> Pure utility functions with zero side effects should be centralized in `src/utils/`. Domain-specific helpers stay with their module.

### B.2 Candidate Functions

| # | Function | Current Location (file:line) | Target | Reuse |
|---|----------|------------------------------|--------|-------|
| B1 | `filterUndefined` | `api/client.ts:129` | `utils/object.ts` | 1 use |
| B2 | `normalizeSymbol` | `services/outcomes/labeling.ts:68` | `utils/symbol.ts` | 1 use |
| B3 | `normalizePath` | `api/client.ts:74` + `api/ruleCandidatesClient.ts:34` | `utils/path.ts` | 2 duplicated defs |
| B4 | `parseCsv` | `cli/commandHandlers/marketMonitor.ts:18` | `utils/string.ts` | 1 use |
| B5 | `compactUuid` | 8+ files: `randomUUID().replace(/-/g, "")` | `utils/id.ts` | 8+ duplicated patterns |

### B.3 Directory Structure (Target)

```
src/utils/
├── index.ts          # barrel re-export
├── object.ts         # filterUndefined
├── symbol.ts         # normalizeSymbol
├── path.ts           # normalizePath
├── string.ts         # parseCsv
└── id.ts             # compactUuid
```

### B.4 Migration Steps (per function)

```
1. Create src/utils/<module>.ts with exported function
2. Update source file: import from utils, delete local definition
3. Update src/utils/index.ts barrel export
4. Verify compilation (npx tsc --noEmit)
5. Verify tests (npm test)
```

### B.5 Execution Order (risk-ascending)

| Step | Function | Files Changed | Risk | Status |
|------|----------|---------------|------|--------|
| B1 | `filterUndefined` | 1 | Low | ✅ |
| B2 | `normalizeSymbol` | 1 | Low | ✅ |
| B3 | `normalizePath` | 2 | Low | ✅ |
| B4 | `parseCsv` | 1 | Low | ✅ |
| B5 | `compactUuid` / `prefixedId` | 15 | Medium | ✅ |

### B.6 What NOT to Extract

| Function | Reason to Keep Local |
|----------|---------------------|
| `zodErrorToWorkflowCommandError` | CLI-specific error mapping |
| `mapActionToApi` | Domain-specific decision action mapping |
| `buildEvidenceUserPrompt` | Graph node-specific prompt building |
| `toEnvelope` / `printEnvelope` | CLI protocol boundary |
| Zod schemas (`OutcomesListOpts`, etc.) | Already in handler files |

---

## Execution Summary

| Priority | Track | Item | Est. Effort | Doc |
|----------|-------|------|-------------|-----|
| P0 | B | B1-B5 utils extraction | ~2h | ✅ 本文档 |
| P1 | A | C1: Context Pack Builder | ~3d | `trader-agent-reasoning-architecture.md` |
| P2 | A | C2: Task Router | ~2d | 同上 |
| P3 | A | C3: Memory System | ~4d | 同上 |
| P4 | A | C4: Permission + Debug | ~2d | 同上 |
