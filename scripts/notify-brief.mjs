import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import {
  buildSummaryBriefMarkdown,
  buildWeWorkMarkdownPayload,
  sendWeWorkMarkdown,
} from "./lib/summary-brief.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);

const dryRun = args.has("--dry-run") || args.has("--dry");
const skipWebhook = dryRun || args.has("--skip-webhook") || process.env.NOTIFY_SKIP_WEBHOOK === "1";

function readArgValue(name) {
  const eqArg = rawArgs.find((arg) => arg.startsWith(`${name}=`));
  if (eqArg) return eqArg.slice(name.length + 1);
  const index = rawArgs.indexOf(name);
  if (index >= 0 && rawArgs[index + 1] && !rawArgs[index + 1].startsWith("--")) {
    return rawArgs[index + 1];
  }
  return "";
}

const targetDate = readArgValue("--date");
if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
  throw new Error("--date must be formatted as YYYY-MM-DD");
}

const limit = readArgValue("--limit");
if (limit && !/^\d+$/.test(limit)) {
  throw new Error("--limit must be a positive integer");
}

function pythonPath() {
  const winPy = path.join(root, ".venv", "Scripts", "python.exe");
  const posixPy = path.join(root, ".venv", "bin", "python3");
  if (fs.existsSync(winPy)) return winPy;
  if (fs.existsSync(posixPy)) return posixPy;
  return process.platform === "win32" ? "python" : "python3";
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf-8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1",
      ...(options.env ?? {}),
    },
    windowsHide: true,
  });
  if (result.status !== 0) {
    if (options.capture) {
      process.stderr.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }
    throw new Error(`${command} ${commandArgs.join(" ")} failed with exit ${result.status}`);
  }
  return result;
}

function parseArtifacts(stdout) {
  const line = stdout
    .split(/\r?\n/)
    .reverse()
    .find((item) => item.startsWith("ARTIFACTS_JSON="));
  if (!line) {
    throw new Error("Python summary runner did not emit ARTIFACTS_JSON.");
  }
  return JSON.parse(line.slice("ARTIFACTS_JSON=".length));
}

function loadWebhookUrl(py) {
  if (process.env.WEWORK_WEBHOOK_URL?.trim()) return process.env.WEWORK_WEBHOOK_URL.trim();
  const code = String.raw`
import importlib.util
from pathlib import Path

base = Path("utils")
for name in (".local_secrets.py", "local_secrets.py"):
    path = base / name
    if path.is_file():
        spec = importlib.util.spec_from_file_location("_daily_secret", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        print((getattr(mod, "wework_webhook_url", "") or "").strip())
        raise SystemExit(0)
print("")
`;
  const result = run(py, ["-c", code], { capture: true });
  return (result.stdout ?? "").trim();
}

function sampleSummary() {
  return {
    day: "2026-05-20",
    event_summary: [
      "赵哥主线是先判断指数节奏，而不是追着单根K线猜方向。",
      "市场围绕 SPX 缓跌模型震荡，重点观察缺口、仓位和时间窗口。",
      "普通用户讨论提供个股线索，但交易决策仍以管理员框架为主。",
    ],
    admin_deep_reading: [
      "管理员强调不追高、不赌财报，用可重复的幅度和时间条件过滤噪音。",
    ],
    admin_symbols: [
      { symbol: "SPX", summary: "观察缓跌模型是否继续按节奏运行。" },
      { symbol: "NVDA", summary: "财报窗口前不追高，等待缺口确认。" },
      { symbol: "TSLA", summary: "关注回调支撑和日内波段机会。" },
    ],
    user_core: ["普通用户主要讨论是否踏空，以及个股回调后的机会。"],
    risks: ["追高、超仓和财报赌博是主要亏损来源。"],
  };
}

async function renderAndMaybeSend(summary, options = {}) {
  const markdown = buildSummaryBriefMarkdown(summary, {
    day: options.day,
    localMarkdownPath: options.localMarkdownPath,
  });
  const payload = buildWeWorkMarkdownPayload(markdown);
  console.log("MARKDOWN_OUTPUT_BEGIN");
  console.log(payload.markdown.content);
  console.log("MARKDOWN_OUTPUT_END");
  console.log(`msgtype: ${payload.msgtype}`);
  console.log(`markdown_bytes: ${Buffer.byteLength(payload.markdown.content, "utf8")}`);
  console.log(`contains_url: ${/https?:\/\//.test(payload.markdown.content)}`);

  if (skipWebhook) {
    console.log("skip webhook");
    return;
  }
  const webhookUrl = loadWebhookUrl(pythonPath());
  if (!webhookUrl) throw new Error("WEWORK_WEBHOOK_URL or utils/.local_secrets.py wework_webhook_url is required.");
  await sendWeWorkMarkdown(webhookUrl, payload);
  console.log("wework markdown sent");
}

async function runDry() {
  console.log("notify:brief dry run ok");
  await renderAndMaybeSend(sampleSummary(), {
    day: "2026-05-20",
    localMarkdownPath: "docs/summaries/2026-05/2026-05-20-每日总结.md",
  });
}

async function runActual() {
  const py = pythonPath();
  const pyArgs = ["daily_summary_structured.py"];
  if (targetDate) pyArgs.push("--date", targetDate);
  if (limit) pyArgs.push("--limit", limit);

  const summaryResult = run(py, pyArgs, {
    capture: true,
    env: { SKIP_GIT_PUSH: "1" },
  });
  process.stderr.write(summaryResult.stderr ?? "");

  const artifacts = parseArtifacts(summaryResult.stdout ?? "");
  const summaryJsonPath = path.resolve(root, artifacts.summary_json_path);
  const summary = JSON.parse(await readFile(summaryJsonPath, "utf-8"));
  console.log(`summary markdown: ${path.resolve(root, artifacts.archive_path)}`);
  console.log(`summary json: ${summaryJsonPath}`);
  await renderAndMaybeSend(summary, {
    day: artifacts.day,
    localMarkdownPath: artifacts.archive_path,
  });
}

try {
  if (dryRun) {
    await runDry();
  } else {
    await runActual();
  }
} catch (error) {
  console.error(error?.stack ?? error);
  process.exit(1);
}
