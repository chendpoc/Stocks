import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function envSearchRoots(): string[] {
  const seen = new Set<string>();
  const roots: string[] = [];
  const add = (dir: string) => {
    const normalized = resolve(dir);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    roots.push(normalized);
  };
  add(process.cwd());
  add(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    add(dir);
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return roots;
}

/** Load `.env` from cwd / package dir / parents (does not override existing env, except TRADER_API_BASE). */
export function loadEnvFile(): void {
  for (const root of envSearchRoots()) {
    const path = resolve(root, ".env");
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env) || key === "TRADER_API_BASE") {
        process.env[key] = value;
      }
    }
  }
}
