/**
 * trader workflow — CLI 直接管理 Workflow
 *
 * 子命令:
 *   trader workflow list                    列出所有可用 workflow
 *   trader workflow run <workflowId> [...]  触发 workflow 运行
 *   trader workflow status <runId>          查询运行状态
 *   trader workflow log [limit]             查看最近运行记录
 */

import { fetchIntel } from "../api/client.js";

// ─── list ────────────────────────────────────────────────

async function listWorkflows() {
  const data = await fetchIntel("/workflows");
  const workflows = (data as { workflows?: Array<{ id: string; description: string; avgDuration: string }> }).workflows ?? [];
  if (workflows.length === 0) {
    console.log("没有可用的 workflow");
    return;
  }
  for (const w of workflows) {
    console.log(`  ${w.id.padEnd(22)} ${w.description}  (≈${w.avgDuration})`);
  }
}

// ─── run ──────────────────────────────────────────────────

async function runWorkflow(workflowId: string, args: string[]) {
  const inputs: Record<string, unknown> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--symbol" || args[i] === "-s") {
      inputs.symbols = (args[i + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (args[i] === "--days" || args[i] === "-d") {
      inputs.daysBack = Number(args[i + 1] ?? 7);
    }
    if (args[i] === "--regime") {
      inputs.regime = args[i + 1];
    }
  }

  try {
    const result = await fetchIntel(`/workflows/${workflowId}`, {
      method: "POST",
      json: inputs,
    });
    const r = result as { runId?: string; status?: string };
    console.log(`${workflowId} 已触发 — runId: ${r.runId ?? "?"} status: ${r.status ?? "unknown"}`);
    if (r.runId) {
      console.log(`  查看状态: trader workflow status ${r.runId}`);
    }
  } catch (e: unknown) {
    console.error(`触发失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── status ───────────────────────────────────────────────

async function getWorkflowStatus(runId: string) {
  try {
    const data = await fetchIntel(`/workflows/runs/${encodeURIComponent(runId)}`);
    const r = data as { workflowId?: string; status?: string; progress?: string; startedAt?: number; result?: unknown };
    console.log(`  runId:      ${runId}`);
    console.log(`  workflowId: ${r.workflowId ?? "?"}`);
    console.log(`  status:     ${r.status ?? "unknown"}`);
    if (r.progress) console.log(`  progress:   ${r.progress}`);
    if (r.startedAt) console.log(`  startedAt:  ${new Date(r.startedAt * 1000).toISOString()}`);
    if (r.result) console.log(`  result:     ${JSON.stringify(r.result).slice(0, 200)}`);
  } catch (e: unknown) {
    console.error(`查询失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── 入口 ─────────────────────────────────────────────────

export async function workflowCommand(action: string, arg1?: string, ...rest: string[]) {
  switch (action) {
    case "list":
    case "ls":
      await listWorkflows();
      break;
    case "run":
      if (!arg1) {
        console.error("用法: trader workflow run <workflowId> [--symbol TSLA,NVDA] [--days 7] [--regime trending]");
        return;
      }
      await runWorkflow(arg1, rest);
      break;
    case "status":
      if (!arg1) {
        console.error("用法: trader workflow status <runId>");
        return;
      }
      await getWorkflowStatus(arg1);
      break;
    default:
      console.log("用法:");
      console.log("  trader workflow list              列出所有可用 workflow");
      console.log("  trader workflow run <id> [...]    触发 workflow（--symbol TSLA,NVDA --days 7）");
      console.log("  trader workflow status <runId>    查询运行状态");
  }
}
