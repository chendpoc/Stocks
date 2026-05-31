import { fetchIntel } from "../api/client";
import { printJson } from "../ui/display";

export async function signals(symbol?: string) {
  const params = new URLSearchParams();
  if (symbol) params.set("symbol", symbol);
  const result = await fetchIntel(`/signals?${params.toString()}`);
  printJson("Signals", result);
}
