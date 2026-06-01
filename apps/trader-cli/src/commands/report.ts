import { runReport } from "../services/report.js";

export async function report(symbol: string) {
  const sym = symbol.toUpperCase();
  const today = new Date().toISOString().slice(0, 10);
  const result = await runReport(sym);
  if (result.hit) {
    console.log(`[缓存命中] ${sym} ${today}（cached_at: ${result.cachedAt ?? "?"})）`);
  }
  console.log(result.text);
}
