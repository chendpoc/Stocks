const BASE = process.env.TRADER_API_BASE ?? "http://127.0.0.1:8000/api/intel";

function apiRoot(): string {
  return BASE.replace(/\/api\/intel\/?$/, "");
}

export async function fetchHealth(): Promise<{
  status: string;
  intel_route_count: number;
}> {
  const response = await fetch(`${apiRoot()}/health`);
  if (!response.ok) {
    throw new Error(`Health ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

export async function fetchIntel(
  path: string,
  options: RequestInit = {},
): Promise<any> {
  const url = `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 404 && BASE.includes("/api/intel")) {
      throw new Error(
        [
          `Intel API 404: ${text}`,
          `请求: ${url}`,
          "当前 :8000 上的进程很可能未挂载 /api/intel（Windows 上多次热重载会留下旧 uvicorn）。",
          "处理: 结束占用 8000 的监听进程后，再执行 npm run trader-agent:backend:dev",
          "PowerShell: Get-NetTCPConnection -LocalPort 8000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }",
        ].join("\n"),
      );
    }
    throw new Error(`Intel API ${response.status}: ${text}`);
  }
  return response.json();
}
