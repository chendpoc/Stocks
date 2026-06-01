import { runScan } from "../services/scan.js";
import { printJson } from "../ui/display.js";

export async function scan() {
  const result = await runScan();
  printJson("Scan complete", result);
}
