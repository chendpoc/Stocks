/**
 * Centralized configuration via dotenv + env-var.
 * Replaces bare process.env reads in trader-cli.
 */

import "dotenv/config";
import envVar from "env-var";

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

  /** Longbridge CLI path */
  longbridgeCliPath: envVar
    .get("LONGBRIDGE_CLI_PATH")
    .default("longbridge")
    .asString(),
} as const;
