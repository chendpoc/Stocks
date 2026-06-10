import { getEnvValue, setEnvValue } from "./envFile.js";
import { probeLongbridge, type LongbridgeProbe } from "./longbridge.js";

export type LongbridgeAgentMode = "on" | "off";

let bootstrapWarning: string | null = null;

const PROBE_CACHE_MS = 30_000;
let probeCache: { result: LongbridgeProbe; ts: number } | null = null;
let bootstrapDone = false;

let _probeFn: typeof probeLongbridge = probeLongbridge;
let _setEnvFn: typeof setEnvValue = setEnvValue;

export async function cachedProbe(force = false): Promise<LongbridgeProbe> {
  const now = Date.now();
  if (!force && probeCache && now - probeCache.ts < PROBE_CACHE_MS) {
    return probeCache.result;
  }
  const result = await _probeFn();
  probeCache = { result, ts: now };
  return result;
}

export async function refreshProbeCache(): Promise<LongbridgeProbe> {
  probeCache = null;
  return cachedProbe(true);
}

export function getLongbridgeBootstrapWarning(): string | null {
  return bootstrapWarning;
}

export function clearLongbridgeBootstrapWarning(): void {
  bootstrapWarning = null;
}

export function normalizeLongbridgeAgent(raw: string | undefined): LongbridgeAgentMode {
  const v = (raw ?? "on").trim().toLowerCase();
  if (v === "off" || v === "false" || v === "0" || v === "no") return "off";
  return "on";
}

export function getLongbridgeAgentSetting(): LongbridgeAgentMode {
  return normalizeLongbridgeAgent(getEnvValue("TRADER_LONGBRIDGE_AGENT"));
}

export function setLongbridgeAgentSetting(mode: LongbridgeAgentMode): void {
  _setEnvFn("TRADER_LONGBRIDGE_AGENT", mode);
}

export function probeWarningMessage(probe: LongbridgeProbe): string {
  if (!probe.installed) {
    return "未检测到 longbridge CLI（PATH）。安装: https://github.com/longbridge/longbridge-terminal";
  }
  if (!probe.authOk) {
    return "请先运行: longbridge auth login";
  }
  return "";
}

/** 每次 trader 进程启动时调用 */
export async function ensureLongbridgeAgentOnStartup(): Promise<void> {
  if (bootstrapDone) return;
  bootstrapDone = true;
  bootstrapWarning = null;
  if (getLongbridgeAgentSetting() !== "on") return;
  const probe = await cachedProbe(false);
  if (probe.installed && probe.authOk) return;
  setLongbridgeAgentSetting("off");
  bootstrapWarning = probeWarningMessage(probe) || probe.message;
}

export function isLongbridgeAgentEnabled(): boolean {
  return getLongbridgeAgentSetting() === "on";
}

/** Settings 用户选择 on */
export async function tryEnableLongbridgeAgent(): Promise<{
  ok: boolean;
  message: string;
}> {
  const probe = await cachedProbe(true);
  const warn = probeWarningMessage(probe);
  if (warn) {
    return { ok: false, message: warn };
  }
  setLongbridgeAgentSetting("on");
  bootstrapWarning = null;
  return { ok: true, message: "已启用 Longbridge Agent 工具" };
}

export async function isLongbridgeAgentReady(): Promise<boolean> {
  if (!isLongbridgeAgentEnabled()) return false;
  const probe = await cachedProbe(false);
  return probe.installed && probe.authOk;
}

/** TUI 启动：探测 CLI、必要时降级 Agent，并返回状态栏提示。 */
export async function getLongbridgeStartupHint(): Promise<string | null> {
  await ensureLongbridgeAgentOnStartup();
  const warn = getLongbridgeBootstrapWarning();
  if (warn) return warn;

  if (getLongbridgeAgentSetting() === "off") {
    const probe = await cachedProbe(false);
    if (probe.installed && probe.authOk) {
      return "长桥 CLI 已就绪；按 7 进入设置，将 TRADER_LONGBRIDGE_AGENT 切为 on";
    }
  }
  return null;
}

/** @internal — only for tests */
export function _resetForTest(deps?: {
  probe?: typeof probeLongbridge;
  setEnv?: typeof setEnvValue;
}): void {
  bootstrapDone = false;
  probeCache = null;
  bootstrapWarning = null;
  _probeFn = deps?.probe ?? probeLongbridge;
  _setEnvFn = deps?.setEnv ?? setEnvValue;
}
