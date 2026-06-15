import type { Stage1RunStatus } from "../runtime/checkpointStore.js";

export interface WorkflowError {
  code: string;
  message: string;
  details?: unknown;
}

export interface WorkflowEnvelope {
  ok: boolean;
  command: string;
  run_id: string | null;
  status: Stage1RunStatus | null;
  data: Record<string, unknown> | null;
  error: WorkflowError | null;
}

export const OUTCOME_LIST_STATUSES = ["pending", "labeled", "skipped", "failed"] as const;
export type OutcomeListStatus = (typeof OUTCOME_LIST_STATUSES)[number];
