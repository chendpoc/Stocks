export type PermissionPolicy = "auto" | "auto_log" | "confirm" | "blocked";

export type PermissionActionClass =
  | "read_market"
  | "read_research"
  | "low_risk_write"
  | "memory_write"
  | "external_notify"
  | "trade";

export interface PermissionDecision {
  actionClass: PermissionActionClass;
  policy: PermissionPolicy;
  toolName: string;
  allowed: boolean;
  reason: string;
}

const TRADE_TOOL_PATTERNS = [
  /^submitOrder/i,
  /^placeOrder/i,
  /^cancelOrder/i,
  /trade/i,
  /broker/i,
];

const MEMORY_WRITE_TOOLS = new Set(["saveHypothesis"]);

const LOW_RISK_WRITE_TOOLS = new Set<string>([]);

function classifyTool(toolName: string): PermissionActionClass {
  if (TRADE_TOOL_PATTERNS.some((p) => p.test(toolName))) return "trade";
  if (MEMORY_WRITE_TOOLS.has(toolName)) return "memory_write";
  if (LOW_RISK_WRITE_TOOLS.has(toolName)) return "low_risk_write";
  if (toolName.startsWith("get") || toolName.startsWith("list") || toolName.startsWith("fetch") || toolName.startsWith("search") || toolName.startsWith("describe") || toolName.startsWith("scan") || toolName.startsWith("build") || toolName.startsWith("query") || toolName === "longbridgeInvoke" || toolName === "runWorkflow" || toolName === "getWorkflowStatus" || toolName === "listWorkflows" || toolName === "ingestMarketData" || toolName === "ingestSymbolBars" || toolName === "analyzeSentiment" || toolName === "extractNewsSignal" || toolName === "webSearch" || toolName === "fetchUrl") {
    return "read_market";
  }
  return "read_research";
}

function policyForAction(action: PermissionActionClass): PermissionPolicy {
  switch (action) {
    case "trade":
      return "blocked";
    case "memory_write":
      return "confirm";
    case "external_notify":
      return "confirm";
    case "low_risk_write":
      return "auto_log";
    case "read_market":
    case "read_research":
    default:
      return "auto";
  }
}

export function evaluateToolPermission(toolName: string): PermissionDecision {
  const actionClass = classifyTool(toolName);
  const policy = policyForAction(actionClass);
  const allowed = policy === "auto" || policy === "auto_log";
  return {
    actionClass,
    policy,
    toolName,
    allowed,
    reason: allowed
      ? `read-only or auto-log: ${actionClass}`
      : `${policy} required for ${actionClass}`,
  };
}

export function assertToolPermitted(toolName: string): PermissionDecision {
  const decision = evaluateToolPermission(toolName);
  if (!decision.allowed) {
    throw new Error(`Permission gate blocked tool "${toolName}": ${decision.reason}`);
  }
  return decision;
}
