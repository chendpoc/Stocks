import assert from "node:assert/strict";
import test from "node:test";
import { extractWorkflowRunsFromGenerateText } from "./chatWorkflowRuns.js";

test("extractWorkflowRunsFromGenerateText uses real runWorkflow result ids", () => {
  const runs = extractWorkflowRunsFromGenerateText({
    steps: [
      {
        toolCalls: [
          {
            toolCallId: "call-1",
            args: {
              workflowId: "decision",
              inputs: { symbols: ["TSLA", "NVDA"] },
            },
          },
        ],
        toolResults: [
          {
            toolCallId: "call-1",
            toolName: "runWorkflow",
            result: { runId: "wf-real-123" },
          },
        ],
      },
    ],
  });

  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.runId, "wf-real-123");
  assert.equal(runs[0]?.workflowId, "decision");
  assert.equal(runs[0]?.label, "TSLA, NVDA");
});

test("extractWorkflowRunsFromGenerateText ignores non-workflow tool results", () => {
  const runs = extractWorkflowRunsFromGenerateText({
    steps: [
      {
        toolCalls: [{ toolCallId: "call-1", args: { workflowId: "decision" } }],
        toolResults: [
          {
            toolCallId: "call-1",
            toolName: "fetchQuote",
            result: { runId: "not-a-workflow" },
          },
        ],
      },
    ],
  });

  assert.deepEqual(runs, []);
});
