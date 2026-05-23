import { NextResponse } from "next/server";
import {
  isAuthorizedResearchConsoleRequest,
  researchConsoleForbiddenResponse,
} from "../../../../lib/api-auth";
import { listResearchToolReadiness } from "../../../../lib/tool-policy";

export async function GET(request: Request) {
  if (!isAuthorizedResearchConsoleRequest(request)) {
    return researchConsoleForbiddenResponse();
  }

  return NextResponse.json({
    tools: listResearchToolReadiness(),
  });
}
