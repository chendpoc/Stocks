import { fetchIntel } from "../api/client";
import { user } from "../log/index.js";

export async function brief() {
  const result = await fetchIntel("/jobs/premarket", { method: "POST" });
  user.json("Premarket brief data", result);
}
