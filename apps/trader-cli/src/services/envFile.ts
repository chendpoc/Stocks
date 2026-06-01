import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { findRepoRoot } from "./repoRoot.js";

export function envFilePath(): string {
  return resolve(findRepoRoot(), ".env");
}

function parseEnvLines(content: string): Array<{ key: string; value: string; raw: string }> {
  const entries: Array<{ key: string; value: string; raw: string }> = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    entries.push({ key, value, raw: line });
  }
  return entries;
}

/** 读取仓库根 `.env` 中的键值（不覆盖已有 process.env）。 */
export function readEnvFile(): Record<string, string> {
  const path = envFilePath();
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const { key, value } of parseEnvLines(readFileSync(path, "utf8"))) {
    out[key] = value;
  }
  return out;
}

export function getEnvValue(key: string): string | undefined {
  if (process.env[key] != null && process.env[key] !== "") {
    return process.env[key];
  }
  return readEnvFile()[key];
}

/** 写入仓库根 `.env` 并更新当前进程的 `process.env`。 */
export function setEnvValue(key: string, value: string): void {
  const path = envFilePath();
  const lines = existsSync(path) ? readFileSync(path, "utf8").split(/\r?\n/) : [];
  let found = false;
  const updated = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) return line;
    const k = trimmed.slice(0, eq).trim();
    if (k !== key) return line;
    found = true;
    return `${key}=${value}`;
  });
  if (!found) {
    if (updated.length > 0 && updated[updated.length - 1] !== "") {
      updated.push(`${key}=${value}`);
    } else {
      updated.push(`${key}=${value}`);
    }
  }
  const body = updated.join("\n");
  writeFileSync(path, body.endsWith("\n") ? body : `${body}\n`, "utf8");
  process.env[key] = value;
}
