const BASE = process.env.TRADER_API_BASE?.replace(/\/api\/intel\/?$/, "") ?? "http://127.0.0.1:8000";

async function fetchMarketPlane(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`market-plane ${response.status}: ${text}`);
  }
  return response.json();
}

export async function listMarketPlaneSymbols(): Promise<unknown> {
  return fetchMarketPlane("/api/market-plane/symbols");
}

export async function getMarketState(symbol: string): Promise<unknown> {
  return fetchMarketPlane(`/api/market-plane/state/${encodeURIComponent(symbol)}`);
}

export async function ingestMarketPlaneSymbol(symbol: string): Promise<unknown> {
  return fetchMarketPlane(`/api/market-plane/ingest/${encodeURIComponent(symbol)}`, {
    method: "POST",
  });
}

export async function marketPlaneStreamStatus(): Promise<unknown> {
  return fetchMarketPlane("/api/market-plane/stream/status");
}

export async function startMarketPlaneStream(): Promise<unknown> {
  return fetchMarketPlane("/api/market-plane/stream/start", { method: "POST" });
}

export async function stopMarketPlaneStream(): Promise<unknown> {
  return fetchMarketPlane("/api/market-plane/stream/stop", { method: "POST" });
}
