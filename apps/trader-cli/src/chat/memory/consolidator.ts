import type { ChatMessage } from "../../tui/types.js";
import type { WorkspaceState } from "../processedContext.js";

export interface ConsolidationProposal {
  summary: string;
  proposedWrites: Array<{
    type: "lesson" | "note" | "hypothesis";
    payload: Record<string, unknown>;
    requiresConfirm: boolean;
  }>;
}

export function proposeSessionConsolidation(input: {
  messages: ChatMessage[];
  workspace: WorkspaceState;
}): ConsolidationProposal {
  const userTurns = input.messages.filter((m) => m.role === "user").map((m) => m.content);
  const assistantTurns = input.messages.filter((m) => m.role === "assistant").map((m) => m.content);
  const summary = [
    `Session ${input.workspace.sessionId}`,
    input.workspace.currentTopic ? `Topic: ${input.workspace.currentTopic}` : null,
    `Turns: ${userTurns.length} user / ${assistantTurns.length} assistant`,
    userTurns.length > 0 ? `Last user: ${userTurns.at(-1)?.slice(0, 120)}` : null,
  ].filter(Boolean).join(" · ");

  const proposedWrites: ConsolidationProposal["proposedWrites"] = [];
  if (userTurns.length > 0 && assistantTurns.length > 0) {
    proposedWrites.push({
      type: "lesson",
      payload: {
        summary: summary.slice(0, 500),
        source: "chat-consolidator",
        sessionId: input.workspace.sessionId,
      },
      requiresConfirm: true,
    });
  }

  return { summary, proposedWrites };
}

export function commitConsolidation(
  proposal: ConsolidationProposal,
  confirmed: boolean,
): { committed: boolean; reason: string } {
  if (!confirmed) {
    return { committed: false, reason: "User did not confirm long-term memory write" };
  }
  if (proposal.proposedWrites.length === 0) {
    return { committed: false, reason: "No writes proposed" };
  }
  return {
    committed: false,
    reason: "Long-term write path not wired — proposal only (Permission Gate confirm received)",
  };
}
