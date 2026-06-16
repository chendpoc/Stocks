import { fetchIntel } from "../api/client";
import { user } from "../log/index.js";

export async function review() {
  const result = await fetchIntel("/jobs/close", { method: "POST" });
  user.json("Close postmortem data", result);
}
