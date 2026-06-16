import { fetchIntel } from "../api/client";
import { user } from "../log/index.js";

export async function hypotheses(symbol?: string) {
  const params = new URLSearchParams();
  if (symbol) params.set("symbol", symbol);
  const result = await fetchIntel(`/hypotheses?${params.toString()}`);
  user.json("Hypotheses", result);
}
