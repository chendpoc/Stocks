import { getEnvValue, setEnvValue } from "../services/envFile.js";
import { normalizeMarketDataProvider } from "../services/marketDataProvider.js";

const CONFIG_KEYS = [
  "TRADER_API_BASE",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "MARKET_DATA_PROVIDER",
  "ALPHAVANTAGE_API_KEY",
  "LLM_PROVIDER",
  "LLM_MODEL",
  "LLM_API_KEY",
  "LLM_BASE_URL",
];

export async function config(action: string, key?: string, value?: string) {
  switch (action) {
    case "show":
      for (const k of CONFIG_KEYS) {
        const v = getEnvValue(k);
        console.log(`${k}=${v ? (k.includes("KEY") ? "***" : v) : "(unset)"}`);
      }
      return;
    case "set":
      if (!key || value === undefined) {
        throw new Error("用法: trader config set <KEY> <VALUE>");
      }
      if (key === "MARKET_DATA_PROVIDER") {
        const normalized = normalizeMarketDataProvider(value);
        setEnvValue(key, normalized);
        console.log(`已设置 ${key}=${normalized}（已写入 .env，重启 backend 后 ingest 生效）`);
        return;
      }
      setEnvValue(key, value);
      console.log(`已设置 ${key}（已写入 .env）`);
      return;
    default:
      throw new Error(`Unknown config action: ${action} (use show|set)`);
  }
}
