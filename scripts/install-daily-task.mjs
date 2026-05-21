import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function readArg(name, fallback) {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

if (process.platform !== "win32") {
  console.error("daily:install-task currently targets Windows Task Scheduler only.");
  process.exit(1);
}

const taskName = readArg("--name", "StockCommunityDailySummary");
const time = readArg("--time", "08:30");
const nodeExe = process.execPath;
const script = path.join(root, "scripts", "daily-summary.mjs");
const taskRun = `"${nodeExe}" "${script}"`;

const args = [
  "/Create",
  "/TN",
  taskName,
  "/TR",
  taskRun,
  "/SC",
  "DAILY",
  "/ST",
  time,
  "/RL",
  "LIMITED",
  "/F",
];

const result = spawnSync("schtasks.exe", args, {
  cwd: root,
  stdio: "inherit",
  windowsVerbatimArguments: false,
});

process.exit(result.status === null ? 1 : result.status);
