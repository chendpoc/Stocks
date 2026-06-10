/**
 * WorkflowStatusPanel — Chat 页面内嵌 workflow 状态面板
 *
 * 当 Agent 调用 runWorkflow 后，前端轮询 getWorkflowStatus 并显示迷你进度条。
 * 面板由前端直接调用 fetchIntel，不占用 Agent 对话上下文。
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text } from "ink";
import { fetchIntel } from "../../api/client.js";

type WorkflowRun = {
  runId: string;
  workflowId: string;
  label: string;
  startedAt: number;
};

type Props = {
  runs: WorkflowRun[];
};

/** 每 3 秒轮询一次状态，最多 60 次（3 分钟） */
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 60;

function StatusBar({
  run,
}: {
  run: WorkflowRun & { status?: string; progress?: string };
}) {
  const elapsed = Math.round((Date.now() - run.startedAt) / 1000);
  const status = run.status ?? "running";
  const color = status === "completed" ? "green" : status === "failed" ? "red" : "yellow";

  const bar = status === "running"
    ? "▓▓▓▓▓▓▓░░░░░░░"
    : status === "completed"
    ? "████████████████"
    : "██████░░░░░░░░░░";

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
      <Text>
        <Text color={color}>{bar}</Text>
        <Text> {run.workflowId} {status === "running" ? "运行中" : status} ({run.runId})</Text>
      </Text>
      <Text dimColor>
        {run.label} · {elapsed}s
        {run.progress ? ` · ${run.progress}` : ""}
      </Text>
    </Box>
  );
}

export function WorkflowStatusPanel({ runs: initialRuns }: Props) {
  const [runStates, setRunStates] = useState<
    Map<string, { status: string; progress?: string; result?: unknown }>
  >(new Map());
  const activeRunsRef = useRef(initialRuns);
  const pollCountRef = useRef(0);

  // Track new runs
  useEffect(() => {
    activeRunsRef.current = initialRuns;
  }, [initialRuns]);

  // Poll loop for active runs
  const poll = useCallback(async () => {
    const active = activeRunsRef.current.filter((r) => {
      const s = runStates.get(r.runId);
      return !s || s.status === "running";
    });

    if (active.length === 0 || pollCountRef.current >= MAX_POLLS) return;

    for (const run of active) {
      try {
        const data = await fetchIntel(`/workflows/runs/${encodeURIComponent(run.runId)}`);
        const status = (data as Record<string, unknown>)?.status as string | undefined;
        if (status) {
          setRunStates((prev) => {
            const next = new Map(prev);
            next.set(run.runId, {
              status,
              progress: (data as Record<string, unknown>)?.progress as string | undefined,
              result: (data as Record<string, unknown>)?.result,
            });
            return next;
          });
        }
      } catch {
        // 轮询失败静默忽略
      }
    }
    pollCountRef.current++;
  }, [runStates]);

  useEffect(() => {
    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  // 所有完成 3 秒后收起
  const allDone = initialRuns.every((r) => {
    const s = runStates.get(r.runId);
    return s && s.status !== "running";
  });
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (allDone && initialRuns.length > 0) {
      const t = setTimeout(() => setCollapsed(true), 3000);
      return () => clearTimeout(t);
    }
  }, [allDone, initialRuns.length]);

  if (collapsed || initialRuns.length === 0) return null;

  return (
    <Box flexDirection="column" marginTop={1}>
      {initialRuns.map((run) => (
        <StatusBar
          key={run.runId}
          run={{ ...run, ...runStates.get(run.runId) }}
        />
      ))}
    </Box>
  );
}
