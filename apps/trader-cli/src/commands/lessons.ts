import { fetchIntel } from "../api/client";
import { printJson } from "../ui/display";

export async function lessons(symbol?: string) {
  const params = new URLSearchParams({ limit: "10" });
  if (symbol) params.set("symbol", symbol);
  const result = await fetchIntel(`/lessons?${params.toString()}`);
  printJson("Lessons", result);
}
