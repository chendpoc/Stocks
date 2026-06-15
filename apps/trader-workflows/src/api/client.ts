const BASE = process.env.TRADER_API_BASE ?? "http://127.0.0.1:8000/api/intel";

/** Parsed JSON body returned by the Intel API on HTTP 2xx. */
export type ApiSuccessResponse<T> = T;

/**
 * Common FastAPI-style error fields in non-2xx response bodies.
 * `fetchIntel` and `fetchStage1` throw instead of returning this shape.
 */
export interface ApiErrorBody {
  detail?: string | Array<{ loc?: unknown[]; msg?: string; type?: string }>;
  message?: string;
  [key: string]: unknown;
}

/**
 * Contract for Intel / Stage1 HTTP JSON payloads.
 * On success, callers receive the parsed body as `T`.
 * On failure, `fetchIntel` throws `Error` and `fetchStage1` throws {@link Stage1ApiError}.
 */
export type ApiResponse<T> = ApiSuccessResponse<T>;

export class Stage1ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function stage1Base(): string {
  return `${BASE.replace(/\/$/, "")}/stage1`;
}

function intelBase(): string {
  return BASE.replace(/\/$/, "");
}

export async function fetchIntel<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${intelBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    throw new Error(`Intel API ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

export async function fetchStage1<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${stage1Base()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    throw new Stage1ApiError(
      response.status,
      `Stage1 API ${response.status}: ${await response.text()}`,
    );
  }
  return (await response.json()) as T;
}
