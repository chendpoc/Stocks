import assert from "node:assert/strict";
import test from "node:test";
import {
  appendOpenQuestion,
  createWorkspaceState,
  updateWorkspaceFromTurn,
} from "./workspace.js";
import { proposeSessionConsolidation, commitConsolidation } from "./consolidator.js";
import { readSemanticMemory } from "./semantic.js";

test("workspace tracks session topic and step count", () => {
  const ws = createWorkspaceState("sess_ws");
  const updated = updateWorkspaceFromTurn(ws, {
    userMessage: "分析 TSLA",
    stepCount: 1,
    lastStep: "classify",
  });
  assert.equal(updated.sessionId, "sess_ws");
  assert.equal(updated.currentTopic, "分析 TSLA");
  assert.equal(updated.stepCount, 1);
  const withQ = appendOpenQuestion(updated, "支撑位在哪？");
  assert.equal(withQ.openQuestions.length, 1);
});

test("consolidator proposes lesson write with confirm", () => {
  const ws = createWorkspaceState();
  const proposal = proposeSessionConsolidation({
    workspace: ws,
    messages: [
      { role: "user", content: "TSLA?" },
      { role: "assistant", content: "holding" },
    ],
  });
  assert.ok(proposal.summary.includes("sess_"));
  assert.equal(proposal.proposedWrites[0]?.requiresConfirm, true);
  const commit = commitConsolidation(proposal, true);
  assert.equal(commit.committed, false);
  assert.ok(commit.reason.includes("proposal only"));
});

test("semantic read blocked without adapter", async () => {
  const result = await readSemanticMemory({ query: "TSLA momentum" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.blocked.includes("searchCorpus"));
  }
});
