import type { CoreTool } from "ai";
import type { ChatMessage } from "../tui/types.js";
import { chatReAct, type ReActOptions, type ReActResult } from "../llm/chatReAct.js";
import { buildProcessedContext, hashProcessedContext, type ProcessedContext } from "./processedContext.js";
import { buildPromptFrame } from "./promptFrame.js";
import { classifyTask, type TaskClassification } from "./taskRouter.js";
import { selectTools } from "./toolSelector.js";
import { createWorkspaceState, updateWorkspaceFromTurn } from "./memory/workspace.js";
import { buildDebugTrace } from "./debugTrace.js";
import { evaluateToolPermission, type PermissionDecision } from "./permissionGate.js";

export type PreparedChatTurn = {
  classification: TaskClassification;
  processedContextId: string;
  activeTools: string[];
  ctx: ProcessedContext;
};

const sessionWorkspaces = new Map<string, ReturnType<typeof createWorkspaceState>>();

function workspaceForSession(sessionKey: string) {
  let ws = sessionWorkspaces.get(sessionKey);
  if (!ws) {
    ws = createWorkspaceState(sessionKey);
    sessionWorkspaces.set(sessionKey, ws);
  }
  return ws;
}

export function filterActiveToolsByPermission(activeTools: string[]): {
  filteredActiveTools: string[];
  permissionDecisions: PermissionDecision[];
} {
  const permissionDecisions = activeTools.map(evaluateToolPermission);
  const blockedTools = new Set(
    permissionDecisions.filter((d) => !d.allowed).map((d) => d.toolName),
  );
  return {
    filteredActiveTools: activeTools.filter((t) => !blockedTools.has(t)),
    permissionDecisions,
  };
}

export function prepareChatTurn(input: {
  userMessage: string;
  messages: ChatMessage[];
  allTools: Record<string, CoreTool>;
  baseSystem: string;
  sessionKey?: string;
}): PreparedChatTurn & { frame: ReturnType<typeof buildPromptFrame> } {
  const sessionKey = input.sessionKey ?? "default";
  const workspace = updateWorkspaceFromTurn(
    workspaceForSession(sessionKey),
    { userMessage: input.userMessage },
  );
  sessionWorkspaces.set(sessionKey, workspace);
  const classification = classifyTask(input.userMessage, workspace);
  const selection = selectTools(classification, input.allTools);
  const ctx = buildProcessedContext({
    userMessage: input.userMessage,
    messages: input.messages,
    mode: classification.mode,
    toolViews: selection.toolViews,
    workspace,
    budgetLimit: classification.contextBudget,
  });
  const processedContextId = hashProcessedContext(ctx);
  const ctxWithId: ProcessedContext = { ...ctx, id: processedContextId };
  const frame = buildPromptFrame({
    ctx: ctxWithId,
    baseSystem: input.baseSystem,
    messages: input.messages,
    tools: selection.tools,
    activeTools: selection.activeTools,
    processedContextId,
  });

  return {
    classification,
    processedContextId,
    activeTools: selection.activeTools,
    ctx: ctxWithId,
    frame,
  };
}

export async function runChatTurn(
  input: {
    userMessage: string;
    messages: ChatMessage[];
    allTools: Record<string, CoreTool>;
    baseSystem: string;
    model: ReActOptions["model"];
    sessionKey?: string;
    debug?: boolean;
  } & Pick<ReActOptions, "onStep" | "onTurnComplete" | "abortSignal">,
): Promise<ReActResult & { debugTraceJson?: string; prepared: PreparedChatTurn }> {
  const prepared = prepareChatTurn(input);

  const { filteredActiveTools, permissionDecisions } = filterActiveToolsByPermission(
    prepared.frame.activeTools,
  );

  const result = await chatReAct({
    model: input.model,
    system: prepared.frame.system,
    messages: prepared.frame.messages,
    tools: prepared.frame.tools,
    activeTools: filteredActiveTools,
    onStep: input.onStep,
    onTurnComplete: input.onTurnComplete,
    abortSignal: input.abortSignal,
  });

  const debugTraceJson = input.debug
    ? buildDebugTrace({
      processedContext: prepared.ctx,
      classification: prepared.classification,
      activeTools: filteredActiveTools,
      permissionDecisions,
      reactResult: result,
    })
    : undefined;

  return {
    ...result,
    prepared: {
      classification: prepared.classification,
      processedContextId: prepared.processedContextId,
      activeTools: filteredActiveTools,
      ctx: prepared.ctx,
    },
    debugTraceJson: debugTraceJson ? JSON.stringify(debugTraceJson, null, 2) : undefined,
  };
}
