import { fetchIntel } from "../api/client.js";

export async function ingestNews(): Promise<{ inserted?: number }> {
  return fetchIntel("/news/ingest", { method: "POST" });
}
