import { randomUUID } from "node:crypto";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
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

export type Stage1RuntimeGraphExecutor<
  TInput extends Record<string, unknown>,
  TOutput,
> = (input: TInput & { run_id: string }) => Promise<TOutput>;

export interface Stage1RuntimeGraphOptions<
  TInput extends Record<string, unknown>,
  TOutput,
> {
  graph_name: string;
  node_name?: string;
  input?: TInput;
  execute: Stage1RuntimeGraphExecutor<TInput, TOutput>;
  interrupt_before_execute?: boolean;
}

export interface Stage1RuntimeGraphResult<TOutput> {
  run: Stage1RuntimeRunView;
  output: TOutput | null;
}

export type Stage1RuntimeResumeHandlers = Record<
  string,
  Stage1RuntimeGraphExecutor<Record<string, unknown>, unknown>
>;

const RuntimeGraphState = Annotation.Root({
  run_id: Annotation<string>(),
  input: Annotation<Record<string, unknown>>(),
  output: Annotation<unknown | null>(),
});

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

  async runGraph<TInput extends Record<string, unknown>, TOutput>(
    options: Stage1RuntimeGraphOptions<TInput, TOutput>,
  ): Promise<Stage1RuntimeGraphResult<TOutput>> {
    const input = options.input ?? ({} as TInput);
    const nodeName = options.node_name ?? "execute";
    const runId = `run_${randomUUID().replace(/-/g, "")}`;
    const created = this.store.createRun({
      run_id: runId,
      graph_name: options.graph_name,
      status: "queued",
      input,
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
        graph_name: options.graph_name,
        runtime: "@langchain/langgraph",
        input,
      },
    });

    if (options.interrupt_before_execute) {
      this.store.updateRun(runId, {
        status: "interrupted",
        current_node: nodeName,
      });
      this.store.appendCheckpoint({
        run_id: runId,
        node_name: "interrupt",
        state: {
          stage: "interrupt",
          next_node: nodeName,
        },
      });
      return {
        run: this.showRun(runId),
        output: null,
      };
    }

    try {
      const output = await this.invokeGraphNode({
        run_id: runId,
        node_name: nodeName,
        input,
        execute: options.execute,
      });
      this.finalizeRunSucceeded(runId, {
        resumed: false,
        from_node: nodeName,
        output,
      });
      return {
        run: this.showRun(runId),
        output,
      };
    } catch (error) {
      this.markRunFailed(runId, errorToMessage(error));
      throw error;
    }
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

  async resumeRun(
    runId: string,
    handlers: Stage1RuntimeResumeHandlers = {},
  ): Promise<Stage1RuntimeRunView> {
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
    this.store.appendCheckpoint({
      run_id: runId,
      node_name: "resume",
      state: {
        stage: "resume",
        from_checkpoint: latestCheckpoint?.checkpoint_id ?? null,
        from_node: latestCheckpoint?.node_name ?? run.current_node,
      },
    });

    const handler = handlers[run.graph_name];
    if (handler) {
      try {
        const output = await this.invokeGraphNode({
          run_id: runId,
          node_name: "resume_execute",
          input: normalizeRunInput(run.input),
          execute: handler,
        });
        this.finalizeRunSucceeded(runId, {
          resumed: true,
          from_node: latestCheckpoint?.node_name ?? run.current_node,
          output,
        });
      } catch (error) {
        this.markRunFailed(runId, errorToMessage(error));
        throw error;
      }
      return this.showRun(runId);
    }

    if (run.graph_name !== "stage1-foundation") {
      this.markRunFailed(
        runId,
        `No resume handler registered for graph ${run.graph_name}`,
      );
      throw new Error(`No resume handler registered for graph ${run.graph_name}`);
    }

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
    payload: { resumed: boolean; from_node: string | null; output?: unknown },
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
      output: payload.output ?? {
        ok: true,
        resumed: payload.resumed,
      },
      latest_error: null,
    });
  }

  private async invokeGraphNode<TInput extends Record<string, unknown>, TOutput>(
    params: {
      run_id: string;
      node_name: string;
      input: TInput;
      execute: Stage1RuntimeGraphExecutor<TInput, TOutput>;
    },
  ): Promise<TOutput> {
    this.store.updateRun(params.run_id, {
      status: "running",
      current_node: params.node_name,
    });
    this.store.appendCheckpoint({
      run_id: params.run_id,
      node_name: `${params.node_name}:start`,
      state: {
        stage: "node_start",
        node_name: params.node_name,
        input: params.input,
      },
    });

    const graph = new StateGraph(RuntimeGraphState)
      .addNode(params.node_name, async (state) => {
        const output = await params.execute({
          ...(state.input as TInput),
          run_id: state.run_id,
        });
        return { output };
      })
      .addEdge(START, params.node_name)
      .addEdge(params.node_name, END)
      .compile();
    const result = await graph.invoke({
      run_id: params.run_id,
      input: params.input,
      output: null,
    });
    const output = result.output as TOutput;

    this.store.appendCheckpoint({
      run_id: params.run_id,
      node_name: `${params.node_name}:complete`,
      state: {
        stage: "node_complete",
        node_name: params.node_name,
        output,
      },
    });
    return output;
  }
}

function normalizeRunInput(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
