import { randomUUID } from "node:crypto";
import "@langchain/langgraph";
import {
  type Stage1CheckpointRecord,
  Stage1CheckpointStore,
  type Stage1RunDetail,
  type Stage1RunStatus,
  type Stage1RunSummary,
} from "./checkpointStore.js";

export interface Stage1RuntimeRunView extends Stage1RunDetail {
  checkpoints: Stage1CheckpointRecord[];
}

export interface Stage1RuntimeStartOptions {
  graph_name?: string;
  input?: Record<string, unknown>;
  interrupt_after_bootstrap?: boolean;
}

export class Stage1Runtime {
  private readonly store: Stage1CheckpointStore;

  constructor(store?: Stage1CheckpointStore) {
    this.store = store ?? new Stage1CheckpointStore();
  }

  startRun(options?: Stage1RuntimeStartOptions): Stage1RuntimeRunView {
    const runId = `run_${randomUUID().replace(/-/g, "")}`;
    const graphName = options?.graph_name ?? "stage1-foundation";
    const created = this.store.createRun({
      run_id: runId,
      graph_name: graphName,
      status: "queued",
      input: options?.input ?? {},
    });

    this.store.updateRun(runId, {
      status: "running",
      current_node: "bootstrap",
      started_at: created.started_at ?? new Date().toISOString(),
      latest_error: null,
    });

    this.store.appendCheckpoint({
      run_id: runId,
      node_name: "bootstrap",
      state: {
        stage: "bootstrap",
        graph_name: graphName,
        runtime: "@langchain/langgraph",
      },
    });

    if (options?.interrupt_after_bootstrap) {
      this.store.updateRun(runId, {
        status: "interrupted",
        current_node: "bootstrap",
      });
      return this.showRun(runId);
    }

    this.finalizeRunSucceeded(runId, {
      resumed: false,
      from_node: "bootstrap",
    });
    return this.showRun(runId);
  }

  listRuns(limit = 50): Stage1RunSummary[] {
    return this.store.listRuns(limit);
  }

  showRun(runId: string): Stage1RuntimeRunView {
    const run = this.store.getRun(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    return {
      ...run,
      checkpoints: this.store.listCheckpoints(runId),
    };
  }

  resumeRun(runId: string): Stage1RuntimeRunView {
    const run = this.store.getRun(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    if (run.status !== "interrupted") {
      throw new Error(
        `Run ${runId} is not resumable; expected interrupted, got ${run.status}`,
      );
    }
    this.store.updateRun(runId, {
      status: "running",
      current_node: "resume",
      latest_error: null,
    });
    const latestCheckpoint = this.store.getLatestCheckpoint(runId);
    this.finalizeRunSucceeded(runId, {
      resumed: true,
      from_node: latestCheckpoint?.node_name ?? run.current_node,
    });
    return this.showRun(runId);
  }

  markRunFailed(runId: string, error: string): Stage1RuntimeRunView {
    const run = this.store.getRun(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    this.store.updateRun(runId, {
      status: "failed",
      latest_error: error,
      current_node: run.current_node,
      finished_at: new Date().toISOString(),
    });
    this.store.appendCheckpoint({
      run_id: runId,
      node_name: "failed",
      state: { error },
    });
    return this.showRun(runId);
  }

  close(): void {
    this.store.close();
  }

  private finalizeRunSucceeded(
    runId: string,
    payload: { resumed: boolean; from_node: string | null },
  ): void {
    this.store.updateRun(runId, {
      status: "running",
      current_node: "complete",
    });
    this.store.appendCheckpoint({
      run_id: runId,
      node_name: "complete",
      state: {
        stage: "complete",
        resumed: payload.resumed,
        from_node: payload.from_node,
      },
    });
    this.store.updateRun(runId, {
      status: "succeeded",
      current_node: null,
      finished_at: new Date().toISOString(),
      output: {
        ok: true,
        resumed: payload.resumed,
      },
      latest_error: null,
    });
  }
}

export function isRunStatus(value: unknown): value is Stage1RunStatus {
  return (
    value === "queued" ||
    value === "running" ||
    value === "interrupted" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "cancelled"
  );
}
