const BASE = process.env.TRADER_API_BASE?.replace(/\/api\/intel\/?$/, "") ?? "http://127.0.0.1:8000";

async function fetchGuidedPaper(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`guided-paper ${response.status}: ${text}`);
  }
  return response.json();
}

export async function registerExecutionPolicy(policy: Record<string, unknown>): Promise<unknown> {
  return fetchGuidedPaper("/api/guided-paper/execution-policies", {
    method: "POST",
    body: JSON.stringify({ policy }),
  });
}

export async function getExecutionPolicy(executionPolicyId: string): Promise<unknown> {
  return fetchGuidedPaper(
    `/api/guided-paper/execution-policies/${encodeURIComponent(executionPolicyId)}`,
  );
}

export interface GuidedPaperRunInput {
  execution_policy_id: string;
  symbol: string;
  direction?: string;
  quantity?: number;
  approval_granted?: boolean;
}

export async function runGuidedPaperExploration(input: GuidedPaperRunInput): Promise<unknown> {
  return fetchGuidedPaper("/api/guided-paper/runs", {
    method: "POST",
    body: JSON.stringify({
      execution_policy_id: input.execution_policy_id,
      symbol: input.symbol,
      direction: input.direction ?? "buy",
      quantity: input.quantity ?? 1,
      approval_granted: input.approval_granted ?? false,
    }),
  });
}
