import { fetchIntel } from "../api/client.js";

export async function buildMarketSummary(): Promise<string> {
  const parts: string[] = [];

  try {
    const spyBars = await fetchIntel(
      "/market/bars?symbol=SPY&timeframe=1d&limit=5",
    );
    if (spyBars && Array.isArray(spyBars) && spyBars.length > 0) {
      const last = spyBars[spyBars.length - 1];
      const prev = spyBars.length > 1 ? spyBars[spyBars.length - 2] : null;
      const changePct = prev && prev.close
        ? ((last.close - prev.close) / prev.close * 100).toFixed(2)
        : "N/A";
      parts.push(`SPY: ${last.close} (${changePct}%)`);
    }
  } catch {
    // ignore fetch failures in this heartbeat path.
  }

  try {
    const signals = await fetchIntel("/signals?status=new&limit=20");
    if (signals && Array.isArray(signals) && signals.length > 0) {
      const summary = signals.map((signal: Record<string, unknown>) => ({
        symbol: signal.symbol,
        type: signal.type,
        strength: signal.strength,
      }));
      parts.push(`signals: ${JSON.stringify(summary)}`);
    } else {
      parts.push("signals: []");
    }
  } catch {
    parts.push("signals: (fetch failed)");
  }

  try {
    const events = await fetchIntel("/events?days=3&limit=10");
    if (events && Array.isArray(events) && events.length > 0) {
      const names = events.map((event: Record<string, unknown>) => event.title ?? event.name ?? "?")
        .join(", ");
      parts.push(`events: ${names}`);
    }
  } catch {
    // ignore fetch failures in heartbeat mode
  }

  try {
    const regime = await fetchIntel("/market-agent/regime");
    if (regime && typeof regime === "object" && !Array.isArray(regime)) {
      const r = regime as Record<string, unknown>;
      parts.push(
        `regime: ${r.state ?? "?"} (confidence=${r.confidence ?? "?"}, ` +
        `indicators=${JSON.stringify(r.indicators ?? {})})`,
      );
    }
  } catch {
    parts.push("regime: (unavailable)");
  }

  return parts.join("\n") || "market data unavailable";
}
