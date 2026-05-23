import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));

const checks = [
  ["npm", ["run", "test:summary"]],
  ["npm", ["run", "console:build"]],
  ["npm", ["run", "daily:publish:dry"]],
  ["npm", ["run", "pages:deploy:dry"]],
  ["npm", ["run", "public:build:audit"]],
  ["git", ["diff", "--check"]],
];

const cmdShims = new Set(["npm", "npx", "pnpm"]);

function commandName(name) {
  return process.platform === "win32" && cmdShims.has(name) ? `${name}.cmd` : name;
}

function spawnCommand(command, args) {
  const resolved = commandName(command);
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(resolved)) {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", resolved, ...args],
    };
  }
  return { command: resolved, args };
}

function run(command, args) {
  const spawned = spawnCommand(command, args);
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(spawned.command, spawned.args, {
    cwd: rootDir,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}: ${result.stderr || result.stdout}`);
  }
  return String(result.stdout || "").replace(/\s+$/u, "");
}

function releaseCheckStatusPath() {
  return process.env.RELEASE_CHECK_STATUS_PATH
    ? resolve(process.env.RELEASE_CHECK_STATUS_PATH)
    : resolve(rootDir, "data/generated/release-check-status.json");
}

function writeReleaseCheckEvidence() {
  const evidencePath = releaseCheckStatusPath();
  const evidence = {
    ok: true,
    completed_at: new Date().toISOString(),
    head: runCapture("git", ["rev-parse", "HEAD"]),
    git_status_short: runCapture("git", ["-c", "core.quotepath=false", "status", "--short"]),
    checks: checks.map(([command, args]) => `${command} ${args.join(" ")}`),
  };

  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(`release:check evidence: ${evidencePath}`);
}

for (const [command, args] of checks) {
  run(command, args);
}

writeReleaseCheckEvidence();

console.log("\nrelease:check completed");
