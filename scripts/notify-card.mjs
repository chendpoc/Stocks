import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDailySummaryCard,
  buildSummaryCardDigest,
  sendWeWorkTemplateCard,
} from "./lib/summary-card.mjs";
import { loadLocalEnv } from "./lib/local-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
loadLocalEnv(root);
const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);

const dryRun = args.has("--dry-run") || args.has("--dry");
const skipWebhook = dryRun || args.has("--skip-webhook") || process.env.NOTIFY_SKIP_WEBHOOK === "1";
const skipGitPush = dryRun || args.has("--skip-git-push") || process.env.SKIP_GIT_PUSH === "1";

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

const siteBaseUrl =
  readArgValue("--site-base-url") ||
  process.env.SUMMARY_SITE_BASE_URL ||
  process.env.SITE_BASE_URL ||
  "https://stock.autoin.me";

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

function currentGitBranch() {
  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd: root,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`git branch --show-current failed: ${result.stderr ?? ""}`.trim());
  }
  const branch = result.stdout.trim();
  if (!branch) throw new Error("Cannot push from detached HEAD.");
  return branch;
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
    risks: ["追高、超仓和财报赌博是主要亏损来源。"],
  };
}

async function buildCardArtifacts(summary, artifacts, options = {}) {
  const day = options.day || artifacts?.day || summary?.day || new Date().toISOString().slice(0, 10);
  const reportUrl = options.reportUrl || siteBaseUrl.replace(/\/+$/, "/");
  const digest = buildSummaryCardDigest(summary, { day, reportUrl });
  const payload = buildDailySummaryCard(digest);

  return {
    day,
    digest,
    payload,
    reportUrl,
  };
}

async function runDry() {
  const dryRunReportUrl = siteBaseUrl.replace(/\/+$/, "/");
  const artifacts = await buildCardArtifacts(sampleSummary(), { day: "2026-05-20" }, {
    reportUrl: dryRunReportUrl,
  });
  console.log("notify:card dry run ok");
  console.log(`msgtype: ${artifacts.payload.msgtype}`);
  console.log(`card_type: ${artifacts.payload.template_card.card_type}`);
  console.log(`report_url: ${artifacts.reportUrl}`);
}

function publishWithGit(artifacts) {
  const addPaths = ["docs/index.md", "docs/search_index.json"];
  run("git", ["add", ...addPaths]);
  if (artifacts.archive_path) run("git", ["add", "-f", artifacts.archive_path]);

  const diff = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: root, windowsHide: true });
  if (diff.status === 0) {
    console.log("No staged docs changes to publish.");
    return;
  }

  const message = `Auto update card: ${artifacts.generated_at_cst ?? new Date().toISOString()}`;
  run("git", ["commit", "-m", message]);
  run("git", ["push", "origin", currentGitBranch()]);
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
  const card = await buildCardArtifacts(summary, artifacts);

  console.log(`summary markdown: ${path.resolve(root, artifacts.archive_path)}`);
  console.log(`summary json: ${summaryJsonPath}`);
  console.log(`report url: ${card.reportUrl}`);

  if (!skipGitPush) {
    publishWithGit(artifacts);
  } else {
    console.log("skip git push");
  }

  if (!skipWebhook) {
    const webhookUrl = loadWebhookUrl(py);
    if (!webhookUrl) throw new Error("WEWORK_WEBHOOK_URL or utils/.local_secrets.py wework_webhook_url is required.");
    await sendWeWorkTemplateCard(webhookUrl, card.payload);
    console.log("wework template_card sent");
  } else {
    console.log("skip webhook");
  }
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
