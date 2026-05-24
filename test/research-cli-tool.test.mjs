import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
let tsHookInstalled = false;

function installResearchTsHook() {
  if (tsHookInstalled) return;
  const typescriptPath = require.resolve("typescript", {
    paths: [path.resolve("apps/research-console")],
  });
  const ts = require(typescriptPath);

  require.extensions[".ts"] = (module, filename) => {
    const source = readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        jsx: ts.JsxEmit.ReactJSX,
        resolveJsonModule: true,
      },
      fileName: filename,
    }).outputText;
    module._compile(output, filename);
  };

  tsHookInstalled = true;
}

function loadResearchConsoleModule(relativePath) {
  installResearchTsHook();
  const resolved = path.resolve(relativePath);
  delete require.cache[resolved];
  return require(resolved);
}

async function withTempCwd(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "research-cli-"));
  try {
    return await callback(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

test("cli_execute is a local approval-gated research tool", () => {
  const { authorizeResearchTool, isResearchToolName, listResearchToolReadiness } =
    loadResearchConsoleModule("apps/research-console/lib/tool-policy.ts");

  const policy = authorizeResearchTool("cli_execute");
  assert.equal(policy.status, "allowed");
  assert.match(policy.reason, /approval/i);
  assert.equal(isResearchToolName("cli_execute"), true);

  const readiness = listResearchToolReadiness();
  const cli = readiness.find((tool) => tool.name === "cli_execute");
  assert.ok(cli);
  assert.equal(cli.source, "local");
  assert.equal(cli.enabled, true);
  assert.equal(cli.approvalRequired, true);
});

test("cli_execute returns pending before approval and never exposes full env", async () => {
  const { executeResearchTool } = loadResearchConsoleModule(
    "apps/research-console/lib/agent-tools.ts",
  );

  await withTempCwd(async (cwd) => {
    const trace = await executeResearchTool(
      {
        name: "cli_execute",
        input: {
          command: process.execPath,
          args: JSON.stringify(["-e", "console.log(process.env.SECRET_VALUE || 'empty')"]),
          cwd,
          envKeys: "SECRET_VALUE",
        },
      },
      {
        day: "2026-05-22",
        eventSummary: [],
        overview: [],
        adminCore: [],
        adminSymbols: [],
        risks: [],
      },
    );

    assert.equal(trace.name, "cli_execute");
    assert.equal(trace.execution_status, "pending_approval");
    assert.equal(trace.approval_required, true);
    assert.match(trace.result_summary, /pending approval/i);
    assert.doesNotMatch(trace.result_summary, /SECRET_VALUE=.*secret/i);
  });
});

test("approved cli execution returns bounded stdout, stderr, and exit status", async () => {
  const { executeApprovedCliTool } = loadResearchConsoleModule(
    "apps/research-console/lib/agent-tools.ts",
  );

  await withTempCwd(async (cwd) => {
    const trace = await executeApprovedCliTool({
      command: process.execPath,
      args: JSON.stringify(["-e", "console.log('cli-ok')"]),
      cwd,
      timeoutMs: "5000",
      envKeys: "",
    });

    assert.equal(trace.name, "cli_execute");
    assert.equal(trace.execution_status, "approved");
    assert.equal(trace.approval_required, false);
    assert.match(trace.result_summary, /exit 0/);
    assert.match(trace.result_summary, /cli-ok/);
    assert.doesNotMatch(JSON.stringify(trace), new RegExp(cwd.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")));
  });
});

test("rejected cli execution records the rejected state without running", async () => {
  const { buildRejectedCliTrace } = loadResearchConsoleModule(
    "apps/research-console/lib/agent-tools.ts",
  );

  const trace = buildRejectedCliTrace({
    command: process.execPath,
    args: JSON.stringify(["-e", "process.exit(1)"]),
    cwd: process.cwd(),
  });

  assert.equal(trace.name, "cli_execute");
  assert.equal(trace.execution_status, "rejected");
  assert.equal(trace.approval_required, false);
  assert.match(trace.result_summary, /rejected/i);
});
