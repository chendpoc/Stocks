import { fetchIntel } from "../api/client.js";
import type { IngestSymbolResult, MarketStatusResult } from "./types.js";

export async function getMarketStatus(symbol?: string): Promise<MarketStatusResult> {
  const q = symbol ? `?symbol=${encodeURIComponent(symbol.toUpperCase())}` : "";
  return fetchIntel(`/market/status${q}`) as Promise<MarketStatusResult>;
}

export async function ingestMarket(): Promise<unknown> {
  return fetchIntel("/market/ingest", { method: "POST" });
}

/** 是否已有本地日线（只读 status，不触发 ingest）。 */
export async function hasLocalBars(symbol: string): Promise<boolean> {
  const st = await getMarketStatus(symbol.toUpperCase());
  return Boolean(st.latest_bar_ts);
}

export async function ingestSymbol(
  symbol: string,
  options?: { force?: boolean },
): Promise<IngestSymbolResult> {
  const sym = symbol.toUpperCase();
  const force = options?.force ?? false;
  const q = force ? "?force=true" : "";
  return fetchIntel(`/market/ingest/${encodeURIComponent(sym)}${q}`, {
    method: "POST",
  }) as Promise<IngestSymbolResult>;
}
