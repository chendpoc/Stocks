/** Dashboard K 线周期（与后端 chart 参数一致） */
export const CHART_INTERVALS = [
  { id: "1m", label: "1m" },
  { id: "2m", label: "2m" },
  { id: "5m", label: "5m" },
  { id: "30m", label: "30m" },
  { id: "1h", label: "1h" },
  { id: "2h", label: "2h" },
  { id: "4h", label: "4h" },
  { id: "30d", label: "30日" },
] as const;

export type ChartIntervalId = (typeof CHART_INTERVALS)[number]["id"];

export function normalizeChartInterval(raw: string | undefined): ChartIntervalId {
  const v = (raw ?? "30d").trim().toLowerCase();
  const hit = CHART_INTERVALS.find((x) => x.id === v);
  return hit?.id ?? "30d";
}
