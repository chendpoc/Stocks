# Node.js Ecosystem Audit: trader-cli & trader-workflows

> Date: 2026-06-16 | Scope: `apps/trader-cli`, `apps/trader-workflows`
>
> Assesses hand-rolled code vs. mature npm library equivalents and recommends migrations.

---

## 0. Current State Summary

### trader-cli (已有生态基础)

| Library | Status | Version |
|---------|--------|---------|
| `commander` | ✅ 已使用 | ^13.x |
| `zod` | ✅ 已使用 | ^3.x |
| `chalk` | ✅ 已使用 | ^5.x |
| `ink` (React TUI) | ✅ 已使用 | — |
| `vitest` | ✅ 测试框架 | — |
| HTTP client | ❌ 手写 `safeFetchIntel` | `api/client.ts` 94 行 |
| 日志 | ❌ `console.log` 散落 | — |
| 配置管理 | ❌ 裸 `process.env` | — |

### trader-workflows (手写占比最高)

| Library | Status | Version |
|---------|--------|---------|
| `zod` | ✅ 已使用 | ^3.x |
| `madge` | ✅ 循环依赖检测 | devDep |
| `vitest` | ✅ 测试框架 | — |
| CLI 框架 | ❌ 手写 `argParser.ts` 229 行 | — |
| HTTP client | ❌ 手写 `fetchIntel`/`fetchStage1` | `api/client.ts` 77 行 |
| 日志 | ❌ `console.log`/`console.error` 散落 | — |
| 配置管理 | ❌ 手写 `bootstrap-env.js` 43 行 | — |

---

## 1. HTTP Client: ky → Replace hand-rolled fetch wrappers

### What to replace

| File | Lines | What it does |
|------|-------|-------------|
| `apps/trader-cli/src/api/client.ts` | 94 | `fetchIntel()`, `safeFetchIntel()`, `fetchHealth()`, error handling |
| `apps/trader-workflows/src/api/client.ts` | 77 | `fetchIntel()`, `fetchStage1()`, `Stage1ApiError`, `ApiResponse<T>` |

### Problems with current approach

- No timeout control (hangs indefinitely on network issues)
- No retry logic (transient failures crash the operation)
- No request/response interceptors (can't add auth headers centrally)
- No streaming support
- Error handling is manual `try/catch` with ad-hoc JSON parsing

### Recommendation: `ky` (^1.7.0)

**Why ky over alternatives:**

| Concern | ky | axios | undici | got |
|---------|-----|-------|--------|-----|
| Based on standard `fetch` | ✅ | ❌ (custom) | ✅ | ❌ (custom) |
| TypeScript-first | ✅ | ❌ (needs @types) | ✅ | ⚠️ partial |
| Hooks/interceptors | ✅ `beforeRequest`/`afterResponse` | ✅ | ⚠️ via dispatcher | ✅ |
| Retry built-in | ✅ | ❌ (needs plugin) | ❌ | ✅ |
| Timeout | ✅ | ✅ | ✅ | ✅ |
| Bundle size | ~3KB | ~13KB | ~5KB | ~15KB |
| ESM native | ✅ | ⚠️ | ✅ | ✅ |

ky has the smallest API surface, is natively ESM (matches both projects' `"type": "module"`), and wraps the standard `fetch` API so existing code patterns map directly.

### Migration plan

**trader-cli: `api/client.ts` → `api/httpClient.ts`**

```typescript
// Before (hand-rolled, 94 lines)
export async function fetchIntel<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${INTEL_BASE}${path}`;
  const res = await fetch(url, { ...options, headers: { ... } });
  if (!res.ok) { /* manual JSON error parsing */ }
  return res.json() as T;
}

// After (ky, ~20 lines)
import ky from "ky";
const intelApi = ky.create({
  prefixUrl: process.env.TRADER_API_BASE ?? "http://127.0.0.1:8000/api/intel",
  timeout: 30_000,
  retry: { limit: 2, methods: ["get"] },
  hooks: {
    beforeError: [(error) => { /* centralized error normalization */ }],
  },
});
export const fetchIntel = <T>(path: string, json?: object) =>
  json ? intelApi.post(path, { json }).json<T>() : intelApi.get(path).json<T>();
```

**Lines deleted: ~70 | Lines added: ~20 | Risk: LOW**

### trader-workflows: same pattern

Replace the 77-line `api/client.ts` with a ky-based client. The `ApiResponse<T>` generic and `Stage1ApiError` class can be derived from ky's `HTTPError`.

---

## 2. CLI Framework: commander → Migrate trader-workflows

### What to replace

| File | Lines |
|------|-------|
| `apps/trader-workflows/src/cli/argParser.ts` | 229 |

This file contains 15+ hand-written parse functions including:
`parseArgs`, `parseLimit`, `parseOptionalFlagValue`, `parseRequiredFlagValue`,
`parseRequiredCsvFlag`, `parseOptionalBooleanFlag`, `parsePositiveIntegerFlag`,
`parseOptionalIntFlag`, `parseSessionIdOrProfile`, `parseOptionalStatus`,
`parseOptionalOutcomeStatus`, `parseOptionalGraphName`,
`parseRunObservabilityLimit`, `parseOptionalFailureType`,
`parsePatternMemoryPromoteInput`, `parsePatternMemoryDegradeInput`,
`parsePositiveLimitFlag`

### Problem

- 229 lines of imperative parsing with repeated `args.indexOf("--flag")` patterns
- No automatic `--help` generation
- Error messages are ad-hoc (not standardized)
- Adding a new command requires: (1) new handler file, (2) new entry in router, (3) possibly new parse function

### Recommendation: `commander` (^13.x — already in trader-cli)

trader-cli already uses commander. Extending the same pattern to trader-workflows gives:

```typescript
// Before (hand-rolled parse + router)
const symbolFlagIdx = args.indexOf("--symbol");
const symbol = symbolFlagIdx !== -1 ? args[symbolFlagIdx + 1] : null;

// After (commander)
program
  .command("decide")
  .description("Run decision graph")
  .option("-s, --symbol <symbol>", "Stock symbol")
  .option("-n, --setup <name>", "Setup name")
  .action(async (opts) => { /* handler logic using opts.symbol, opts.setup */ });
```

**Benefits:**
- Auto-generated `--help` for all commands
- Type-safe options via Commander's typed API
- Subcommand nesting (already used for `context snapshot`, `market-data fetch`)
- Validation at parse time (required options, value types)

**Lines deleted: ~229 (argParser.ts) + ~40 (router simplified)**
**Lines added: ~80 (program definition)**
**Risk: MEDIUM** — requires matching all existing CLI behavior exactly

---

## 3. Logging: pino → Replace console.log

### What to replace

Scattered `console.log()` and `console.error()` across both projects:

| Project | Approximate count | Key files |
|---------|-------------------|-----------|
| trader-cli | ~30+ lines | `chatReAct.ts`, commands, services |
| trader-workflows | ~20+ lines | command handlers, runtime, services |

### Problem

- No log levels (everything is equal priority)
- No structured logging (can't filter/search by fields)
- No timestamp prefixing
- Debug logs mixed with production output
- No way to silence logs in test mode

### Recommendation: `pino` (^9.x)

**Why pino over winston:**

| Concern | pino | winston |
|---------|------|---------|
| Performance | Fastest Node.js logger | ~5x slower |
| JSON-native | ✅ (JSON-first design) | ⚠️ (supports JSON) |
| Bundle size | ~7KB | ~15KB+ |
| Ecosystem | `pino-pretty` for dev | Many transports |
| ESM | ✅ | ⚠️ |

### Usage pattern

```typescript
// logger.ts (shared module)
import pino from "pino";
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: process.env.NODE_ENV !== "production"
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
});

// Usage (replaces console.log)
logger.info({ symbol, setup }, "Running decision graph");
logger.error({ err, symbol }, "Decision graph failed");
```

**Lines changed: ~50 replacements across both projects**
**Risk: LOW** — drop-in replacement for console.log

---

## 4. Configuration: dotenv + env-var → Type-safe env management

### What to replace

| Project | Current approach | File |
|---------|-----------------|------|
| trader-cli | `process.env.XYZ ?? "default"` scattered | ~15 locations |
| trader-workflows | `bootstrap-env.js` (43 lines) + `process.env` | `bootstrap-env.js` |

### Problem

- No centralized config with defaults
- No type checking on environment variables
- No validation that required vars are set
- Missing `.env.example` documentation for what vars are needed

### Recommendation: `dotenv` (^16.x) + `env-var` (^7.x)

```typescript
// config.ts
import "dotenv/config";
import envVar from "env-var";

export const config = {
  traderApiBase: envVar.get("TRADER_API_BASE").default("http://127.0.0.1:8000/api/intel").asUrlString(),
  logLevel: envVar.get("LOG_LEVEL").default("info").asEnum(["trace", "debug", "info", "warn", "error"]),
  redisUrl: envVar.get("REDIS_URL").default("redis://localhost:6379").asString(),
  maxRetries: envVar.get("MAX_RETRIES").default("3").asIntPositive(),
} as const;
```

**Current bootstrap-env.js (43 lines) → config.ts (~25 lines)**
**Risk: LOW** — additive change, existing env vars work identically

---

## 5. Query String: No library needed (ky.searchParams)

The plan proposed `queryBuilder.ts` (11 lines, already executed). However, if `ky` is adopted for HTTP, `ky`'s built-in `searchParams` option replaces `queryBuilder.ts` entirely:

```typescript
// Before (queryBuilder)
const q = buildQuery({ symbol, status, limit });
fetchIntel(`/market-agent/decisions/outcomes?${q}`);

// After (ky)
intelApi.get("market-agent/decisions/outcomes", { searchParams: { symbol, status, limit } });
```

With ky, the `queryBuilder.ts` module becomes unnecessary — ky handles URL encoding internally.

**Verdict:** Do NOT introduce `query-string` or `qs`. ky is sufficient.

---

## 6. What NOT to introduce

| Candidate | Reason to skip |
|-----------|---------------|
| `axios` | Larger, XMLHttpRequest-based, ky is a better fit for ESM fetch-based projects |
| `winston` | Heavier than pino, no performance advantage for this use case |
| `yargs` | Commander is already the CLI standard in this monorepo |
| `lodash` | Tree-shaking concern; radash or native Array/Object methods suffice |
| `dayjs` | No significant date-heavy logic in current codebase; add only when needed |
| `dotenv-expand` | Not needed unless `.env` has variable interpolation |

---

## 7. Migration Roadmap

### Phase A: Add libraries (zero behavior change, ~1 hour)

| Step | Action | Risk |
|------|--------|------|
| A1 | `npm install ky dotenv env-var pino pino-pretty` in both packages | None |
| A2 | Create `config.ts` using dotenv + env-var (replace `bootstrap-env.js`) | Low |
| A3 | Create `logger.ts` using pino | Low |
| A4 | Verify all existing tests pass | — |

### Phase B: Replace HTTP client (~2 hours)

| Step | Action | Risk |
|------|--------|------|
| B1 | Create `httpClient.ts` with ky in trader-workflows | Low |
| B2 | Migrate `services/marketAgent.ts` 12 functions to use ky client | Medium |
| B3 | Create `httpClient.ts` with ky in trader-cli | Low |
| B4 | Migrate `safeFetchIntel` callers to ky client | Low |
| B5 | Delete `queryBuilder.ts` (now redundant with ky.searchParams) | Low |

### Phase C: Replace CLI parser (~3 hours)

| Step | Action | Risk |
|------|--------|------|
| C1 | Define commander program with all 12 commands + subcommands | Medium |
| C2 | Migrate `cli/router.ts` to commander action dispatch | Medium |
| C3 | Verify all CLI commands produce identical output | High |
| C4 | Delete `cli/argParser.ts` (229 lines) | Low |

---

## 8. Design Patterns to Adopt

### Repository Pattern (API calls)

```typescript
// data/marketAgentRepository.ts
class MarketAgentRepository {
  constructor(private client: typeof intelApi) {}

  async listOutcomes(input: ListDecisionOutcomesInput) {
    return this.client.get("market-agent/decisions/outcomes", { searchParams: input })
      .json<DecisionOutcomeRow[]>();
  }
}
```

Benefits: testable (inject mock client), single source of truth for API contracts.

### Command Pattern (CLI handlers — partially implemented)

Current handlers already follow this pattern informally. Commander formalizes it with `.action(handler)`.

### Result/Either Pattern (Error handling)

```typescript
// Instead of try/catch + manual checks
type Result<T> = { ok: true; value: T } | { ok: false; error: string; code: string };

async function runDecision(opts: DecideInput): Promise<Result<WorkflowEnvelope>> {
  try {
    const output = await runtime.runGraph({ graph_name: "DecisionGraph", input: opts });
    return { ok: true, value: output };
  } catch (e) {
    return { ok: false, error: e.message, code: "DECIDE_FAILED" };
  }
}
```

The existing `safeFetchIntel` in trader-cli already implements this pattern. Extending it to workflows handlers would unify error handling.

### Factory Pattern (Runtime instantiation)

```typescript
// Instead of inline `new Stage1Runtime()`
function createRuntime(config: RuntimeConfig): Stage1Runtime {
  const checkpointer = createCheckpointer(config);
  return new Stage1Runtime(checkpointer, config);
}
```

---

## 9. Summary: What to Install

```bash
# Both packages
npm install ky dotenv env-var pino pino-pretty

# trader-workflows only (commander already in trader-cli)
cd apps/trader-workflows && npm install commander

# Dev dependencies (trader-workflows already has madge)
npm install -D @types/node  # ensure latest Node types
```

| Library | Replaces | Lines Saved | Risk |
|---------|----------|------------|------|
| `ky` | fetch wrappers (171 lines total across both apps) | ~150 | Low |
| `pino` | console.log (50+ scattered lines) | ~30 | Low |
| `commander` | argParser.ts (229 lines) + router simplification | ~180 | Medium |
| `dotenv` + `env-var` | bootstrap-env.js (43 lines) + scattered env reads | ~30 | Low |
| **Total** | | **~390 lines deleted** | |
