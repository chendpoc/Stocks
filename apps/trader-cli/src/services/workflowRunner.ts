import { spawnSync } from "node:child_process";

import { findRepoRoot } from "./repoRoot.js";

export interface WorkflowEnvelope {
  ok: boolean;
  command?: string;
  run_id?: string;
  status?: string;
  data?: Record<string, unknown>;
  error?: { code?: string; message?: string };
}

export function invokeWorkflowJson(args: string[]): WorkflowEnvelope {
  const result = spawnSync(
    "npm",
    [
      "--prefix",
      "apps/trader-workflows",
      "run",
      "workflows",
      "--",
      ...args,
      "--json",
    ],
    {
      cwd: findRepoRoot(),
      env: process.env,
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  );

  if (result.error) {
    throw new Error(`Failed to run trader-workflows: ${result.error.message}`);
  }

  const raw = (result.stdout ?? "").trim();
  if (result.status !== 0) {
    const message = raw || result.stderr || `exit ${result.status ?? 1}`;
    throw new Error(`trader-workflows failed: ${message}`);
  }

  if (!raw) {
    throw new Error("trader-workflows returned empty JSON envelope");
  }

  return JSON.parse(raw) as WorkflowEnvelope;
}
