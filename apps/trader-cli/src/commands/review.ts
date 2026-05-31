import { fetchIntel } from "../api/client";
import { printJson } from "../ui/display";

export async function review() {
  const result = await fetchIntel("/jobs/close", { method: "POST" });
  printJson("Close postmortem data", result);
}
