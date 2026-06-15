import ky, { HTTPError } from "ky";
import { config } from "../runtime/config.js";
import type { AlphaResearchFetch } from "../types/alpha.js";
import { normalizePath } from "../utils/path.js";

export function ruleCandidatesBaseUrl(): string {
  const explicit = config.traderRuleCandidatesApiBase.replace(/\/$/, "");
  if (explicit) {
    return explicit;
  }
  const intelBase = config.traderApiBase.replace(/\/$/, "");
  if (intelBase.endsWith("/api/intel")) {
    return intelBase.replace(/\/api\/intel$/, "/api/rule-candidates");
  }
  return "http://127.0.0.1:8000/api/rule-candidates";
}

const ruleCandidatesApi = ky.create({
  prefix: `${ruleCandidatesBaseUrl()}/`,
  timeout: 30_000,
  retry: { limit: 2, methods: ["get"] },
  hooks: {
    beforeError: [
      (error) => {
        const { response } = error;
        if (response?.body) {
          error.message = `Rule Candidate API ${response.status}: ${response.statusText}`;
        }
        return error;
      },
    ],
  },
});

async function fetchRuleCandidatesLegacy<T>(
  fetchImpl: AlphaResearchFetch,
  path: string,
  options?: {
    method?: "GET" | "POST";
    json?: unknown;
  },
): Promise<T> {
  const base = ruleCandidatesBaseUrl();
  const url = path
    ? `${base}${path.startsWith("/") ? path : `/${path}`}`
    : base;
  const headers: Record<string, string> = {};
  const init: RequestInit = {
    method: options?.method ?? "GET",
    headers,
  };
  if (options?.json !== undefined) {
    init.method = "POST";
    init.body = JSON.stringify(options.json);
    headers["Content-Type"] = "application/json";
  }
  const response = await fetchImpl(url, init);
  if (!response.ok) {
    throw new Error(`Rule Candidate API ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

export async function fetchRuleCandidates<T>(
  path: string,
  options?: {
    method?: "GET" | "POST";
    json?: unknown;
  },
  fetchImpl?: AlphaResearchFetch,
): Promise<T> {
  if (fetchImpl) {
    return fetchRuleCandidatesLegacy<T>(fetchImpl, path, options);
  }

  const requestPath = normalizePath(path);
  const usePost = options?.method === "POST" || options?.json !== undefined;
  try {
    if (usePost) {
      const res = await ruleCandidatesApi.post(requestPath, {
        ...(options?.json !== undefined ? { json: options.json } : {}),
      });
      return res.json<T>();
    }
    const res = await ruleCandidatesApi.get(requestPath);
    return res.json<T>();
  } catch (error) {
    if (error instanceof HTTPError) {
      throw new Error(
        `Rule Candidate API ${error.response.status}: ${await error.response.text()}`,
      );
    }
    throw error;
  }
}
