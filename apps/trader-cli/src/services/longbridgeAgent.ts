import { getEnvValue, setEnvValue } from "./envFile.js";
import { probeLongbridge, type LongbridgeProbe } from "./longbridge.js";

export type LongbridgeAgentMode = "on" | "off";

let bootstrapWarning: string | null = null;

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
  setEnvValue("TRADER_LONGBRIDGE_AGENT", mode);
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
  bootstrapWarning = null;
  if (getLongbridgeAgentSetting() !== "on") return;
  const probe = await probeLongbridge();
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
  const probe = await probeLongbridge();
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
  const probe = await probeLongbridge();
  return probe.installed && probe.authOk;
}
