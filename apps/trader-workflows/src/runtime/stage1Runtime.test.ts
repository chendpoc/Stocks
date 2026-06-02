import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Stage1CheckpointStore } from "./checkpointStore.js";
import { Stage1Runtime } from "./stage1Runtime.js";

function createTempCheckpointDbPath(): { tempDir: string; dbPath: string } {
  const tempDir = mkdtempSync(resolve(tmpdir(), "stage1-runtime-"));
  return {
    tempDir,
    dbPath: resolve(tempDir, "checkpoints.sqlite"),
  };
}

test("Stage1 runtime uses temporary checkpoint DB and keeps market_intel untouched", () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");
  const marketIntelPath = resolve(repoRoot, "data/market_intel.db");
  const beforeMtime = existsSync(marketIntelPath)
    ? statSync(marketIntelPath).mtimeMs
    : null;

  const { tempDir, dbPath } = createTempCheckpointDbPath();
  const store = new Stage1CheckpointStore({ dbPath });
  const runtime = new Stage1Runtime(store);

  try {
    const interrupted = runtime.startRun({
      graph_name: "DecisionGraph",
      input: { symbol: "TSLA.US" },
      interrupt_after_bootstrap: true,
    });
    assert.equal(interrupted.status, "interrupted");
    assert.equal(resolve(store.dbPath), resolve(dbPath));
    assert.notEqual(resolve(store.dbPath), resolve(marketIntelPath));

    const resumed = runtime.resumeRun(interrupted.run_id);
    assert.equal(resumed.status, "succeeded");
    assert.ok(resumed.checkpoints.length >= 2);
  } finally {
    runtime.close();
    rmSync(tempDir, { recursive: true, force: true });
  }

  if (beforeMtime !== null && existsSync(marketIntelPath)) {
    const afterMtime = statSync(marketIntelPath).mtimeMs;
    assert.equal(afterMtime, beforeMtime);
  }
});

test("Stage1 runtime supports runs list/show/resume primitives", () => {
  const { tempDir, dbPath } = createTempCheckpointDbPath();
  const runtime = new Stage1Runtime(new Stage1CheckpointStore({ dbPath }));

  try {
    const interrupted = runtime.startRun({
      graph_name: "OutcomeGraph",
      interrupt_after_bootstrap: true,
    });
    const completed = runtime.startRun({ graph_name: "EvaluationGraph" });

    const listed = runtime.listRuns(10);
    assert.ok(listed.some((run) => run.run_id === interrupted.run_id));
    assert.ok(listed.some((run) => run.run_id === completed.run_id));

    const shown = runtime.showRun(interrupted.run_id);
    assert.equal(shown.status, "interrupted");
    assert.equal(shown.graph_name, "OutcomeGraph");
    assert.ok(shown.checkpoints.length >= 1);

    const resumed = runtime.resumeRun(interrupted.run_id);
    assert.equal(resumed.status, "succeeded");
    assert.ok(resumed.checkpoints.some((cp) => cp.node_name === "complete"));

    assert.throws(
      () => runtime.resumeRun(completed.run_id),
      /not resumable; expected interrupted/,
    );
  } finally {
    runtime.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
