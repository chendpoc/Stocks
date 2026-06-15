/**
 * HTTP client layer backed by ky.
 * Provides typed fetch functions for the Intel API and Stage1 API
 * with built-in timeout, retry, and error normalization.
 */

import ky, { HTTPError } from "ky";
import { config } from "../runtime/config.js";
import { logger } from "../runtime/logger.js";

/* ───────── Intel API ───────── */

const intelBase = config.traderApiBase.replace(/\/$/, "");

const intelApi = ky.create({
  prefix: `${intelBase}/`,
  timeout: 30_000,
  retry: { limit: 2, methods: ["get"] },
  hooks: {
    beforeRetry: [
      ({ request, retryCount, error }) => {
        logger.warn(
          { url: request.url, retryCount, err: error.message },
          "HTTP request retry",
        );
      },
    ],
    beforeError: [
      (error) => {
        if (error instanceof HTTPError && error.response?.body) {
          error.message = `Intel API ${error.response.status}: ${error.response.statusText}`;
        }
        return error as unknown as Error;
      },
    ],
  },
});

/* ───────── Stage1 API ───────── */

const stage1Api = intelApi.extend({
  prefix: `${intelBase}/stage1/`,
});

/* ───────── Exports ───────── */

export type ApiSuccessResponse<T> = T;

export interface ApiErrorBody {
  detail?: string | Array<{ loc?: unknown[]; msg?: string; type?: string }>;
  message?: string;
  [key: string]: unknown;
}

export type ApiResponse<T> = ApiSuccessResponse<T>;

export class Stage1ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "Stage1ApiError";
    this.status = status;
  }

  static fromKyError(error: HTTPError): Stage1ApiError {
    return new Stage1ApiError(
      error.response.status,
      `Stage1 API ${error.response.status}: ${error.response.statusText}`,
    );
  }
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

export async function fetchIntel<T = unknown>(
  path: string,
  options?: {
    json?: unknown;
    method?: "GET" | "POST";
    searchParams?: Record<string, string | number | boolean | undefined | null>;
  },
): Promise<T> {
  const cleanParams = filterUndefined(options?.searchParams);
  const usePost = options?.method === "POST" || options?.json !== undefined;
  const requestPath = normalizePath(path);
  if (usePost) {
    const res = await intelApi.post(requestPath, {
      ...(options?.json !== undefined ? { json: options.json } : {}),
      searchParams: cleanParams,
    });
    return res.json<T>();
  }
  const res = await intelApi.get(requestPath, { searchParams: cleanParams });
  return res.json<T>();
}

export async function fetchStage1<T = unknown>(
  path: string,
  options?: {
    json?: unknown;
    method?: "GET" | "POST";
    searchParams?: Record<string, string | number | boolean | undefined | null>;
  },
): Promise<T> {
  const cleanParams = filterUndefined(options?.searchParams);
  try {
    const usePost = options?.method === "POST" || options?.json !== undefined;
    const requestPath = normalizePath(path);
    if (usePost) {
      const res = await stage1Api.post(requestPath, {
        ...(options?.json !== undefined ? { json: options.json } : {}),
        searchParams: cleanParams,
      });
      return res.json<T>();
    }
    const res = await stage1Api.get(requestPath, { searchParams: cleanParams });
    return res.json<T>();
  } catch (error) {
    if (error instanceof HTTPError) {
      throw Stage1ApiError.fromKyError(error);
    }
    throw error;
  }
}

function filterUndefined(
  params?: Record<string, string | number | boolean | undefined | null>,
): Record<string, string | number | boolean> | undefined {
  if (!params) return undefined;
  const result: Record<string, string | number | boolean> = {};
  let hasEntries = false;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    result[key] = value;
    hasEntries = true;
  }
  return hasEntries ? result : undefined;
}
