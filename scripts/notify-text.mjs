import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function runDry() {
  const code = String.raw`
from utils.structured_summary import render_summary_text
from utils.wework_webhook import chunk_plain_text_for_wework

plain = render_summary_text({
    "event_summary": ["SPX remains in a controlled pullback model."],
    "overview": ["NVDA and TSLA are watchlist symbols."],
    "admin_deep_reading": ["Do not chase high-beta names before confirmation."],
    "risks": ["Keep position sizing small."],
})
chunks = chunk_plain_text_for_wework(plain)
assert chunks
print("TEXT_OUTPUT_BEGIN")
print(plain)
print("TEXT_OUTPUT_END")
print(f"text_chunks: {len(chunks)}")
print(f"first_chunk_bytes: {len(chunks[0].encode('utf-8'))}")
print("unicode_probe: 每日总结")
`;
  const result = run(pythonPath(), ["-c", code], { capture: true });
  console.log("notify:text dry run ok");
  process.stdout.write(result.stdout ?? "");
}

function sendOrPreviewText(py, summaryJsonPath, webhookUrl) {
  const code = String.raw`
import json
import sys
from pathlib import Path
from utils.structured_summary import render_summary_text
from utils.wework_webhook import chunk_plain_text_for_wework, send_wework_text_article

summary_json_path = Path(sys.argv[1])
skip_webhook = sys.argv[2] == "1"
webhook_url = sys.argv[3] if len(sys.argv) > 3 else ""

summary = json.loads(summary_json_path.read_text(encoding="utf-8"))
plain = render_summary_text(summary)
chunks = chunk_plain_text_for_wework(plain)
print("TEXT_OUTPUT_BEGIN")
print(plain)
print("TEXT_OUTPUT_END")
print(f"text_chunks: {len(chunks)}")
if chunks:
    print(f"first_chunk_bytes: {len(chunks[0].encode('utf-8'))}")

if skip_webhook:
    print("skip webhook")
else:
    if not webhook_url:
        raise RuntimeError("WEWORK_WEBHOOK_URL or utils/.local_secrets.py wework_webhook_url is required.")
    sent = send_wework_text_article(webhook_url, plain)
    print(f"wework text sent: {sent}")
`;
  return run(py, ["-c", code, summaryJsonPath, skipWebhook ? "1" : "0", webhookUrl || ""], {
    capture: true,
  });
}

function runActual() {
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
  const archivePath = path.resolve(root, artifacts.archive_path);
  const summaryJsonPath = path.resolve(root, artifacts.summary_json_path);
  const webhookUrl = skipWebhook ? "" : loadWebhookUrl(py);
  const textResult = sendOrPreviewText(py, summaryJsonPath, webhookUrl);

  console.log(`summary markdown: ${archivePath}`);
  console.log(`summary json: ${summaryJsonPath}`);
  process.stdout.write(textResult.stdout ?? "");
}

try {
  if (dryRun) {
    runDry();
  } else {
    runActual();
  }
} catch (error) {
  console.error(error?.stack ?? error);
  process.exit(1);
}
