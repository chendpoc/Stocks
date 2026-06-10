import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { daemonCommand } from "../commands/daemon.js";
import { getAgentSystemPromptById } from "../llm/prompts/index.js";
import { spawn, getAgentFactoryInput } from "../daemon/agentFactory.js";
import {
  registerTool,
  resolveTools,
  type ToolGroup,
  type ToolScope,
} from "../llm/toolRegistry.js";
import { type CoreTool } from "ai";

function registerDummyTool(name: string, group: ToolGroup): void {
  const tool: CoreTool = {
    description: `${name} test tool`,
    parameters: z.object({}),
    execute: async () => ({ ok: true }),
  };

  try {
    registerTool({
      name,
      group,
      summary: `dummy ${group} tool`,
      implementation: tool,
    });
  } catch (error) {
    // Ignore duplicate registration for repeated test runs where registry is pre-populated.
    if (!(error instanceof Error && error.message.includes("already registered"))) {
      throw error;
    }
  }
}

test("getAgentSystemPromptById('daemon') returns non-empty prompt", () => {
  const prompt = getAgentSystemPromptById("daemon");
  assert.equal(typeof prompt, "string");
  assert.ok(prompt.length > 0);
});

test("resolveTools('daemon') uses market + sentiment + workflow and excludes longbridge/memory", () => {
  const scope: ToolScope = "daemon";

  registerDummyTool("daemon_dummy_market", "market");
  registerDummyTool("daemon_dummy_sentiment", "sentiment");
  registerDummyTool("daemon_dummy_workflow", "workflow");
  registerDummyTool("daemon_dummy_longbridge", "longbridge");
  registerDummyTool("daemon_dummy_memory", "memory");

  const tools = resolveTools(scope);

  assert.ok(Object.hasOwn(tools, "daemon_dummy_market"));
  assert.ok(Object.hasOwn(tools, "daemon_dummy_sentiment"));
  assert.ok(Object.hasOwn(tools, "daemon_dummy_workflow"));
  assert.ok(!Object.hasOwn(tools, "daemon_dummy_longbridge"));
  assert.ok(!Object.hasOwn(tools, "daemon_dummy_memory"));
});

test("daemonCommand status can be called without crash", async () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };

  try {
    await daemonCommand("status");
  } finally {
    console.log = originalLog;
  }

  const text = logs.join("\n");
  assert.ok(text.includes("running"));
});

test("agentFactory spawns with known agent spec", async () => {
  const pre = getAgentFactoryInput("pre-market");
  assert.equal(pre.agentId, "pre-market");
  assert.equal(pre.toolScope, "chat");

  const result = await spawn("mid-day-deep", {
    symbols: ["TSLA"],
    complexityScore: 0.2,
  });
  assert.equal(result.agentId, "mid-day-deep");
  assert.equal(result.prompt.length > 0, true);
  assert.equal(result.toolScope, "evidence");
  assert.deepEqual(result.inputs, {
    symbols: ["TSLA"],
    complexityScore: 0.2,
  });
  assert.equal(result.gate_decision?.symbols[0], "TSLA");
});
