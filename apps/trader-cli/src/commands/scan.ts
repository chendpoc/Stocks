import { runScan } from "../services/scan.js";
import { user } from "../log/index.js";

export async function scan() {
  const result = await runScan();
  user.json("Scan complete", result);
}
