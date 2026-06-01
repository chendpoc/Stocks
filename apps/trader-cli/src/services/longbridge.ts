import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type LongbridgeLaunchMode = "tui" | "kline";

export type LongbridgeProbe = {
  installed: boolean;
  cliPath: string | null;
  authOk: boolean;
  message: string;
};

/** TSLA → TSLA.US；已含市场后缀则原样返回 */
export function toLongbridgeSymbol(ticker: string): string {
  const t = ticker.trim().toUpperCase();
  if (!t) return t;
  if (t.includes(".")) return t;
  return `${t}.US`;
}

/** 解析 `longbridge check` 合并输出，供单测与运行时提示 */
export function interpretLongbridgeCheck(
  exitCode: number | null,
  stdout: string,
  stderr: string,
): { authOk: boolean; message: string } {
  const out = `${stdout}\n${stderr}`.trim();
  if (!out && exitCode === 0) {
    return { authOk: true, message: "check ok" };
  }
  const lower = out.toLowerCase();
  const authFail =
    lower.includes("authentication failed") ||
    lower.includes("oauth error") ||
    lower.includes("not logged in") ||
    lower.includes("please login") ||
    lower.includes("auth login");
  if (exitCode !== 0 || authFail) {
    const hint = authFail
      ? "请先运行: longbridge auth login"
      : out || `longbridge check 退出码 ${exitCode ?? "?"}`;
    return { authOk: false, message: hint };
  }
  const first = out.split(/\r?\n/).find((l) => l.trim()) ?? "check ok";
  return { authOk: true, message: first.slice(0, 120) };
}

export async function findLongbridgeCli(): Promise<string | null> {
  const whichCmd = process.platform === "win32" ? "where" : "which";
  try {
    const { stdout } = await execFileAsync(whichCmd, ["longbridge"], {
      timeout: 8_000,
      windowsHide: true,
    });
    const line = stdout
      .trim()
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    return line ?? null;
  } catch {
    return null;
  }
}

export async function probeLongbridge(): Promise<LongbridgeProbe> {
  const cliPath = await findLongbridgeCli();
  if (!cliPath) {
    return {
      installed: false,
      cliPath: null,
      authOk: false,
      message:
        "未找到 longbridge（PATH）。安装: https://github.com/longbridge/longbridge-terminal",
    };
  }
  try {
    const { stdout, stderr } = await execFileAsync("longbridge", ["check"], {
      timeout: 20_000,
      windowsHide: true,
    });
    const { authOk, message } = interpretLongbridgeCheck(0, stdout, stderr);
    return { installed: true, cliPath, authOk, message };
  } catch (e: unknown) {
    const err = e as { code?: number; stdout?: string; stderr?: string; message?: string };
    const { authOk, message } = interpretLongbridgeCheck(
      typeof err.code === "number" ? err.code : 1,
      String(err.stdout ?? ""),
      String(err.stderr ?? err.message ?? ""),
    );
    return { installed: true, cliPath, authOk, message };
  }
}

function spawnDetachedLongbridge(args: string[]): void {
  if (process.platform === "win32") {
    spawn("cmd.exe", ["/c", "start", "", "longbridge", ...args], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
    return;
  }
  spawn("longbridge", args, {
    detached: true,
    stdio: "ignore",
  }).unref();
}

export async function launchLongbridgeExternal(
  mode: LongbridgeLaunchMode,
  symbol: string,
): Promise<{ ok: boolean; message: string }> {
  const probe = await probeLongbridge();
  if (!probe.installed) {
    return { ok: false, message: probe.message };
  }
  if (!probe.authOk) {
    return { ok: false, message: probe.message };
  }

  if (mode === "tui") {
    spawnDetachedLongbridge(["tui"]);
    return {
      ok: true,
      message: "已在新窗口启动 longbridge tui（OAuth 会话与 CLI 共用）",
    };
  }

  const lbSym = toLongbridgeSymbol(symbol);
  if (!lbSym) {
    return { ok: false, message: "无效标的，无法启动 kline" };
  }
  spawnDetachedLongbridge(["kline", lbSym, "--period", "day", "--count", "30"]);
  return {
    ok: true,
    message: `已在新窗口启动 longbridge kline ${lbSym}`,
  };
}
