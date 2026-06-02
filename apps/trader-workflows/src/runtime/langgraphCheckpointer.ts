import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { resolveCheckpointDbPath } from "./checkpointStore.js";

export function resolveLanggraphCheckpointDbPath(registryDbPath?: string): string {
  const registryPath = registryDbPath ?? resolveCheckpointDbPath();
  if (registryPath.endsWith(".sqlite")) {
    return registryPath.replace(/\.sqlite$/, ".langgraph.sqlite");
  }
  return `${registryPath}.langgraph.sqlite`;
}

export function createLanggraphCheckpointer(options?: {
  dbPath?: string;
}): BaseCheckpointSaver {
  const dbPath = options?.dbPath ?? resolveLanggraphCheckpointDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  if (!existsSync(dbPath)) {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  return SqliteSaver.fromConnString(dbPath);
}

export async function readLatestLanggraphCheckpointRef(
  checkpointer: BaseCheckpointSaver,
  threadId: string,
): Promise<string | null> {
  const tuple = await checkpointer.getTuple({
    configurable: { thread_id: threadId },
  });
  const checkpointId = tuple?.checkpoint?.id;
  return typeof checkpointId === "string" ? checkpointId : null;
}
