/**
 * Centralized configuration via env-var.
 * `.env` loading is handled by bootstrap-env → loadEnv (entry side-effect).
 */

import envVar from "env-var";
import path from "node:path";

export const config = {
  /** Intel API base URL (for fetchIntel calls) */
  traderApiBase: envVar
    .get("TRADER_API_BASE")
    .default("http://127.0.0.1:8000/api/intel")
    .asUrlString(),

  /** Log level */
  logLevel: envVar
    .get("LOG_LEVEL")
    .default("info")
    .asEnum(["trace", "debug", "info", "warn", "error", "fatal"]),

  /** LLM provider identifier */
  llmProvider: envVar
    .get("LLM_PROVIDER")
    .default("deepseek")
    .asString(),

  /** LLM model name */
  llmModel: envVar
    .get("LLM_MODEL")
    .default("deepseek-chat")
    .asString(),

  /** LLM API key */
  llmApiKey: envVar
    .get("LLM_API_KEY")
    .default("")
    .asString(),

  /** OpenAI-compatible fallback key */
  openaiApiKey: envVar
    .get("OPENAI_API_KEY")
    .default("")
    .asString(),

  /** LLM API base URL (OpenAI-compatible) */
  llmBaseUrl: envVar
    .get("LLM_BASE_URL")
    .default("https://api.deepseek.com/v1")
    .asUrlString(),

  /** Longbridge CLI on PATH or explicit path */
  longbridgeCliPath: envVar
    .get("LONGBRIDGE_CLI_PATH")
    .default("longbridge")
    .asString(),

  /** LONGBRIDGE_CLI binary override */
  longbridgeCli: envVar
    .get("LONGBRIDGE_CLI")
    .default("")
    .asString(),

  /** Explicit Longbridge CLI binary (TRADER_LONGBRIDGE_CLI) */
  traderLongbridgeCli: envVar
    .get("TRADER_LONGBRIDGE_CLI")
    .default("")
    .asString(),

  /** Longbridge agent tools toggle (on|off) */
  longbridgeAgentEnabled: envVar
    .get("TRADER_LONGBRIDGE_AGENT")
    .default("off")
    .asString(),

  /** Chart handoff JSON path override */
  traderChartHandoff: envVar
    .get("TRADER_CHART_HANDOFF")
    .default("")
    .asString(),

  /** trader-chart binary path override */
  traderChartBin: envVar
    .get("TRADER_CHART_BIN")
    .default("")
    .asString(),

  /** Default chart interval for CLI chart command */
  traderChartInterval: envVar
    .get("TRADER_CHART_INTERVAL")
    .default("30d")
    .asString(),

  /** Market agent / daemon data directory */
  marketAgentDataDir: envVar
    .get("MARKET_AGENT_DATA_DIR")
    .default("")
    .asString(),
} as const;

/** Backend root (health, guided-paper, market-plane) derived from intel base URL. */
export function traderBackendRoot(): string {
  return config.traderApiBase.replace(/\/api\/intel\/?$/, "");
}

export function resolveMarketAgentDataDir(): string {
  const configured = config.marketAgentDataDir.trim();
  return configured || path.join(process.cwd(), "data");
}

/** Runtime env read for chart handoff path (supports test/shell overrides after boot). */
export function resolveTraderChartHandoffPath(): string {
  return (
    envVar.get("TRADER_CHART_HANDOFF").asString()?.trim() ||
    config.traderChartHandoff.trim()
  );
}

/** Runtime env read for trader-chart binary (supports test/shell overrides after boot). */
export function resolveTraderChartBinPath(): string {
  return envVar.get("TRADER_CHART_BIN").asString()?.trim() || config.traderChartBin.trim();
}
