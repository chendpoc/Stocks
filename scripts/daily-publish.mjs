import { spawnSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildWeWorkImagePayloadFromFile,
  renderSummaryPng,
  sendWeWorkImage,
} from "./lib/summary-image.mjs";
import {
  buildDailySummaryCard,
  buildPublicAssetUrl,
  buildSummaryCardDigest,
  renderSummaryCardCoverPng,
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
const skipCard = args.has("--skip-card");
const skipImage = args.has("--skip-image");
const themeName = process.env.SUMMARY_IMAGE_THEME || "light_report";
const cardUrlWaitTimeoutMs = readPositiveIntEnv("SUMMARY_CARD_URL_WAIT_TIMEOUT_MS", 300000);
const cardUrlWaitIntervalMs = readPositiveIntEnv("SUMMARY_CARD_URL_WAIT_INTERVAL_MS", 10000);
const deployHookUrl = readOptionalEnv("SUMMARY_DEPLOY_HOOK_URL");

function readArgValue(name) {
  const eqArg = rawArgs.find((arg) => arg.startsWith(`${name}=`));
  if (eqArg) return eqArg.slice(name.length + 1);
  const index = rawArgs.indexOf(name);
  if (index >= 0 && rawArgs[index + 1] && !rawArgs[index + 1].startsWith("--")) {
    return rawArgs[index + 1];
  }
  return "";
}

function readOptionalEnv(name) {
  const value = (process.env[name] || "").trim();
  return value === "null" || value === "undefined" ? "" : value;
}

function readPositiveIntEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const targetDate = readArgValue("--date") || readOptionalEnv("SUMMARY_TARGET_DATE");
if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
  throw new Error("--date or SUMMARY_TARGET_DATE must be formatted as YYYY-MM-DD");
}

const limit = readArgValue("--limit") || readOptionalEnv("SUMMARY_FETCH_LIMIT");
if (limit && !/^\d+$/.test(limit)) {
  throw new Error("--limit or SUMMARY_FETCH_LIMIT must be a positive integer");
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function publicUrlAvailable(url) {
  for (const method of ["HEAD", "GET"]) {
    try {
      const response = await fetch(url, {
        method,
        redirect: "follow",
        cache: "no-store",
      });
      if (response.ok) return true;
    } catch {
      // Retry with the next method or poll iteration.
    }
  }
  return false;
}

async function waitForPublicUrl(url, options = {}) {
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error(`Public URL is required before sending template card: ${url || "(empty)"}`);
  }

  const timeoutMs = options.timeoutMs ?? cardUrlWaitTimeoutMs;
  const intervalMs = options.intervalMs ?? cardUrlWaitIntervalMs;
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let attempt = 0;

  while (Date.now() <= deadline) {
    attempt += 1;
    if (await publicUrlAvailable(url)) {
      console.log(`public card cover available after ${attempt} check(s): ${url}`);
      return;
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(intervalMs, remainingMs));
  }

  throw new Error(`Timed out waiting for public card cover URL after ${timeoutMs}ms: ${url}`);
}

function maskUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.search) parsed.search = "?[redacted]";
    if (parsed.hash) parsed.hash = "";
    return parsed.toString();
  } catch {
    return "[invalid-url]";
  }
}

async function triggerDeployHook() {
  if (!deployHookUrl) return false;
  if (!/^https?:\/\//i.test(deployHookUrl)) {
    throw new Error("SUMMARY_DEPLOY_HOOK_URL must be a valid http(s) URL.");
  }

  const response = await fetch(deployHookUrl, { method: "POST" });
  console.log(`deploy hook response: ${response.status} ${maskUrl(deployHookUrl)}`);
  if (!response.ok) {
    throw new Error(`Deploy hook failed with status ${response.status}.`);
  }
  return true;
}

function sampleSummary() {
  return {
    day: "2026-05-20",
    event_summary: [
      "赵哥主线是先判断指数节奏，而不是追着单根K线猜方向。",
      "市场围绕 SPX 缓跌模型震荡，重点观察缺口、仓位和时间窗口。",
      "操作上只做低吸高抛，不追高、不赌财报。",
    ],
    overview: ["指数仍处于资金调仓窗口。", "重点关注管理员明确提到的标的和风险。"],
    market_context: ["市场主线是缺口、节奏和仓位控制。"],
    admin_deep_reading: ["管理员强调用可重复的幅度和时间条件过滤噪音。"],
    admin_symbols: [
      { symbol: "SPX", summary: "观察缓跌模型是否继续按节奏运行。" },
      { symbol: "NVDA", summary: "财报窗口前不追高，等待缺口确认。" },
    ],
    risks: ["追高、超仓和财报赌博是主要亏损来源。"],
  };
}

async function buildCardArtifacts(summary, artifacts, options = {}) {
  const day = options.day || artifacts?.day || summary?.day || new Date().toISOString().slice(0, 10);
  const reportUrl = options.reportUrl || siteBaseUrl.replace(/\/+$/, "/");
  const digest = buildSummaryCardDigest(summary, { day, reportUrl });
  const coverPath = options.coverPath || path.join(root, "docs", "assets", "summary-cards", `${day}.png`);
  await mkdir(path.dirname(coverPath), { recursive: true });
  const cover = await renderSummaryCardCoverPng(digest, { outputPath: coverPath });
  const coverImageUrl =
    process.env.SUMMARY_CARD_IMAGE_URL ||
    options.coverImageUrl ||
    buildPublicAssetUrl(path.relative(root, coverPath).replaceAll("\\", "/"), siteBaseUrl);
  const payload = buildDailySummaryCard(digest, { coverImageUrl });

  return {
    day,
    payload,
    coverPath,
    coverImageUrl,
    reportUrl,
    coverSizeBytes: cover.sizeBytes,
  };
}

async function buildImageArtifacts(summary, artifacts, options = {}) {
  const day = options.day || artifacts?.day || summary?.day || new Date().toISOString().slice(0, 10);
  const imagePath =
    options.imagePath ||
    path.join(root, "docs", "assets", "summary-images", `${day}-daily-summary.png`);
  await mkdir(path.dirname(imagePath), { recursive: true });
  const rendered = await renderSummaryPng(summary, { outputPath: imagePath, themeName });
  const payload = await buildWeWorkImagePayloadFromFile(rendered.outputPath);

  return {
    day,
    imagePath: rendered.outputPath,
    imageSizeBytes: rendered.sizeBytes,
    payloadBase64Bytes: Buffer.byteLength(payload.image.base64, "utf8"),
  };
}

function gitPath(filePath) {
  return path.relative(root, path.resolve(root, filePath)).replaceAll("\\", "/");
}

function publishWithGit(artifacts, pathsToPublish) {
  const addPaths = new Set(["docs/index.md", "docs/search_index.json"]);
  for (const item of pathsToPublish) {
    if (item) addPaths.add(gitPath(item));
  }

  run("git", ["add", ...addPaths]);
  if (artifacts.archive_path) run("git", ["add", "-f", artifacts.archive_path]);

  const diff = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: root, windowsHide: true });
  if (diff.status === 0) {
    console.log("No staged docs changes to publish.");
    return false;
  }

  const message = `Auto daily publish: ${artifacts.generated_at_cst ?? new Date().toISOString()}`;
  run("git", ["commit", "-m", message]);
  run("git", ["push", "origin", currentGitBranch()]);
  return true;
}

async function runDry() {
  const summary = sampleSummary();
  const card = skipCard
    ? null
    : await buildCardArtifacts(summary, { day: summary.day }, {
        coverPath: path.join(root, "data", "generated", "dry-run-daily-publish-card.png"),
        reportUrl: siteBaseUrl.replace(/\/+$/, "/"),
        coverImageUrl: buildPublicAssetUrl("docs/assets/summary-cards/2026-05-20.png", siteBaseUrl),
      });
  const image = skipImage
    ? null
    : await buildImageArtifacts(summary, { day: summary.day }, {
        imagePath: path.join(root, "data", "generated", "dry-run-daily-publish-image.png"),
      });

  console.log("daily:publish dry run ok");
  if (card) {
    console.log(`card_msgtype: ${card.payload.msgtype}`);
    console.log(`card_cover: ${card.coverPath}`);
    console.log(`card_cover_url: ${card.coverImageUrl}`);
  }
  if (image) {
    console.log(`image: ${image.imagePath}`);
    console.log(`image_bytes: ${image.imageSizeBytes}`);
    console.log(`image_payload_base64_bytes: ${image.payloadBase64Bytes}`);
  }
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
  const card = skipCard ? null : await buildCardArtifacts(summary, artifacts);
  const image = skipImage ? null : await buildImageArtifacts(summary, artifacts);

  console.log(`summary markdown: ${path.resolve(root, artifacts.archive_path)}`);
  console.log(`summary json: ${summaryJsonPath}`);
  if (card) {
    console.log(`card cover: ${card.coverPath} (${card.coverSizeBytes} bytes)`);
    console.log(`report url: ${card.reportUrl}`);
    console.log(`cover url: ${card.coverImageUrl}`);
  }
  if (image) {
    console.log(`summary image: ${image.imagePath} (${image.imageSizeBytes} bytes)`);
  }

  let published = false;
  if (!skipGitPush) {
    published = publishWithGit(artifacts, [card?.coverPath, image?.imagePath]);
    if (published) {
      await triggerDeployHook();
    }
  } else {
    console.log("skip git push");
  }

  if (!skipWebhook) {
    if (card && skipGitPush && !process.env.SUMMARY_CARD_IMAGE_URL) {
      throw new Error("Cannot send template card with unpublished cover image. Remove --skip-git-push or set SUMMARY_CARD_IMAGE_URL.");
    }
    const webhookUrl = loadWebhookUrl(py);
    if (!webhookUrl) throw new Error("WEWORK_WEBHOOK_URL or utils/.local_secrets.py wework_webhook_url is required.");
    if (card) {
      await waitForPublicUrl(card.coverImageUrl);
      await sendWeWorkTemplateCard(webhookUrl, card.payload);
      console.log("wework template_card sent");
    }
    if (image) {
      await sendWeWorkImage(webhookUrl, image.imagePath);
      console.log("wework image sent");
    }
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
