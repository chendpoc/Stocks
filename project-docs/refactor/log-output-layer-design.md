# Log Output Layer Design

> Date: 2026-06-16 | Status: proposed
>
> Scope: `apps/trader-cli/src/log/`, `apps/trader-workflows/src/cli/`
> Replaces: `ui/display.ts`, scattered `console.log`, `printEnvelope`

---

## Problem

Three output concerns are entangled:
- **User output** — CLI terminal display with `chalk` colors (`console.log`)
- **Machine protocol** — JSON envelopes consumed by `trader-cli` spawn (`printEnvelope`)
- **Diagnostic logging** — structured pino logs for debugging

All three use `console.log`/`console.error` with no distinction, making it impossible to redirect diagnostic logs to stderr or switch machine output format.

---

## SOTA Principle

> Do not unify the tool — unify the layer. pino does not replace chalk; chalk does not replace JSON. Each output concern gets its own channel.

```
┌──────────────────────────────────────────────────┐
│                   src/log/                         │
│                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐│
│  │ user.ts       │  │ machine.ts    │  │ logger.ts ││
│  │ chalk         │  │ JSON/JSONL    │  │ pino      ││
│  │ console.log   │  │ console.log   │  │ stderr    ││
│  │ stdout (TTY)  │  │ stdout (pipe) │  │           ││
│  └──────────────┘  └──────────────┘  └──────────┘│
│                                                    │
│  规则：                                             │
│  • 用户输出 → chalk + console.log                  │
│  • 机器协议 → console.log(JSON.stringify(...))     │
│  • 诊断日志 → logger.info/error/warn/debug (stderr)│
│  • 禁止 console.log 用于诊断（信息丢失）             │
│  • 禁止 pino 用于用户输出（不可读）                  │
└──────────────────────────────────────────────────┘
```

---

## Directory Structure

```
apps/trader-cli/src/log/
├── index.ts          # barrel export: { logger, user, machine }
├── logger.ts         # pino — diagnostic logs → stderr
├── user.ts           # chalk + console.log — user terminal output → stdout
└── machine.ts        # JSON — machine protocol output → stdout
```

---

## Module Specifications

### `user.ts` — User Terminal Output

```typescript
import chalk from "chalk";

export const user = {
  /** Bold green title */
  title: (t: string) => console.log(chalk.bold.green(`\n${t}`)),

  /** Cyan section header */
  section: (t: string) => console.log(chalk.cyan(`\n${t}`)),

  /** Indented line */
  line: (t: string) => console.log(`  ${t}`),

  /** Plain text */
  say: (t: string) => console.log(t),

  /** Labeled JSON dump */
  json: (label: string, data: unknown) => {
    console.log(chalk.cyan(`\n${label}`));
    console.log(JSON.stringify(data, null, 2));
  },

  /** Yellow warning to stderr */
  warn: (msg: string) => console.error(chalk.yellow(msg)),

  /** Red error + exit */
  die: (msg: string) => {
    console.error(chalk.red(msg));
    process.exit(1);
  },
};
```

Replaces:
- `ui/display.ts` — `printJson()` → `user.json()`, `printLines()` → `user.title()` + multiple `user.line()`
- `commands/chat.ts` — `console.log(result.text)` → `user.say(result.text)`
- `commands/chart.ts` — `console.error("请提供标的")` → `user.die("请提供标的")`

### `machine.ts` — Machine Protocol Output

```typescript
export const machine = {
  /** Single JSON line (envelope protocol for spawn consumers) */
  envelope: (data: unknown) => console.log(JSON.stringify(data)),

  /** JSONL line for streaming output */
  line: (data: unknown) => console.log(JSON.stringify(data)),
};
```

Replaces:
- `trader-workflows: cli/helpers.ts` — `printEnvelope(envelope)` → `machine.envelope(envelope)`
- `trader-cli: api/client.ts` — `safeFetchIntel` result output (optional)

### `logger.ts` — Diagnostic Logging

```typescript
// Current src/logger.ts content, unchanged.
// Re-exported from src/log/index.ts.
```

Replaces:
- `services/watchlist.ts` — `console.error(...)` → `logger.error({ symbol }, msg)`
- `services/server.ts` — `console.log(status)` → `logger.info({ status })`
- `tui/pages/DashboardPage.tsx` — already using `logger` ✅

### `index.ts` — Barrel Export

```typescript
export { logger } from "./logger.js";
export { user } from "./user.js";
export { machine } from "./machine.js";
```

---

## Migration Map

### trader-cli

| File | Current | Replacement | Count |
|------|---------|-------------|-------|
| `commands/chat.ts` | `console.log(step)` | `user.say(step)` | 6 |
| `commands/chat.ts` | `console.log("[Step N]")` | `logger.debug({ step: N }, msg)` | 5 |
| `commands/chat.ts` | `console.log(result.text)` | `user.say(result.text)` | 2 |
| `commands/chart.ts` | `console.error("请提供标的")` | `user.die("请提供标的")` | 1 |
| `commands/chart.ts` | `console.error(res.message)` | `user.warn(res.message)` | 1 |
| `commands/chart.ts` | `console.log(line)` | `user.line(line)` | 1 |
| `commands/analyze.ts` | `console.log(result.text)` | `user.say(result.text)` | 1 |
| `ui/display.ts` | `printJson()` + `printLines()` | **DELETE** — replaced by `user.*` | entire file |
| `services/watchlist.ts` | `console.error(...)` | `logger.error({ symbol }, msg)` | 2 |
| `services/server.ts` | `console.log(status)` | `logger.info({ status })` | 2 |
| `tui/launch.ts` | `console.error("TUI...")` | `user.die("TUI...")` | 1 |

### trader-workflows

| File | Current | Replacement |
|------|---------|-------------|
| `cli/helpers.ts` | `printEnvelope` → `console.log(JSON.stringify(...))` | `import { machine } from "../../log/machine.js"; export const printEnvelope = machine.envelope;` |
| `cli/logger.ts` | `export { logger } from "../runtime/logger.js"` | Re-export from `src/log/logger.ts` (or keep as-is) |

---

## What NOT to Change

| Code | Reason |
|------|--------|
| `console.error(...)` in `tui/launch.ts` (pre-Ink) | No config available yet |
| `console.log(JSON.stringify(envelope))` pattern | Correct — just moved to `machine.ts` |
| `chalk` in `ui/display.ts` | Moved to `user.ts` — same behavior |
| All `logger.*` calls in `tui/pages/*.tsx` | Already correct ✅ |

---

## Implementation Steps (7 steps, ~2h)

| Step | Action | Files |
|------|--------|-------|
| 1 | Create `src/log/user.ts`, `src/log/machine.ts`, `src/log/index.ts` | 3 new |
| 2 | Create `src/log/logger.ts` (re-export from `src/logger.ts`) | 1 new |
| 3 | Replace `commands/` and `ui/display.ts` with `user.*` calls | ~4 modified |
| 4 | Replace `services/watchlist.ts`, `services/server.ts` with `logger.*` | 2 modified |
| 5 | Replace `cli/helpers.ts` `printEnvelope` → `machine.envelope` | 1 modified |
| 6 | Delete `ui/display.ts` | 1 deleted |
| 7 | Verify: `npx tsc --noEmit`, `npm test` | — |

---

## Verification Checklist

- [ ] `npx tsc --noEmit` — no new errors
- [ ] `npm test` — all tests pass
- [ ] `trader chart TSLA` — chart output intact
- [ ] `trader chat` — conversation output intact
- [ ] `trader-workflows outcomes list --symbol TSLA --json` — JSON envelope intact
- [ ] Diagnostic logs go to stderr (verify with `2>/dev/null`)
