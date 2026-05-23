import { NextResponse } from "next/server";

const AUTH_ERROR =
  "Research console API is disabled in production without RESEARCH_CONSOLE_ACCESS_TOKEN.";

export function isAuthorizedResearchConsoleRequest(request: Request) {
  if (process.env.NODE_ENV !== "production") return true;
  const expectedToken = process.env.RESEARCH_CONSOLE_ACCESS_TOKEN;
  if (!expectedToken) return false;
  return request.headers.get("x-research-console-token") === expectedToken;
}

export function researchConsoleForbiddenResponse() {
  return NextResponse.json({ error: AUTH_ERROR }, { status: 403 });
}
