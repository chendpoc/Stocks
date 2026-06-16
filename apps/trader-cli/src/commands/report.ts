import { runReport } from "../services/report.js";
import { todayDateString } from "../utils/date.js";
import { normalizeSymbol } from "../utils/symbol.js";

export async function report(symbol: string) {
  const sym = normalizeSymbol(symbol);
  const today = todayDateString();
  const result = await runReport(sym);
  if (result.hit) {
    console.log(`[缓存命中] ${sym} ${today}（cached_at: ${result.cachedAt ?? "?"})）`);
  }
  console.log(result.text);
}
