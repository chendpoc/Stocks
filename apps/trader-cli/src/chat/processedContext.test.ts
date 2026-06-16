import assert from "node:assert/strict";
import test from "node:test";
import type { ChatMessage } from "../tui/types.js";
import { buildProcessedContext, hashProcessedContext } from "./processedContext.js";
import { buildPromptFrame, renderPromptFrameSystem } from "./promptFrame.js";
import { createWorkspaceState } from "./memory/workspace.js";

test("ProcessedContext includes all seven layers", () => {
  const workspace = createWorkspaceState("sess_test");
  const ctx = buildProcessedContext({
    userMessage: "TSLA 现在多少？",
    messages: [{ role: "user", content: "TSLA 现在多少？" }],
    mode: "quick",
    toolViews: [{ name: "getMarketBars", group: "market", summary: "bars", selected: true }],
    workspace,
  });

  assert.equal(ctx.version, "chat-processed-context/v1");
  assert.ok(ctx.core.identity);
  assert.ok(ctx.marketContext);
  assert.ok(ctx.task);
  assert.ok(ctx.tools.length > 0);
  assert.ok(ctx.retrieved);
  assert.ok(ctx.workspace.sessionId);
  assert.equal(ctx.riskPolicy.tradeActions, "blocked");
  assert.ok(ctx.sourceTrace.length >= 7);
  assert.ok(ctx.tokenBudget.totalEstimated > 0);
});

test("renderPromptFrameSystem is deterministic for same input", () => {
  const workspace = createWorkspaceState("sess_det");
  const messages: ChatMessage[] = [{ role: "user", content: "Analyze NVDA" }];
  const input = {
    userMessage: "Analyze NVDA",
    messages,
    mode: "analysis" as const,
    toolViews: [{ name: "buildContext", group: "market", summary: "ctx", selected: true }],
    workspace,
  };
  const ctx = buildProcessedContext(input);
  const a = renderPromptFrameSystem(ctx);
  const b = renderPromptFrameSystem(ctx);
  assert.equal(a, b);
});

test("buildPromptFrame adapts to chatReAct-compatible fields", () => {
  const workspace = createWorkspaceState();
  const ctx = buildProcessedContext({
    userMessage: "hello",
    messages: [{ role: "user", content: "hello" }] satisfies ChatMessage[],
    mode: "analysis" as const,
    toolViews: [],
    workspace,
  });
  const frame = buildPromptFrame({
    ctx,
    baseSystem: "base",
    messages: [{ role: "user", content: "hello" }] satisfies ChatMessage[],
    tools: {},
    activeTools: ["getMarketBars"],
    processedContextId: hashProcessedContext(ctx),
  });
  assert.ok(frame.system.includes("ProcessedContext"));
  assert.equal(frame.activeTools[0], "getMarketBars");
  assert.equal(frame.processedContextId, hashProcessedContext(ctx));
});
