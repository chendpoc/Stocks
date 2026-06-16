import type { WorkspaceState } from "../processedContext.js";

let sessionCounter = 0;

export function createWorkspaceState(sessionId?: string): WorkspaceState {
  sessionCounter += 1;
  return {
    sessionId: sessionId ?? `sess_${Date.now()}_${sessionCounter}`,
    currentTopic: undefined,
    openQuestions: [],
    pendingActions: [],
    stepCount: 0,
    lastStep: undefined,
  };
}

export function updateWorkspaceFromTurn(
  workspace: WorkspaceState,
  input: {
    userMessage: string;
    assistantText?: string;
    stepCount?: number;
    lastStep?: string;
  },
): WorkspaceState {
  const topic = input.userMessage.slice(0, 80);
  return {
    ...workspace,
    currentTopic: topic,
    stepCount: input.stepCount ?? workspace.stepCount + 1,
    lastStep: input.lastStep ?? workspace.lastStep,
    openQuestions: workspace.openQuestions,
    pendingActions: workspace.pendingActions,
  };
}

export function appendOpenQuestion(workspace: WorkspaceState, question: string): WorkspaceState {
  return {
    ...workspace,
    openQuestions: [...workspace.openQuestions, question].slice(-10),
  };
}

export function appendPendingAction(workspace: WorkspaceState, action: string): WorkspaceState {
  return {
    ...workspace,
    pendingActions: [...workspace.pendingActions, action].slice(-10),
  };
}
