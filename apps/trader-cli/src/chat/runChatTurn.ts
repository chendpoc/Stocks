import type { CoreTool } from "ai";
import type { ChatMessage } from "../tui/types.js";
import { chatReAct, type ReActOptions, type ReActResult } from "../llm/chatReAct.js";
import { buildProcessedContext, hashProcessedContext } from "./processedContext.js";
import { buildPromptFrame } from "./promptFrame.js";
import { classifyTask, type TaskClassification } from "./taskRouter.js";
import { selectTools } from "./toolSelector.js";
import { createWorkspaceState, updateWorkspaceFromTurn } from "./memory/workspace.js";
import { buildDebugTrace } from "./debugTrace.js";
import { assertToolPermitted, evaluateToolPermission, type PermissionDecision } from "./permissionGate.js";

export type PreparedChatTurn = {
  classification: TaskClassification;
  processedContextId: string;
  activeTools: string[];
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

export function prepareChatTurn(input: {
  userMessage: string;
  messages: ChatMessage[];
  allTools: Record<string, CoreTool>;
  baseSystem: string;
  sessionKey?: string;
}): PreparedChatTurn & { frame: ReturnType<typeof buildPromptFrame> } {
  const sessionKey = input.sessionKey ?? "default";
  const workspace = workspaceForSession(sessionKey);
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
  const frame = buildPromptFrame({
    ctx: { ...ctx, id: processedContextId },
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
  const lastUser = input.userMessage;
  const ws = workspaceForSession(input.sessionKey ?? "default");
  sessionWorkspaces.set(
    input.sessionKey ?? "default",
    updateWorkspaceFromTurn(ws, { userMessage: lastUser }),
  );

  const result = await chatReAct({
    model: input.model,
    system: prepared.frame.system,
    messages: prepared.frame.messages,
    tools: prepared.frame.tools,
    activeTools: prepared.frame.activeTools,
    onStep: input.onStep,
    onTurnComplete: input.onTurnComplete,
    abortSignal: input.abortSignal,
  });

  const debugTraceJson = input.debug
    ? buildDebugTrace({
      classification: prepared.classification,
      activeTools: prepared.activeTools,
      reactResult: result,
    })
    : undefined;

  return {
    ...result,
    prepared: {
      classification: prepared.classification,
      processedContextId: prepared.processedContextId,
      activeTools: prepared.activeTools,
    },
    debugTraceJson: debugTraceJson ? JSON.stringify(debugTraceJson, null, 2) : undefined,
  };
}
