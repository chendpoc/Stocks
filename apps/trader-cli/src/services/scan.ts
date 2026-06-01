import { fetchIntel } from "../api/client.js";
import type { ScanResult } from "./types.js";

export async function runScan(): Promise<ScanResult> {
  return fetchIntel("/signals/scan", { method: "POST" }) as Promise<ScanResult>;
}
