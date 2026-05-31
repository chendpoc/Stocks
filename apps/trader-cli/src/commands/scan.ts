import { fetchIntel } from "../api/client";
import { printJson } from "../ui/display";

export async function scan() {
  const result = await fetchIntel("/signals/scan", { method: "POST" });
  printJson("Scan complete", result);
}
