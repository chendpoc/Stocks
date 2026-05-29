import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Resolve the path to the project's .venv Python executable.
 * Falls back to system python/python3 when .venv is not found.
 */
export function pythonPath(root) {
  const winPy = path.join(root, ".venv", "Scripts", "python.exe");
  const posixPy = path.join(root, ".venv", "bin", "python3");
  if (fs.existsSync(winPy)) return winPy;
  if (fs.existsSync(posixPy)) return posixPy;
  return process.platform === "win32" ? "python" : "python3";
}

/**
 * Run a command via spawnSync with unified error handling.
 * When options.capture is true, stdout/stderr are captured instead of inherited.
 * Pass env overrides via options.env to merge into the base environment.
 */
export function run(root, command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf-8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1",
      ...(options.env ?? {}),
    },
    windowsHide: true,
  });
  if (result.status !== 0) {
    if (options.capture) {
      process.stderr.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }
    throw new Error(`${command} ${commandArgs.join(" ")} failed with exit ${result.status}`);
  }
  return result;
}

/**
 * Parse ARTIFACTS_JSON=… line from Python stdout.
 */
export function parseArtifacts(stdout) {
  const line = stdout
    .split(/\r?\n/)
    .reverse()
    .find((item) => item.startsWith("ARTIFACTS_JSON="));
  if (!line) {
    throw new Error("Python summary runner did not emit ARTIFACTS_JSON.");
  }
  return JSON.parse(line.slice("ARTIFACTS_JSON=".length));
}

/**
 * Return the current git branch name.
 */
export function currentGitBranch(root) {
  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd: root,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`git branch --show-current failed: ${result.stderr ?? ""}`.trim());
  }
  const branch = result.stdout.trim();
  if (!branch) throw new Error("Cannot push from detached HEAD.");
  return branch;
}

/**
 * Read a CLI argument value in --key=value or --key value form.
 */
export function readArgValue(rawArgs, name) {
  const eqArg = rawArgs.find((arg) => arg.startsWith(`${name}=`));
  if (eqArg) return eqArg.slice(name.length + 1);
  const index = rawArgs.indexOf(name);
  if (index >= 0 && rawArgs[index + 1] && !rawArgs[index + 1].startsWith("--")) {
    return rawArgs[index + 1];
  }
  return "";
}

/**
 * Read an optional environment variable, treating "null" / "undefined" as empty.
 */
export function readOptionalEnv(name) {
  const value = (process.env[name] || "").trim();
  return value === "null" || value === "undefined" ? "" : value;
}

/**
 * Load the WeChat Work webhook URL from env or Python secrets file.
 */
export async function loadWebhookUrl(py, root) {
  if (process.env.WEWORK_WEBHOOK_URL?.trim()) return process.env.WEWORK_WEBHOOK_URL.trim();

  const code = String.raw`
import importlib.util
from pathlib import Path

base = Path("utils")
for name in (".local_secrets.py", "local_secrets.py"):
    path = base / name
    if path.is_file():
        spec = importlib.util.spec_from_file_location("_daily_secret", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        print((getattr(mod, "wework_webhook_url", "") or "").strip())
        raise SystemExit(0)
print("")
`;

  const result = run(root, py, ["-c", code], { capture: true });
  return (result.stdout ?? "").trim();
}
