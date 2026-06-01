import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { findLongbridgeCli } from "./longbridge.js";

const execFileAsync = promisify(execFile);

export const MAX_STDOUT_BYTES = 262_144;
export const MAX_COUNT_LIMIT = 500;

const BLOCKED_TOP_LEVEL = new Set([
  "auth",
  "init",
  "update",
  "tui",
  "completion",
  "order",
  "withdrawals",
  "deposits",
  "bank-cards",
  "dca",
  "ipo",
  "statement",
]);

const BLOCKED_ARG_TOKENS = new Set([
  "buy",
  "sell",
  "cancel",
  "replace",
  "create",
  "delete",
  "subscribe",
  "pin",
]);

/** Tier1 具名工具已覆盖的顶层命令，禁止经 Invoke 重复调用 */
const TIER1_COMMANDS = new Set([
  "quote",
  "kline",
  "intraday",
  "depth",
  "trades",
  "static",
  "calc-index",
  "news",
  "financial-report",
  "valuation",
  "consensus",
  "forecast-eps",
  "dividend",
  "screener",
  "compare",
  "market-temp",
  "market-status",
  "positions",
  "portfolio",
  "assets",
  "watchlist",
  "capital",
]);

export const GATEWAY_WHITELIST = new Set([
  "brokers",
  "option",
  "warrant",
  "business-segments",
  "industry-rank",
  "industry-peers",
  "institution-rating",
  "finance-calendar",
  "filing",
  "topic",
  "margin-ratio",
  "max-qty",
  "exchange-rate",
  "shareholder",
  "company",
  "executive",
  "industry-valuation",
  "operating",
  "corp-action",
  "invest-relation",
  "constituent",
  "broker-holding",
  "ah-premium",
  "trade-stats",
  "anomaly",
  "top-movers",
  "rank",
  "profit-analysis",
  "fund-holder",
  "insider-trades",
  "investors",
  "short-positions",
  "short-trades",
  "financial-statement",
  "valuation-rank",
  "participants",
  "security-list",
  "trading",
  "subscriptions",
  "cash-flow",
  "fund-positions",
  "quant",
  "sharelist",
  "alert",
]);

const SLOW_COMMANDS = new Set(["financial-report", "filing", "screener"]);

export type LongbridgeCliResult =
  | { ok: true; data: unknown }
  | {
      ok: false;
      code: string;
      message: string;
      truncated?: boolean;
      preview?: string;
    };

export function sanitizeLongbridgeArgs(args: string[]): string[] | LongbridgeCliResult {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a || /[;&|`$<>]/.test(a)) {
      return { ok: false, code: "INVALID_ARGS", message: "参数含非法字符" };
    }
    const lower = a.toLowerCase();
    if (BLOCKED_ARG_TOKENS.has(lower)) {
      return { ok: false, code: "FORBIDDEN_SUBCOMMAND", message: `禁止子命令: ${a}` };
    }
    if ((lower === "--count" || lower === "--limit") && i + 1 < args.length) {
      const n = Number.parseInt(args[i + 1], 10);
      if (!Number.isFinite(n) || n < 1 || n > MAX_COUNT_LIMIT) {
        return {
          ok: false,
          code: "LIMIT_EXCEEDED",
          message: `--count/--limit 须在 1–${MAX_COUNT_LIMIT}`,
        };
      }
    }
    out.push(a);
  }
  return out;
}

export function validateLongbridgeInvoke(
  command: string,
  args: string[] = [],
): LongbridgeCliResult | null {
  const cmd = command.trim().toLowerCase();
  if (!cmd) {
    return { ok: false, code: "INVALID_COMMAND", message: "缺少 command" };
  }
  if (BLOCKED_TOP_LEVEL.has(cmd) || TIER1_COMMANDS.has(cmd)) {
    return {
      ok: false,
      code: "FORBIDDEN_COMMAND",
      message: `命令不在 Invoke 白名单: ${command}`,
    };
  }
  if (!GATEWAY_WHITELIST.has(cmd)) {
    return {
      ok: false,
      code: "NOT_WHITELISTED",
      message: `命令未在白名单: ${command}`,
    };
  }
  if (cmd === "watchlist") {
    return {
      ok: false,
      code: "USE_NAMED_TOOL",
      message: "watchlist 请使用 listLongbridgeWatchlist",
    };
  }
  if (cmd === "alert") {
    const sub = args[0]?.toLowerCase();
    if (sub && sub !== "list") {
      return { ok: false, code: "FORBIDDEN_SUBCOMMAND", message: "alert 仅允许 list" };
    }
  }
  if (cmd === "sharelist") {
    const sub = args[0]?.toLowerCase();
    if (sub && !["list", "detail", "show"].includes(sub)) {
      return {
        ok: false,
        code: "FORBIDDEN_SUBCOMMAND",
        message: "sharelist 仅允许 list/detail/show",
      };
    }
  }
  return null;
}

function parseJsonStdout(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed) as unknown;
}

export async function runLongbridgeJson(
  command: string,
  args: string[] = [],
  opts?: { timeoutMs?: number },
): Promise<LongbridgeCliResult> {
  const sanitized = sanitizeLongbridgeArgs(args);
  if (!("length" in sanitized)) return sanitized;

  const cli = await findLongbridgeCli();
  if (!cli) {
    return { ok: false, code: "NOT_INSTALLED", message: "未检测到 longbridge CLI" };
  }

  const timeoutMs =
    opts?.timeoutMs ?? (SLOW_COMMANDS.has(command) ? 60_000 : 30_000);
  const execArgs = [command, ...sanitized, "--format", "json"];

  try {
    const { stdout } = await execFileAsync(cli, execArgs, {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: MAX_STDOUT_BYTES + 64_000,
    });
    const raw = Buffer.byteLength(stdout, "utf8") > MAX_STDOUT_BYTES;
    const clipped = raw ? stdout.slice(0, MAX_STDOUT_BYTES) : stdout;
    if (raw) {
      return {
        ok: false,
        code: "TRUNCATED",
        message: `输出超过 ${MAX_STDOUT_BYTES} 字节`,
        truncated: true,
        preview: clipped.slice(0, 2000),
      };
    }
    try {
      return { ok: true, data: parseJsonStdout(clipped) };
    } catch {
      return {
        ok: false,
        code: "PARSE_ERROR",
        message: "CLI 输出非 JSON",
        preview: clipped.slice(0, 500),
      };
    }
  } catch (e: unknown) {
    const err = e as {
      code?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
      killed?: boolean;
    };
    if (err.killed) {
      return { ok: false, code: "TIMEOUT", message: `执行超时 (${timeoutMs}ms)` };
    }
    const msg = [err.stderr, err.stdout, err.message].filter(Boolean).join("\n").trim();
    return {
      ok: false,
      code: "CLI_ERROR",
      message: msg || `longbridge 退出码 ${err.code ?? "?"}`,
    };
  }
}
