import { randomUUID } from "node:crypto";

/** UUID without hyphens (32 hex chars). */
export function compactUuid(): string {
  return randomUUID().replace(/-/g, "");
}

/** `{prefix}{compactUuid}` — e.g. prefixedId("run_") → run_a1b2c3... */
export function prefixedId(prefix: string): string {
  return `${prefix}${compactUuid()}`;
}
