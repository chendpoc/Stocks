import { getEnvValue, setEnvValue } from "./envFile.js";

export const MARKET_DATA_PROVIDER_OPTIONS = [
  {
    id: "auto",
    label: "auto · 自动降级",
    hint: "先 yfinance，无数据或失败时用 Alpha Vantage（需 API Key）",
  },
  {
    id: "yfinance",
    label: "yfinance · 仅 Yahoo",
    hint: "不调用 Alpha Vantage",
  },
  {
    id: "alpha_vantage",
    label: "alpha_vantage · 仅 AV",
    hint: "需 ALPHAVANTAGE_API_KEY；免费档约 5 次/分钟",
  },
] as const;

export type MarketDataProviderId = (typeof MARKET_DATA_PROVIDER_OPTIONS)[number]["id"];

const VALID_IDS = new Set<string>(MARKET_DATA_PROVIDER_OPTIONS.map((o) => o.id));

export function normalizeMarketDataProvider(raw: string | undefined): MarketDataProviderId {
  const v = (raw ?? "auto").trim().toLowerCase().replace(/-/g, "_");
  if (v === "alphavantage") return "alpha_vantage";
  if (v === "mixed") return "auto";
  if (VALID_IDS.has(v)) return v as MarketDataProviderId;
  return "auto";
}

export function getMarketDataProvider(): MarketDataProviderId {
  return normalizeMarketDataProvider(getEnvValue("MARKET_DATA_PROVIDER"));
}

export function setMarketDataProvider(id: MarketDataProviderId): void {
  setEnvValue("MARKET_DATA_PROVIDER", id);
}

export function hasAlphaVantageApiKey(): boolean {
  const k =
    getEnvValue("ALPHAVANTAGE_API_KEY") ?? getEnvValue("ALPHA_VANTAGE_API_KEY") ?? "";
  return k.trim().length > 0;
}

export function marketDataProviderWarning(id: MarketDataProviderId): string | null {
  if (id !== "alpha_vantage") return null;
  if (hasAlphaVantageApiKey()) return null;
  return "未配置 ALPHAVANTAGE_API_KEY，ingest 将无法拉取行情";
}
