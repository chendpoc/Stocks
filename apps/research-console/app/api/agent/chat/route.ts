import { NextResponse } from "next/server";
import type { AgentChatMessage } from "@stock-summary/summary-core";
import {
  isAuthorizedResearchConsoleRequest,
  researchConsoleForbiddenResponse,
} from "../../../../lib/api-auth";
import { runResearchAgent } from "../../../../lib/agent-kernel";

type ChatRequest = {
  day?: string;
  message?: string;
  messages?: AgentChatMessage[];
};

function latestBeijingDay() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(request: Request) {
  if (!isAuthorizedResearchConsoleRequest(request)) {
    return researchConsoleForbiddenResponse();
  }

  const body = (await request.json().catch(() => ({}))) as ChatRequest;
  const day = body.day || latestBeijingDay();
  const message = body.message || "";
  const agentResponse = await runResearchAgent({ day, message, messages: body.messages });

  return NextResponse.json(agentResponse);
}
