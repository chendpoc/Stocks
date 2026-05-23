import { NextResponse } from "next/server";
import {
  isAuthorizedResearchConsoleRequest,
  researchConsoleForbiddenResponse,
} from "../../../../lib/api-auth";
import { listMarketDataSources } from "../../../../lib/market-data-sources";

export async function GET(request: Request) {
  if (!isAuthorizedResearchConsoleRequest(request)) {
    return researchConsoleForbiddenResponse();
  }

  return NextResponse.json({
    sources: listMarketDataSources(),
  });
}
