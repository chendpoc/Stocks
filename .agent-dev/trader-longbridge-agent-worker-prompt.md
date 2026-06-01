# Worker Prompt · T005 Longbridge CLI Agent — Audit + Patch

> **任务性质（深度 review 后）**：~85% 代码已落地，本任务是 **Audit + Patch**，不是从零实现。
> **不要**重新生成 `longbridgeCli.ts` / `longbridgeAgent.ts` / `longbridgeTools.ts` / `buildAgentTools.ts` / `SettingsPage.tsx`。
> **要**：按 spec 修订后的 4 个 Blocker + 4 个 Major + Minor 做精确补丁。

## 必读

1. **Spec**: [`.agent-dev/specs/trader-longbridge-agent-cli/spec.json`](../specs/trader-longbridge-agent-cli/spec.json) (status=`approved`)
2. **Spec MD**: [`.agent-dev/specs/trader-longbridge-agent-cli/spec.md`](../specs/trader-longbridge-agent-cli/spec.md)
3. **Decision Record**: [`.agent-dev/specs/trader-longbridge-agent-cli/decision-record.json`](../specs/trader-longbridge-agent-cli/decision-record.json) (D301-D312)
4. **Task**: [`.agent-dev/tasks/T005.json`](tasks/T005.json) + [`T005.md`](tasks/T005.md)
5. **Review 报告**: `c:\Users\31089\.cursor\plans\t005_开发计划深度_review_53319747.plan.md`

## 用户拍板（RQ1-RQ4 → D310-D312）

| 决策 | 实现要求 |
|------|----------|
| **D310 lazy probe** | `index.ts` **不** 顶层 await；首次 `resolveAgentTools()`/`getAgentSystemPrompt()` 时触发；30s cache（probe_cache_ms） |
| **D311 多 symbol** | `getLongbridgeQuote` zod 改 `union<{symbol}, {symbols[<=10]}>`；>10 → `MULTI_SYMBOL_LIMIT` |
| **D312 子命令兜底 + check 隔离** | spec.json 已修；`longbridgeCli.ts` `validateLongbridgeInvoke` 加 `_default_allowed_first_args` 兜底；`check` 不在 BLOCKED，且不在 GATEWAY_WHITELIST（被 `NOT_WHITELISTED` 拦截） |

---

## S0 · Audit（先做这步！）

读取以下文件，对照 spec.json 修订后的状态，逐项填 [`T005.md`](tasks/T005.md) 的「漂移清单」表：

| 文件 | 重点对照 |
|------|----------|
| `apps/trader-cli/src/services/longbridgeAgent.ts` | 有没有 probe cache？`ensureLongbridgeAgentOnStartup` 有没有 `bootstrapDone` 短路？ |
| `apps/trader-cli/src/services/longbridgeCli.ts` | `BLOCKED_TOP_LEVEL` 是否含 `check`？`validateLongbridgeInvoke` 是否只覆盖 alert/sharelist？ |
| `apps/trader-cli/src/llm/longbridgeTools.ts` | `getLongbridgeQuote` zod schema 是只 `symbol:string` 还是 union？ |
| `apps/trader-cli/src/llm/buildAgentTools.ts` | `resolveAgentTools`/`getAgentSystemPrompt` 入口有没有 await `ensureLongbridgeAgentOnStartup`？ |
| `apps/trader-cli/src/index.ts` | 是否有顶层 `await ensureLongbridgeAgentOnStartup()`？ |
| `apps/trader-cli/src/services/longbridgeAgent.test.ts` | 是不是只测了 `normalizeLongbridgeAgent`？ |
| `apps/trader-cli/src/llm/longbridgeTools.test.ts` | 是否存在？ |
| `apps/trader-cli/package.json` | test 脚本是否含 `longbridgeTools.test.ts`？ |
| `.env.example`（仓库根） | 是否有 `TRADER_LONGBRIDGE_AGENT=on`？ |

填完表格才能进入 S1。

---

## S1 · Patch · longbridgeCli 加默认子命令兜底白名单（B2/B3/D312）

文件：`apps/trader-cli/src/services/longbridgeCli.ts`

1. 在文件顶部常量区加：

   ```ts
   const DEFAULT_ALLOWED_FIRST_ARGS = new Set([
     "list", "show", "get", "detail", "query", "chain", "history", "snapshot",
     "search", "summary", "stats", "info", "rank", "peers", "calendar",
     "holders", "actions", "topics", "rating", "premium",
   ]);
   ```

2. `validateLongbridgeInvoke`：在已有 `alert`/`sharelist`/`watchlist` 特殊规则**之后**、return ok **之前**加：

   ```ts
   if (args.length > 0 && !args[0].startsWith("--")) {
     const first = args[0];
     if (!DEFAULT_ALLOWED_FIRST_ARGS.has(first)) {
       return {
         ok: false,
         code: "FORBIDDEN_SUBCOMMAND",
         message: `子命令 ${first} 不在 _default_allowed_first_args 兜底白名单（D312）`,
       };
     }
   }
   ```

3. 确认 `BLOCKED_TOP_LEVEL` 中**不含** `check`。如果之前误加，移除。

文件：`apps/trader-cli/src/services/longbridgeCli.test.ts` 加测试：

```ts
it("BLOCKED_TOP_LEVEL 不含 check（D312/RQ2）", () => {
  expect(BLOCKED_TOP_LEVEL.has("check")).toBe(false);
});

it("Invoke 未列出顶层命令 + 非白名单 args[0] → FORBIDDEN_SUBCOMMAND", () => {
  const r = validateLongbridgeInvoke({ command: "option", args: ["deploy"] });
  expect(r.ok).toBe(false);
  expect(r.code).toBe("FORBIDDEN_SUBCOMMAND");
});

it("Invoke check → NOT_WHITELISTED（infrastructure_only）", () => {
  const r = validateLongbridgeInvoke({ command: "check", args: [] });
  expect(r.ok).toBe(false);
  expect(r.code).toBe("NOT_WHITELISTED");
});
```

**验收**：`cd apps/trader-cli && npm test -- src/services/longbridgeCli.test.ts` 全绿。

---

## S2 · Patch · Lazy probe + cache + index.ts 解耦（B4/M1/M4/D310）

文件：`apps/trader-cli/src/services/longbridgeAgent.ts`

加模块级变量与 cache：

```ts
type ProbeResult = Awaited<ReturnType<typeof probeLongbridge>>;
const PROBE_CACHE_MS = 30_000;
let probeCache: { result: ProbeResult; ts: number } | null = null;
let bootstrapDone = false;

async function cachedProbe(force = false): Promise<ProbeResult> {
  const now = Date.now();
  if (!force && probeCache && now - probeCache.ts < PROBE_CACHE_MS) {
    return probeCache.result;
  }
  const result = await probeLongbridge();
  probeCache = { result, ts: now };
  return result;
}

export function refreshProbeCache(force = true): Promise<ProbeResult> {
  if (force) probeCache = null;
  return cachedProbe(true);
}
```

改 `ensureLongbridgeAgentOnStartup`：

```ts
export async function ensureLongbridgeAgentOnStartup(): Promise<void> {
  if (bootstrapDone) return;
  bootstrapDone = true;
  if (getLongbridgeAgentSetting() !== "on") return;
  const result = await cachedProbe(false);
  if (!result.installed || !result.authOk) {
    await setLongbridgeAgentSetting("off");
    setBootstrapWarning(probeWarningMessage(result));
  }
}
```

改 `tryEnableLongbridgeAgent`：调用 `cachedProbe(true)`（force=true）。

文件：`apps/trader-cli/src/index.ts`
- **移除** `await ensureLongbridgeAgentOnStartup()` 顶层 await。
- 仅保留 `import` 让其他文件能用（如果 import 也没用到，直接删除该 import）。

文件：`apps/trader-cli/src/llm/buildAgentTools.ts`

```ts
import { ensureLongbridgeAgentOnStartup, isLongbridgeAgentReady } from "../services/longbridgeAgent.js";

export async function resolveAgentTools() {
  await ensureLongbridgeAgentOnStartup();    // lazy 触发；bootstrapDone 短路
  const base = { ...INTEL_TOOLS };
  if (isLongbridgeAgentReady()) {
    Object.assign(base, createLongbridgeTools());
  }
  return base;
}

export async function getAgentSystemPrompt() {
  await ensureLongbridgeAgentOnStartup();
  return isLongbridgeAgentReady()
    ? SYSTEM_PROMPT + "\n\n" + LONGBRIDGE_AGENT_PROMPT_PATCH
    : SYSTEM_PROMPT;
}
```

**注意**：若现有 `resolveAgentTools` / `getAgentSystemPrompt` 已 async，只需加首行 `await ensure...`；若仍同步，需把签名改 async，并同步更新 4 个 consumer（chat.ts / ChatPage.tsx / analyze.ts / report.ts）的 await。

**验收**：
```bash
cd apps/trader-cli && npm test
time npx tsx src/index.ts scan --help   # <300ms
```

---

## S3 · Patch · getLongbridgeQuote 多 symbol（m1/D311）

文件：`apps/trader-cli/src/llm/longbridgeTools.ts` 中 `getLongbridgeQuote` 定义：

```ts
getLongbridgeQuote: tool({
  description: "【长桥·实时行情】最新价、涨跌幅、量额、盘前盘后。" +
               "查现在多少钱、批量比价（≤10 symbol）优先本工具。" +
               "客观行情事实优先长桥而非 intel DB。",
  parameters: z.object({
    symbol: z.string().optional().describe("单 symbol，如 TSLA 或 TSLA.US"),
    symbols: z.array(z.string()).max(10).optional().describe("批量 symbol（≤10）"),
  }).refine(v => !!v.symbol || (v.symbols && v.symbols.length > 0),
            { message: "必须提供 symbol 或 symbols" }),
  execute: async ({ symbol, symbols }) => {
    const list = symbols && symbols.length > 0 ? symbols : [symbol!];
    if (list.length > 10) {
      return { ok: false, code: "MULTI_SYMBOL_LIMIT", message: "最多 10 个 symbol" };
    }
    const normalized = list.map(toLongbridgeSymbol);
    return await runLongbridgeJson("quote", normalized);
  },
}),
```

**注意**：保留对其他 21 个 Tier1 工具的 `symTool()` 工厂调用不变；只单独改 `getLongbridgeQuote`。

---

## S4 · Test · longbridgeAgent.test 3 mock 场景（M2）

文件：`apps/trader-cli/src/services/longbridgeAgent.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./longbridge.js", () => ({
  probeLongbridge: vi.fn(),
}));

// 同时 mock envFile 写入
vi.mock("./envFile.js", () => ({
  setEnvValue: vi.fn(),
  getEnvValue: vi.fn(() => "on"),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

it("probe 失败（未安装）→ env 改 off + warning 含「未检测到」", async () => {
  const { probeLongbridge } = await import("./longbridge.js");
  (probeLongbridge as any).mockResolvedValue({ installed: false, authOk: false });
  const { ensureLongbridgeAgentOnStartup, getLongbridgeBootstrapWarning } = await import("./longbridgeAgent.js");
  await ensureLongbridgeAgentOnStartup();
  const { setEnvValue } = await import("./envFile.js");
  expect(setEnvValue).toHaveBeenCalledWith(expect.anything(), "TRADER_LONGBRIDGE_AGENT", "off");
  expect(getLongbridgeBootstrapWarning()).toContain("未检测到");
});

it("probe 未登录 → env 改 off + warning 含「auth login」", async () => {
  const { probeLongbridge } = await import("./longbridge.js");
  (probeLongbridge as any).mockResolvedValue({ installed: true, authOk: false });
  const { ensureLongbridgeAgentOnStartup, getLongbridgeBootstrapWarning } = await import("./longbridgeAgent.js");
  await ensureLongbridgeAgentOnStartup();
  expect(getLongbridgeBootstrapWarning()).toMatch(/auth login/i);
});

it("probe 通过 → env 保持 on，warning 为空", async () => {
  const { probeLongbridge } = await import("./longbridge.js");
  (probeLongbridge as any).mockResolvedValue({ installed: true, authOk: true });
  const { ensureLongbridgeAgentOnStartup, getLongbridgeBootstrapWarning } = await import("./longbridgeAgent.js");
  await ensureLongbridgeAgentOnStartup();
  const { setEnvValue } = await import("./envFile.js");
  expect(setEnvValue).not.toHaveBeenCalledWith(expect.anything(), "TRADER_LONGBRIDGE_AGENT", "off");
  expect(getLongbridgeBootstrapWarning()).toBe(null);
});

it("连续两次 ensure → probeLongbridge 只被调用一次（bootstrapDone 短路）", async () => {
  const { probeLongbridge } = await import("./longbridge.js");
  (probeLongbridge as any).mockResolvedValue({ installed: true, authOk: true });
  const { ensureLongbridgeAgentOnStartup } = await import("./longbridgeAgent.js");
  await ensureLongbridgeAgentOnStartup();
  await ensureLongbridgeAgentOnStartup();
  expect(probeLongbridge).toHaveBeenCalledTimes(1);
});
```

**验收**：`npm test -- src/services/longbridgeAgent.test.ts` 至少 4 个测试通过。

---

## S5 · Test · 新建 longbridgeTools.test.ts（M3）

文件：`apps/trader-cli/src/llm/longbridgeTools.test.ts`（新建）

按 [`T005.md`](tasks/T005.md) S5 节代码模板创建。至少 5 个测试：

1. `Object.keys(createLongbridgeTools()).length === 23`
2. Tier1 名集合 === `spec.json.tier1_tools.map(t=>t.tool_name)`
3. `longbridgeInvoke({command:'order',...})` → `FORBIDDEN_COMMAND`
4. `getLongbridgeQuote({symbols:[11个]})` → `MULTI_SYMBOL_LIMIT`
5. `longbridgeInvoke({command:'check'})` → `NOT_WHITELISTED`

**验收**：`npm test -- src/llm/longbridgeTools.test.ts` 至少 5 个通过。

---

## S6 · Patch · SettingsPage 接 probe cache（B4）

文件：`apps/trader-cli/src/tui/pages/SettingsPage.tsx`

把现有的：
```tsx
useEffect(() => {
  if (isActive) void refreshLbProbe();
}, [isActive, currentLb, refreshLbProbe]);
```

改为只在初次进入区块 2 时复用 cache（`refreshProbeCache(false)`），而不是每次依赖 `currentLb` 变化都 spawn 子进程。给区块 2 增加按键 `r` 强制 refresh。

具体改动：
- import `refreshProbeCache` from `longbridgeAgent.js`
- `useEffect` 依赖只留 `isActive`；不再依赖 `currentLb`
- 添加 `useInput((input) => { if (input === "r" && lbBlockFocused) void refreshProbeCache(true); })`

---

## S7 · Docs（m5/m6/m7）

1. **根 `.env.example`** 加：

   ```dotenv
   # Longbridge CLI Agent 工具开关（chat/analyze 路径用）；
   # on=注册 22 个 Tier1 + longbridgeInvoke；off=仅 Dashboard [l]/[L] 外挂
   TRADER_LONGBRIDGE_AGENT=on
   ```

2. **`apps/trader-cli/.env.example`** 同上（如已加则确认）。

3. **`apps/trader-cli/package.json`** `test` 脚本：确认 cli `vitest run` 包含 `src/llm/longbridgeTools.test.ts`（多数情况下 vitest 默认会扫，无需显式列）。如果手动列，加上。

4. **`apps/trader-cli/src/llm/tools.ts`** 中 `LONGBRIDGE_AGENT_PROMPT_PATCH` 加两条：

   ```
   - 单轮对话内对长桥工具调用 ≤ 10 次（避免 rate limit）
   - 工具返回 { ok:false } 时不要用相同 args 重试；改用 intel 工具或如实告知用户问题
   ```

5. **`.agent-dev/context/code_map.md`** 加：
   `apps/trader-cli/src/llm/longbridgeTools.ts` · 长桥 22 Tier1 + invoke 网关（详见 spec trader-longbridge-agent-cli）

6. **`CLAUDE.md`** Project Layout 段下补一行指向 `longbridgeTools.ts`。

---

## S8 · Manual 验收

按 [`T005.md`](tasks/T005.md) S8 节执行 V303/V304/V306，附 3 段录屏或截图到 PR。

---

## 严格禁止

- 不改 `apps/trader-cli/src/services/longbridge.ts`（外挂）
- 不改 `apps/trader-cli/src/services/envFile.ts`、`marketDataProvider.ts`
- 不嵌入 MCP；不改后端 `longbridge_adapter.py`
- 不增加任何 `order` / `buy` / `sell` / `create` / `delete` 工具

## 完成判定

- S0 漂移清单 10 项全部勾选
- S1-S5 单测全绿（V301 + V302 + V305）
- S6 手动看 Settings 体感（B4 修好）
- S7 全量 `npm test` 通过
- S8 三段证据
- 在 T005.json `status` 改 `done`，并把所有 step status 改 `done`
