import { fetchIntel } from "../api/client";
import { printJson } from "../ui/display";

export async function hypotheses(symbol?: string) {
  const params = new URLSearchParams();
  if (symbol) params.set("symbol", symbol);
  const result = await fetchIntel(`/hypotheses?${params.toString()}`);
  printJson("Hypotheses", result);
}
