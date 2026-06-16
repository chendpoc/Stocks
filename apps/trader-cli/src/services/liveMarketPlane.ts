import { fetchBackend } from "../api/backendClient.js";

export async function listMarketPlaneSymbols(): Promise<unknown> {
  return fetchBackend("/api/market-plane/symbols");
}

export async function getMarketState(symbol: string): Promise<unknown> {
  return fetchBackend(`/api/market-plane/state/${encodeURIComponent(symbol)}`);
}

export async function ingestMarketPlaneSymbol(symbol: string): Promise<unknown> {
  return fetchBackend(`/api/market-plane/ingest/${encodeURIComponent(symbol)}`, {
    method: "POST",
  });
}

export async function marketPlaneStreamStatus(): Promise<unknown> {
  return fetchBackend("/api/market-plane/stream/status");
}

export async function startMarketPlaneStream(): Promise<unknown> {
  return fetchBackend("/api/market-plane/stream/start", { method: "POST" });
}

export async function stopMarketPlaneStream(): Promise<unknown> {
  return fetchBackend("/api/market-plane/stream/stop", { method: "POST" });
}
