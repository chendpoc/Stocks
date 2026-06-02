import { spawnSync } from "node:child_process";
import { Command } from "commander";
import { findRepoRoot } from "../services/repoRoot.js";

interface RunsCommandOptions {
  json?: boolean;
}

interface RunsListOptions extends RunsCommandOptions {
  limit?: string;
}

function runWorkflowCommand(args: string[], options?: RunsCommandOptions): void {
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

  if (result.status !== 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exit(result.status ?? 1);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  const raw = (result.stdout ?? "").trim();
  if (!raw) {
    throw new Error("trader-workflows returned empty JSON envelope");
  }

  console.log(raw);
}

function runsList(options: RunsListOptions): void {
  const limit = Number.parseInt(options.limit ?? "50", 10);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error("runs list --limit must be a positive integer");
  }
  runWorkflowCommand(["runs", "list", "--limit", String(limit)], options);
}

function runsShow(runId: string, options: RunsCommandOptions): void {
  runWorkflowCommand(["runs", "show", runId], options);
}

function runsResume(runId: string, options: RunsCommandOptions): void {
  runWorkflowCommand(["runs", "resume", runId], options);
}

export function registerRunsCommands(program: Command): void {
  const runs = program.command("runs").description("Inspect workflow runtime runs");

  runs
    .command("list")
    .description("List runtime runs")
    .option("--limit <n>", "Number of runs to return", "50")
    .option("--json", "Output raw workflow JSON envelope")
    .action((options: RunsListOptions) => runsList(options));

  runs
    .command("show")
    .description("Show run detail")
    .argument("<run_id>", "Run id")
    .option("--json", "Output raw workflow JSON envelope")
    .action((runId: string, options: RunsCommandOptions) => runsShow(runId, options));

  runs
    .command("resume")
    .description("Resume an interrupted run")
    .argument("<run_id>", "Run id")
    .option("--json", "Output raw workflow JSON envelope")
    .action((runId: string, options: RunsCommandOptions) =>
      runsResume(runId, options));
}
