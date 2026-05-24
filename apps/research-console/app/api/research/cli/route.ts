import { NextResponse } from "next/server";
import {
  buildRejectedCliTrace,
  executeApprovedCliTool,
  executeResearchTool,
} from "../../../../lib/agent-tools";
import {
  isAuthorizedResearchConsoleRequest,
  researchConsoleForbiddenResponse,
} from "../../../../lib/api-auth";
import { authorizeResearchTool } from "../../../../lib/tool-policy";

type CliRequest = {
  action?: "preview" | "approve" | "reject";
  command?: string;
  args?: string;
  cwd?: string;
  timeoutMs?: string;
  envKeys?: string;
};

function cliInput(body: CliRequest): Record<string, string> {
  return {
    command: String(body.command ?? ""),
    args: String(body.args ?? ""),
    cwd: String(body.cwd ?? ""),
    timeoutMs: String(body.timeoutMs ?? ""),
    envKeys: String(body.envKeys ?? ""),
  };
}

export async function POST(request: Request) {
  if (!isAuthorizedResearchConsoleRequest(request)) {
    return researchConsoleForbiddenResponse();
  }

  const body = (await request.json().catch(() => ({}))) as CliRequest;
  const action = body.action ?? "preview";
  const input = cliInput(body);
  const policy = authorizeResearchTool("cli_execute");

  if (policy.status !== "allowed") {
    return NextResponse.json({ policy, tool: { name: "cli_execute", input } }, { status: 403 });
  }

  if (action === "approve") {
    return NextResponse.json({ policy, tool: await executeApprovedCliTool(input) });
  }

  if (action === "reject") {
    return NextResponse.json({ policy, tool: buildRejectedCliTrace(input) });
  }

  return NextResponse.json({
    policy,
    tool: await executeResearchTool({ name: "cli_execute", input }, {
      day: "local-cli",
      eventSummary: [],
      overview: [],
      adminCore: [],
      adminSymbols: [],
      risks: [],
    }),
  });
}
