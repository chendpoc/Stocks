import ky, { HTTPError } from "ky";

import { config, traderBackendRoot } from "../config.js";
import { normalizePath } from "../utils/path.js";

const intelBase = config.traderApiBase.replace(/\/$/, "");

function intel404Message(text: string, url: string): string {
  return [
    `Intel API 404: ${text}`,
    `请求: ${url}`,
    "当前 :8000 上的进程很可能未挂载 /api/intel（Windows 上多次热重载会留下旧 uvicorn）。",
    "处理: 结束占用 8000 的监听进程后，再执行 npm run trader-agent:backend:dev",
    "PowerShell: Get-NetTCPConnection -LocalPort 8000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }",
  ].join("\n");
}

const intelApi = ky.create({
  prefix: `${intelBase}/`,
  timeout: 30_000,
  retry: { limit: 2, methods: ["get"] },
  hooks: {
    beforeError: [
      async (error) => {
        if (error instanceof HTTPError) {
          const text = await error.response.text();
          const url = error.request.url;
          if (error.response.status === 404 && intelBase.includes("/api/intel")) {
            error.message = intel404Message(text, url);
          } else {
            error.message = `Intel API ${error.response.status}: ${text || error.response.statusText}`;
          }
        }
        return error as unknown as Error;
      },
    ],
  },
});

export async function fetchHealth(): Promise<{
  status: string;
  intel_route_count: number;
}> {
  const response = await ky.get(`${traderBackendRoot()}/health`, { timeout: 30_000 });
  if (!response.ok) {
    throw new Error(`Health ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

/** 包装 fetchIntel 调用，统一捕获异常为 { ok:false, code, message } 格式 */
export async function safeFetchIntel(
  path: string,
  options: RequestInit = {},
): Promise<{ ok: false; code: string; message: string } | unknown> {
  try {
    return await fetchIntel(path, options);
  } catch (e: unknown) {
    if (e instanceof HTTPError) {
      let detail = e.response.statusText;
      try {
        detail = await e.response.text();
      } catch {
        /* body may already be consumed */
      }
      const url = e.request.url;
      if (e.response.status === 404 && intelBase.includes("/api/intel")) {
        return {
          ok: false,
          code: "INTEL_ERROR",
          message: intel404Message(detail, url),
        };
      }
      return {
        ok: false,
        code: "INTEL_ERROR",
        message: `Intel API ${e.response.status}: ${detail}`,
      };
    }
    return {
      ok: false,
      code: "INTEL_ERROR",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function fetchIntel(
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  const requestPath = normalizePath(path);
  const method = options.method?.toUpperCase() ?? "GET";

  if (method === "POST") {
    const init: { json?: unknown } = {};
    if (options.body) {
      init.json = JSON.parse(String(options.body));
    }
    return intelApi.post(requestPath, init).json();
  }

  return intelApi.get(requestPath).json();
}
