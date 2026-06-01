import { buildChartLines } from "../services/chart.js";
import { normalizeChartInterval } from "../services/chartIntervals.js";
import { runTraderChartProcess } from "../services/traderChart.js";

export async function chart(symbol: string) {
  const sym = symbol.trim().toUpperCase();
  if (!sym) {
    console.error("请提供标的，例如: trader chart TSLA");
    process.exit(1);
  }

  if (process.stdin.isTTY && process.stdout.isTTY) {
    const res = runTraderChartProcess({
      symbol: sym,
      chartInterval: normalizeChartInterval(
        process.env.TRADER_CHART_INTERVAL ?? "30d",
      ),
    });
    if (!res.ok) {
      console.error(res.message);
      process.exit(1);
    }
    return;
  }

  const lines = await buildChartLines(sym, {
    chartInterval: "30d",
    width: 72,
    height: 14,
  });
  for (const line of lines) {
    console.log(line);
  }
}
