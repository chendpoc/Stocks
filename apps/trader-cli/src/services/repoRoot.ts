import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function findRepoRoot(): string {
  const seen = new Set<string>();
  const candidates: string[] = [];
  const add = (dir: string) => {
    const normalized = resolve(dir);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };
  add(process.cwd());
  add(resolve(dirname(fileURLToPath(import.meta.url)), "../../.."));
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    add(dir);
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  for (const root of candidates) {
    if (
      existsSync(resolve(root, "package.json")) &&
      existsSync(resolve(root, "apps/trader-cli/package.json"))
    ) {
      return root;
    }
  }
  return process.cwd();
}
