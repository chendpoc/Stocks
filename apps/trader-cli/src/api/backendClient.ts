import ky from "ky";

import { traderBackendRoot } from "../config.js";
import { normalizePath } from "../utils/path.js";

const backendApi = ky.create({
  prefix: `${traderBackendRoot().replace(/\/$/, "")}/`,
  timeout: 30_000,
  retry: { limit: 2, methods: ["get"] },
});

export async function fetchBackend<T = unknown>(
  path: string,
  options?: { method?: "GET" | "POST"; json?: unknown },
): Promise<T> {
  const requestPath = normalizePath(path);
  if (options?.method === "POST" || options?.json !== undefined) {
    return backendApi.post(requestPath, { json: options?.json }).json<T>();
  }
  return backendApi.get(requestPath).json<T>();
}
