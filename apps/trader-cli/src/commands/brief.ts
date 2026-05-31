import { fetchIntel } from "../api/client";
import { printJson } from "../ui/display";

export async function brief() {
  const result = await fetchIntel("/jobs/premarket", { method: "POST" });
  printJson("Premarket brief data", result);
}
