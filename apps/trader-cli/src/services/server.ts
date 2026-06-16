import { execFile, spawn } from "node:child_process";
import { join } from "node:path";
import { fetchHealth } from "../api/client.js";
import { logger, machine, user } from "../log/index.js";
import { findRepoRoot } from "./repoRoot.js";
import type { ServerStatusResult } from "./types.js";

export async function getServerStatus(): Promise<ServerStatusResult> {
  try {
    const res = await fetchHealth();
    const ok = res.status === "ok" && Number(res.intel_route_count) >= 14;
    return {
      ok,
      status: String(res.status),
      intel_route_count: res.intel_route_count,
    };
  } catch (e: unknown) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function startServer(): void {
  const cwd = findRepoRoot();
  spawn("npm", ["run", "trader-agent:backend:dev"], {
    detached: true,
    stdio: "ignore",
    shell: true,
    cwd,
  }).unref();
}

export function stopServer(): Promise<void> {
  const root = findRepoRoot();
  const python =
    process.platform === "win32"
      ? join(root, ".venv", "Scripts", "python.exe")
      : join(root, ".venv", "bin", "python");
  const script = join(root, "apps/trader-agent/backend/scripts/dev_server.py");
  return new Promise((resolve) => {
    execFile(python, [script, "stop"], { cwd: root }, () => resolve());
  });
}

export async function serverStatusForCli(): Promise<void> {
  const res = await getServerStatus();
  if (res.ok) {
    machine.line({ status: res.status, intel_route_count: res.intel_route_count });
    logger.info({ status: res.status, intel_route_count: res.intel_route_count }, "backend health ok");
    user.say("status:ok");
  } else {
    user.say(`后端未运行或无响应：${res.error ?? res.status ?? "unknown"}`);
    logger.warn({ error: res.error, status: res.status }, "backend health check failed");
  }
}
