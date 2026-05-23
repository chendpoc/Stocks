import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const checklistPath = "docs/research-agent/integration-handoff-checklist.md";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    shell: false,
    stdio: "pipe",
  });
  if (result.error) {
    return { ok: false, stdout: "", stderr: result.error.message, output: result.error.message };
  }
  const stdout = String(result.stdout || "").replace(/\s+$/u, "");
  const stderr = String(result.stderr || "").trim();
  const output = stdout.trim() || stderr;
  return { ok: result.status === 0, stdout, stderr, output };
}

function runGitPath(args) {
  return run("git", ["-c", "core.quotepath=false", ...args]);
}

function lines(value) {
  return value ? value.split(/\r?\n/).filter(Boolean) : [];
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function statusPath(line) {
  const raw = line.slice(3).trim();
  const renameParts = raw.split(" -> ");
  return renameParts[renameParts.length - 1];
}

function statusLabel(ok) {
  return ok ? "ok" : "missing";
}

function parseDivergence(output) {
  const [aheadRaw, behindRaw] = String(output || "").trim().split(/\s+/);
  const aheadBy = Number.parseInt(aheadRaw, 10);
  const behindBy = Number.parseInt(behindRaw, 10);
  if (!Number.isFinite(aheadBy) || !Number.isFinite(behindBy)) {
    return { ok: false, ahead_by: 0, behind_by: 0, diverged: false };
  }
  return {
    ok: true,
    ahead_by: aheadBy,
    behind_by: behindBy,
    diverged: aheadBy > 0 && behindBy > 0,
  };
}

function parseArgs(argv) {
  const options = { json: false };
  for (const arg of argv) {
    if (arg === "--json") {
      options.json = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function releaseCheckStatusPath() {
  return process.env.RELEASE_CHECK_STATUS_PATH
    ? resolve(process.env.RELEASE_CHECK_STATUS_PATH)
    : resolve(rootDir, "data/generated/release-check-status.json");
}

function collectReleaseCheck(gitStatus, head) {
  const evidencePath = releaseCheckStatusPath();
  const base = {
    ok: false,
    current: false,
    evidence: evidencePath,
    completed_at: "",
    head_matches: false,
    status_matches: false,
    reason: "",
  };

  let evidence;
  try {
    evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch (error) {
    return {
      ...base,
      reason: `missing release check evidence: ${error.code || error.message}`,
    };
  }

  const headMatches = Boolean(head.ok && evidence.head === head.output);
  const statusMatches = Boolean(gitStatus.ok && evidence.git_status_short === gitStatus.stdout);
  const ok = evidence.ok === true;
  const current = ok && headMatches && statusMatches;

  return {
    ok,
    current,
    evidence: evidencePath,
    completed_at: typeof evidence.completed_at === "string" ? evidence.completed_at : "",
    head_matches: headMatches,
    status_matches: statusMatches,
    reason: current ? "" : "release check evidence is missing, failed, or stale for the current HEAD/worktree",
  };
}

function collectStatus() {
  const gitStatus = runGitPath(["status", "--short"]);
  const head = run("git", ["rev-parse", "HEAD"]);
  const originHead = run("git", ["rev-parse", "origin/main"]);
  const divergenceRaw = run("git", ["rev-list", "--left-right", "--count", "HEAD...origin/main"]);
  const remoteChangedRaw = runGitPath(["diff", "--name-only", "HEAD..origin/main"]);
  const divergence = divergenceRaw.ok
    ? parseDivergence(divergenceRaw.output)
    : { ok: false, ahead_by: 0, behind_by: 0, diverged: false };
  const changed = lines(gitStatus.stdout);
  const dirtyFiles = uniqueSorted(changed.map(statusPath));
  const remoteChangedFiles = remoteChangedRaw.ok ? uniqueSorted(lines(remoteChangedRaw.stdout)) : [];
  const remoteChangedSet = new Set(remoteChangedFiles);
  const overlapFiles = dirtyFiles.filter((file) => remoteChangedSet.has(file));
  const clean = gitStatus.ok && changed.length === 0;
  const headMatchesOrigin = head.ok && originHead.ok && head.output === originHead.output;
  const releaseCheck = collectReleaseCheck(gitStatus, head);
  const blockers = [];

  if (!gitStatus.ok) {
    blockers.push({ gate: "git_integration", reason: `git status --short failed: ${gitStatus.output}` });
  } else if (!clean) {
    blockers.push({ gate: "git_integration", reason: `working tree has ${changed.length} changed entries` });
  }

  if (!head.ok) {
    blockers.push({ gate: "git_integration", reason: `git rev-parse HEAD failed: ${head.output}` });
  }
  if (!originHead.ok) {
    blockers.push({ gate: "git_integration", reason: `git rev-parse origin/main failed: ${originHead.output}` });
  }
  if (head.ok && originHead.ok && !headMatchesOrigin) {
    blockers.push({ gate: "git_integration", reason: "local HEAD does not match origin/main" });
  }
  if (!divergenceRaw.ok || !divergence.ok) {
    blockers.push({ gate: "git_integration", reason: `git rev-list --left-right --count HEAD...origin/main failed: ${divergenceRaw.output}` });
  } else if (divergence.behind_by > 0) {
    blockers.push({ gate: "git_integration", reason: `local branch is behind origin/main by ${divergence.behind_by} commit(s)` });
  }
  if (divergence.diverged) {
    blockers.push({ gate: "git_integration", reason: "local branch has diverged from origin/main" });
  }
  if (!remoteChangedRaw.ok) {
    blockers.push({ gate: "git_integration", reason: `git diff --name-only HEAD..origin/main failed: ${remoteChangedRaw.output}` });
  } else if (overlapFiles.length > 0) {
    blockers.push({ gate: "git_integration", reason: `remote changes overlap local dirty files: ${overlapFiles.join(", ")}` });
  }

  if (!releaseCheck.current) {
    blockers.push({ gate: "release_check", reason: releaseCheck.reason || "run npm run release:check before pushing" });
  }
  blockers.push({ gate: "release_verify", reason: "run npm run release:verify -- --date YYYY-MM-DD after pushing" });
  blockers.push({ gate: "daily_summary_publish", reason: "verify Daily Summary Publish succeeds on the pushed headSha" });
  blockers.push({ gate: "cloudflare_pages", reason: "verify Cloudflare Pages public URL and daily summary URL are reachable" });
  blockers.push({ gate: "wecom_delivery", reason: "verify card and image delivery with a real WeCom run" });
  blockers.push({ gate: "agent_cleanup", reason: "confirm active agent count is 0-2 and close completed agents" });

  const complete = blockers.length === 0;
  const nextAction = clean && headMatchesOrigin
    ? "run production verification after push"
    : "do not mark complete; finish git integration first";

  return {
    checklist: checklistPath,
    read_only: true,
    complete,
    blockers,
    git: {
      status_ok: gitStatus.ok,
      changed_entries: changed.length,
      clean,
      head_ok: head.ok,
      head: head.ok ? head.output : "",
      origin_main_ok: originHead.ok,
      origin_main: originHead.ok ? originHead.output : "",
      head_matches_origin_main: headMatchesOrigin,
      divergence_ok: divergenceRaw.ok && divergence.ok,
      ahead_by: divergence.ahead_by,
      behind_by: divergence.behind_by,
      diverged: divergence.diverged,
      dirty_files: dirtyFiles,
      remote_changed_files: remoteChangedFiles,
      overlap_files: overlapFiles,
      overlap_count: overlapFiles.length,
    },
    release_check: releaseCheck,
    commands: {
      release_check: "npm run release:check",
      release_verify: "npm run release:verify -- --date YYYY-MM-DD",
    },
    gates: [
      "release_check",
      "git_integration",
      "release_verify",
      "daily_summary_publish",
      "cloudflare_pages",
      "wecom_delivery",
      "agent_cleanup",
    ],
    next_action: nextAction,
  };
}

function printText(payload) {
  console.log("integration status");
  console.log(`checklist: ${payload.checklist}`);
  console.log(`read_only: ${payload.read_only}`);
  console.log(`git status --short: ${payload.git.clean ? "clean" : `${payload.git.changed_entries} changed entries`}`);
  console.log(`git rev-parse HEAD: ${statusLabel(payload.git.head_ok)}${payload.git.head_ok ? ` ${payload.git.head}` : ""}`);
  console.log(`git rev-parse origin/main: ${statusLabel(payload.git.origin_main_ok)}${payload.git.origin_main_ok ? ` ${payload.git.origin_main}` : ""}`);
  console.log(`head_matches_origin_main: ${payload.git.head_matches_origin_main}`);
  console.log(`git divergence: ahead_by=${payload.git.ahead_by}, behind_by=${payload.git.behind_by}, diverged=${payload.git.diverged}`);
  console.log(`remote/local overlap: ${payload.git.overlap_count}`);
  if (payload.git.overlap_files.length > 0) {
    for (const file of payload.git.overlap_files) {
      console.log(`  - ${file}`);
    }
  }
  console.log(`complete: ${payload.complete}`);
  console.log("");
  if (payload.blockers.length > 0) {
    console.log("blockers:");
    for (const blocker of payload.blockers) {
      console.log(`- ${blocker.gate}: ${blocker.reason}`);
    }
    console.log("");
  }
  console.log("required gates before complete:");
  console.log(`- ${payload.commands.release_check}`);
  console.log("- commit and push until git status --short is clean");
  console.log(`- ${payload.commands.release_verify}`);
  console.log("- Daily Summary Publish successful on pushed headSha");
  console.log("- Cloudflare Pages public page reachable");
  console.log("- WeCom card and image delivery verified by real run");
  console.log("- agent cleanup complete: active agent count 0-2, close completed agents");
  console.log("");
  console.log(`next: ${payload.next_action}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const payload = collectStatus();
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  printText(payload);
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
