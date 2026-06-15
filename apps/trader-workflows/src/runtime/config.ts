/**
 * Centralized configuration via dotenv + env-var.
 * Replaces bare process.env reads scattered across the codebase.
 */

import "dotenv/config";
import envVar from "env-var";

export const config = {
  /** Intel API base URL */
  traderApiBase: envVar
    .get("TRADER_API_BASE")
    .default("http://127.0.0.1:8000/api/intel")
    .asUrlString(),

  /** Rule candidates API base URL (falls back to traderApiBase sibling) */
  traderRuleCandidatesApiBase: envVar
    .get("TRADER_RULE_CANDIDATES_API_BASE")
    .default("")
    .asString(),

  /** SQLite checkpoint database path */
  checkpointDbPath: envVar
    .get("TRADER_WORKFLOWS_CHECKPOINT_DB")
    .default("data/trader-workflows/checkpoints.sqlite")
    .asString(),

  /** LLM provider identifier (deepseek, openai, anthropic, etc.) */
  llmProvider: envVar
    .get("LLM_PROVIDER")
    .default("deepseek")
    .asString(),

  /** LLM model name */
  llmModel: envVar
    .get("LLM_MODEL")
    .default("deepseek-chat")
    .asString(),

  /** Log level (trace, debug, info, warn, error, fatal) */
  logLevel: envVar
    .get("LOG_LEVEL")
    .default("info")
    .asEnum(["trace", "debug", "info", "warn", "error", "fatal"]),

  /** Timezone for decision prompt date formatting */
  decisionPromptTz: envVar
    .get("DECISION_PROMPT_TZ")
    .default("Asia/Shanghai")
    .asString(),
} as const;
