/**
 * npm 入口：定时任务里用「程序」指向 node，参数指向本文件；或 `npm run daily:notify`（起始于仓库根目录）。
 * Windows：委派给 daily_summary_notify.ps1（含日志 tee）。其它平台：直接调用 venv/python。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

if (process.argv.includes("--dry")) {
  process.env.NOTIFY_DRY_RUN = "1";
}

function runWin() {
  const ps1 = path.join(__dirname, "daily_summary_notify.ps1");
  if (!fs.existsSync(ps1)) {
    console.error("Missing:", ps1);
    process.exit(1);
  }
  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1],
    { cwd: root, stdio: "inherit", env: process.env },
  );
  process.exit(r.status === null ? 1 : r.status);
}

function runPosix() {
  const venvPy = path.join(root, ".venv", "bin", "python3");
  const py = fs.existsSync(venvPy) ? venvPy : "python3";
  const script = path.join(root, "daily_summary_notify.py");
  const r = spawnSync(py, [script], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  process.exit(r.status === null ? 1 : r.status);
}

if (process.platform === "win32") {
  runWin();
} else {
  runPosix();
}
