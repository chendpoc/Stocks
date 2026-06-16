import { fetchBackend } from "../api/backendClient.js";

export async function registerExecutionPolicy(policy: Record<string, unknown>): Promise<unknown> {
  return fetchBackend("/api/guided-paper/execution-policies", {
    method: "POST",
    json: { policy },
  });
}

export async function getExecutionPolicy(executionPolicyId: string): Promise<unknown> {
  return fetchBackend(
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
  return fetchBackend("/api/guided-paper/runs", {
    method: "POST",
    json: {
      execution_policy_id: input.execution_policy_id,
      symbol: input.symbol,
      direction: input.direction ?? "buy",
      quantity: input.quantity ?? 1,
      approval_granted: input.approval_granted ?? false,
    },
  });
}
