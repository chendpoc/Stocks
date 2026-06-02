const BASE = process.env.TRADER_API_BASE ?? "http://127.0.0.1:8000/api/intel";

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
