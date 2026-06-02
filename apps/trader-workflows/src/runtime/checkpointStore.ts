import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

export const STAGE1_RUN_STATUSES = [
  "queued",
  "running",
  "interrupted",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type Stage1RunStatus = (typeof STAGE1_RUN_STATUSES)[number];

export interface Stage1RunSummary {
  run_id: string;
  graph_name: string;
  status: Stage1RunStatus;
  current_node: string | null;
  thread_id: string | null;
  checkpoint_ns: string | null;
  checkpoint_ref: string | null;
  started_at: string | null;
  finished_at: string | null;
  latest_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Stage1RunDetail extends Stage1RunSummary {
  input: unknown;
  output: unknown;
}

export interface Stage1CheckpointRecord {
  checkpoint_id: string;
  run_id: string;
  seq: number;
  node_name: string;
  state: unknown;
  created_at: string;
}

interface Stage1RunRow {
  run_id: string;
  graph_name: string;
  status: Stage1RunStatus;
  current_node: string | null;
  thread_id: string | null;
  checkpoint_ns: string | null;
  checkpoint_ref: string | null;
  input_json: string | null;
  output_json: string | null;
  started_at: string | null;
  finished_at: string | null;
  latest_error: string | null;
  created_at: string;
  updated_at: string;
}

interface Stage1CheckpointRow {
  checkpoint_id: string;
  run_id: string;
  seq: number;
  node_name: string;
  state_json: string;
  created_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson(value: string | null): unknown {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function findRepoRoot(): string {
  const seed = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const candidates: string[] = [];
  let dir = seed;
  for (let i = 0; i < 8; i++) {
    candidates.push(dir);
    const parent = resolve(dir, "..");
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  for (const candidate of candidates) {
    if (
      existsSync(resolve(candidate, "package.json")) &&
      existsSync(resolve(candidate, "apps/trader-cli/package.json"))
    ) {
      return candidate;
    }
  }
  return seed;
}

function resolveFromRepoRoot(pathValue: string): string {
  if (isAbsolute(pathValue)) {
    return pathValue;
  }
  return resolve(findRepoRoot(), pathValue);
}

export function resolveCheckpointDbPath(explicitPath?: string): string {
  const configured =
    explicitPath ??
    process.env.TRADER_WORKFLOWS_CHECKPOINT_DB ??
    "data/trader-workflows/checkpoints.sqlite";
  return resolveFromRepoRoot(configured);
}

function mapRunSummary(row: Stage1RunRow): Stage1RunSummary {
  return {
    run_id: row.run_id,
    graph_name: row.graph_name,
    status: row.status,
    current_node: row.current_node,
    thread_id: row.thread_id,
    checkpoint_ns: row.checkpoint_ns,
    checkpoint_ref: row.checkpoint_ref,
    started_at: row.started_at,
    finished_at: row.finished_at,
    latest_error: row.latest_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapRunDetail(row: Stage1RunRow): Stage1RunDetail {
  return {
    ...mapRunSummary(row),
    input: parseJson(row.input_json),
    output: parseJson(row.output_json),
  };
}

function mapCheckpoint(row: Stage1CheckpointRow): Stage1CheckpointRecord {
  return {
    checkpoint_id: row.checkpoint_id,
    run_id: row.run_id,
    seq: row.seq,
    node_name: row.node_name,
    state: parseJson(row.state_json),
    created_at: row.created_at,
  };
}

export class Stage1CheckpointStore {
  readonly dbPath: string;

  private readonly db: Database;

  constructor(options?: { dbPath?: string }) {
    this.dbPath = resolveCheckpointDbPath(options?.dbPath);
    mkdirSync(dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_runs (
        run_id TEXT PRIMARY KEY,
        graph_name TEXT NOT NULL,
        status TEXT NOT NULL,
        current_node TEXT,
        thread_id TEXT,
        checkpoint_ns TEXT,
        checkpoint_ref TEXT,
        input_json TEXT,
        output_json TEXT,
        started_at TEXT,
        finished_at TEXT,
        latest_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workflow_checkpoints (
        checkpoint_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        node_name TEXT NOT NULL,
        state_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES workflow_runs(run_id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_checkpoints_run_seq
        ON workflow_checkpoints(run_id, seq);

      CREATE INDEX IF NOT EXISTS idx_workflow_runs_updated_at
        ON workflow_runs(updated_at DESC);
    `);
    this.migrateRunRegistryColumns();
  }

  private migrateRunRegistryColumns(): void {
    const columns = this.db
      .prepare("PRAGMA table_info(workflow_runs);")
      .all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("thread_id")) {
      this.db.exec("ALTER TABLE workflow_runs ADD COLUMN thread_id TEXT;");
    }
    if (!names.has("checkpoint_ns")) {
      this.db.exec("ALTER TABLE workflow_runs ADD COLUMN checkpoint_ns TEXT;");
    }
  }

  createRun(params: {
    run_id: string;
    graph_name: string;
    status: Stage1RunStatus;
    current_node?: string | null;
    thread_id?: string | null;
    checkpoint_ns?: string | null;
    checkpoint_ref?: string | null;
    input?: unknown;
    output?: unknown;
    started_at?: string | null;
    finished_at?: string | null;
    latest_error?: string | null;
  }): Stage1RunDetail {
    const now = nowIso();
    const insert = this.db.prepare(`
      INSERT INTO workflow_runs (
        run_id, graph_name, status, current_node, thread_id, checkpoint_ns, checkpoint_ref,
        input_json, output_json, started_at, finished_at, latest_error,
        created_at, updated_at
      ) VALUES (
        @run_id, @graph_name, @status, @current_node, @thread_id, @checkpoint_ns, @checkpoint_ref,
        @input_json, @output_json, @started_at, @finished_at, @latest_error,
        @created_at, @updated_at
      );
    `);
    insert.run({
      run_id: params.run_id,
      graph_name: params.graph_name,
      status: params.status,
      current_node: params.current_node ?? null,
      thread_id: params.thread_id ?? null,
      checkpoint_ns: params.checkpoint_ns ?? null,
      checkpoint_ref: params.checkpoint_ref ?? null,
      input_json:
        params.input === undefined ? null : JSON.stringify(params.input),
      output_json:
        params.output === undefined ? null : JSON.stringify(params.output),
      started_at: params.started_at ?? null,
      finished_at: params.finished_at ?? null,
      latest_error: params.latest_error ?? null,
      created_at: now,
      updated_at: now,
    });
    const created = this.getRun(params.run_id);
    if (!created) {
      throw new Error(`Failed to create run ${params.run_id}`);
    }
    return created;
  }

  updateRun(
    runId: string,
    patch: {
      status?: Stage1RunStatus;
      current_node?: string | null;
      thread_id?: string | null;
      checkpoint_ns?: string | null;
      checkpoint_ref?: string | null;
      input?: unknown;
      output?: unknown;
      started_at?: string | null;
      finished_at?: string | null;
      latest_error?: string | null;
    },
  ): Stage1RunDetail {
    const current = this.readRunRow(runId);
    if (!current) {
      throw new Error(`Run not found: ${runId}`);
    }
    const next: Stage1RunRow = {
      ...current,
      status: patch.status ?? current.status,
      current_node:
        patch.current_node === undefined ? current.current_node : patch.current_node,
      thread_id:
        patch.thread_id === undefined ? current.thread_id : patch.thread_id,
      checkpoint_ns:
        patch.checkpoint_ns === undefined ? current.checkpoint_ns : patch.checkpoint_ns,
      checkpoint_ref:
        patch.checkpoint_ref === undefined
          ? current.checkpoint_ref
          : patch.checkpoint_ref,
      input_json:
        patch.input === undefined ? current.input_json : JSON.stringify(patch.input),
      output_json:
        patch.output === undefined
          ? current.output_json
          : JSON.stringify(patch.output),
      started_at:
        patch.started_at === undefined ? current.started_at : patch.started_at,
      finished_at:
        patch.finished_at === undefined ? current.finished_at : patch.finished_at,
      latest_error:
        patch.latest_error === undefined
          ? current.latest_error
          : patch.latest_error,
      updated_at: nowIso(),
    };
    const update = this.db.prepare(`
      UPDATE workflow_runs
      SET
        status = @status,
        current_node = @current_node,
        thread_id = @thread_id,
        checkpoint_ns = @checkpoint_ns,
        checkpoint_ref = @checkpoint_ref,
        input_json = @input_json,
        output_json = @output_json,
        started_at = @started_at,
        finished_at = @finished_at,
        latest_error = @latest_error,
        updated_at = @updated_at
      WHERE run_id = @run_id;
    `);
    update.run({
      ...next,
      run_id: runId,
    });
    const updated = this.getRun(runId);
    if (!updated) {
      throw new Error(`Failed to update run ${runId}`);
    }
    return updated;
  }

  appendCheckpoint(params: {
    run_id: string;
    node_name: string;
    state: unknown;
  }): Stage1CheckpointRecord {
    const seqStmt = this.db.prepare(
      "SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM workflow_checkpoints WHERE run_id = ?;",
    );
    const seqRow = seqStmt.get(params.run_id) as { next_seq: number } | undefined;
    const seq = seqRow?.next_seq ?? 1;
    const checkpointId = `${params.run_id}:${seq}`;
    const createdAt = nowIso();
    const insert = this.db.prepare(`
      INSERT INTO workflow_checkpoints (
        checkpoint_id, run_id, seq, node_name, state_json, created_at
      ) VALUES (
        @checkpoint_id, @run_id, @seq, @node_name, @state_json, @created_at
      );
    `);
    insert.run({
      checkpoint_id: checkpointId,
      run_id: params.run_id,
      seq,
      node_name: params.node_name,
      state_json: JSON.stringify(params.state ?? null),
      created_at: createdAt,
    });
    this.updateRun(params.run_id, { checkpoint_ref: checkpointId });
    return {
      checkpoint_id: checkpointId,
      run_id: params.run_id,
      seq,
      node_name: params.node_name,
      state: params.state ?? null,
      created_at: createdAt,
    };
  }

  listRuns(limit = 50): Stage1RunSummary[] {
    const stmt = this.db.prepare(`
      SELECT
        run_id, graph_name, status, current_node, thread_id, checkpoint_ns, checkpoint_ref,
        input_json, output_json, started_at, finished_at, latest_error,
        created_at, updated_at
      FROM workflow_runs
      ORDER BY updated_at DESC, created_at DESC
      LIMIT ?;
    `);
    const rows = stmt.all(limit) as Stage1RunRow[];
    return rows.map(mapRunSummary);
  }

  getRun(runId: string): Stage1RunDetail | null {
    const row = this.readRunRow(runId);
    return row ? mapRunDetail(row) : null;
  }

  listCheckpoints(runId: string): Stage1CheckpointRecord[] {
    const stmt = this.db.prepare(`
      SELECT checkpoint_id, run_id, seq, node_name, state_json, created_at
      FROM workflow_checkpoints
      WHERE run_id = ?
      ORDER BY seq ASC;
    `);
    const rows = stmt.all(runId) as Stage1CheckpointRow[];
    return rows.map(mapCheckpoint);
  }

  getLatestCheckpoint(runId: string): Stage1CheckpointRecord | null {
    const stmt = this.db.prepare(`
      SELECT checkpoint_id, run_id, seq, node_name, state_json, created_at
      FROM workflow_checkpoints
      WHERE run_id = ?
      ORDER BY seq DESC
      LIMIT 1;
    `);
    const row = stmt.get(runId) as Stage1CheckpointRow | undefined;
    return row ? mapCheckpoint(row) : null;
  }

  close(): void {
    this.db.close();
  }

  private readRunRow(runId: string): Stage1RunRow | null {
    const stmt = this.db.prepare(`
      SELECT
        run_id, graph_name, status, current_node, thread_id, checkpoint_ns, checkpoint_ref,
        input_json, output_json, started_at, finished_at, latest_error,
        created_at, updated_at
      FROM workflow_runs
      WHERE run_id = ?;
    `);
    const row = stmt.get(runId) as Stage1RunRow | undefined;
    return row ?? null;
  }
}
