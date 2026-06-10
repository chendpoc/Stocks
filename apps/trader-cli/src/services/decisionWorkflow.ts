import { invokeWorkflowJson, type WorkflowEnvelope } from "./workflowRunner.js";

export type GateDecisionPayload = {
  complexity_score: number;
  symbols: string[];
  setups?: Record<string, string>;
};

export type RunDecisionWorkflowInput = {
  symbol: string;
  setup_name?: string;
  gate_decision?: GateDecisionPayload;
};

export function runDecisionWorkflow(
  input: RunDecisionWorkflowInput,
): WorkflowEnvelope {
  const args = ["decide", input.symbol.toUpperCase()];
  if (input.setup_name) {
    args.push("--setup", input.setup_name);
  }
  if (input.gate_decision) {
    args.push("--gate-json", JSON.stringify(input.gate_decision));
  }
  return invokeWorkflowJson(args);
}
