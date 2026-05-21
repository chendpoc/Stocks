/**
 * Legacy compatibility entry.
 * New automation should use `npm run daily:sync`, which runs the JS pipeline
 * directly and does not call ps1/sh wrappers.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const script = path.join(__dirname, "daily-summary.mjs");
const forwarded = process.argv.slice(2).map((arg) => (arg === "--dry" ? "--dry-run" : arg));

const result = spawnSync(process.execPath, [script, ...forwarded], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status === null ? 1 : result.status);
