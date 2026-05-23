import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = {
  ...process.env,
  COREPACK_HOME: process.env.COREPACK_HOME || path.join(repoRoot, ".corepack"),
};

const corepackJs = path.join(path.dirname(process.execPath), "node_modules", "corepack", "dist", "corepack.js");
const command = fs.existsSync(corepackJs) ? process.execPath : "corepack";
const args = fs.existsSync(corepackJs)
  ? [corepackJs, "pnpm", ...process.argv.slice(2)]
  : ["pnpm", ...process.argv.slice(2)];

const result = spawnSync(command, args, {
  cwd: repoRoot,
  env,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
