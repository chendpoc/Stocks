import { strict as assert } from "node:assert";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const ROOT = process.cwd();

function appPath(...parts) {
  return path.join(ROOT, "apps", "research-console", ...parts);
}

async function readAppFile(...parts) {
  return readFile(appPath(...parts), "utf8");
}

test("research console shell exposes a real command palette with shared opportunity state", async () => {
  const workspace = await readAppFile("components", "ResearchWorkspace.tsx");
  const board = await readAppFile("components", "OpportunityBoard.tsx");
  const agentPanel = await readAppFile("components", "AgentPanel.tsx");
  const scoreRows = await readAppFile("components", "ScoreRows.tsx");
  const inspector = await readAppFile("components", "research", "ResearchInspector.tsx");
  const viewModel = await readAppFile("components", "research", "opportunity-view-model.ts");

  assert.match(workspace, /CommandPalette/);
  assert.match(workspace, /research-shell-grid/);
  assert.match(workspace, /research-topbar/);
  assert.match(workspace, /agent-shell/);
  assert.match(workspace, /selectedSymbol/);
  assert.match(workspace, /opportunityFilter/);
  assert.match(workspace, /addEventListener\("keydown"/);
  assert.match(workspace, /setActiveTab/);
  assert.match(workspace, /setAgentPrompt/);

  assert.match(board, /selectedSymbol:\s*string\s*\|\s*null/);
  assert.match(board, /onSelectedSymbolChange/);
  assert.match(board, /filter:\s*string/);
  assert.match(board, /visibleRows|visibleScores|filteredScores/);
  assert.match(board, /firstSelectableSymbol/);
  assert.doesNotMatch(board, /id="opportunity-board-day"/);

  assert.doesNotMatch(agentPanel, /onDayChange/);
  assert.doesNotMatch(agentPanel, /id="agent-panel-day"/);

  assert.match(scoreRows, /formatScoreReason/);
  assert.match(scoreRows, /score-components-compact/);
  assert.doesNotMatch(scoreRows, /<p className="score-reason">\{row\.reason\}<\/p>/);
  assert.match(inspector, /Research Inspector/);
  assert.match(inspector, /research-inspector-pro/);
  assert.match(viewModel, /formatScoreReason/);
  await assert.rejects(access(appPath("components", "OpportunityDetail.tsx")));
});

test("research cockpit header surfaces day, source readiness, opportunity pressure, review, and agent state", async () => {
  const workspace = await readAppFile("components", "ResearchWorkspace.tsx");
  const agentPanel = await readAppFile("components", "AgentPanel.tsx");
  const globals = await readAppFile("app", "globals.css");

  assert.match(workspace, /type AgentRailStatus = \{/);
  assert.match(workspace, /function CockpitStatusHeader/);
  assert.match(workspace, /className="cockpit-status-header"/);
  assert.match(workspace, /aria-label="研究工作台状态"/);
  assert.match(workspace, /资料完整度/);
  assert.match(workspace, /证据缺口/);
  assert.match(workspace, /Agent 状态/);
  assert.match(workspace, /missingEvidenceNeedCount/);
  assert.match(workspace, /session\?\.opportunities\.reduce/);
  assert.match(workspace, /agentRailStatus,\s*setAgentRailStatus/);
  assert.match(workspace, /agentStatus=\{agentRailStatus\}/);
  assert.match(workspace, /onStatusChange=\{setAgentRailStatus\}/);

  assert.match(agentPanel, /onStatusChange\?: \(status: AgentRailStatus\) => void/);
  assert.match(agentPanel, /onStatusChange\?\.\(/);
  assert.match(agentPanel, /tone: "running"/);
  assert.match(agentPanel, /tone: "error"/);
  assert.match(agentPanel, /tone: "ready"/);
  assert.match(agentPanel, /tone: "idle"/);

  for (const token of [
    "cockpit-status-header",
    "cockpit-status-primary",
    "cockpit-status-metrics",
    "cockpit-status-card",
    "cockpit-status-card-agent",
  ]) {
    assert.match(globals, new RegExp(`\\.${token}`));
  }
});

test("research console has shadcn-style primitives and dependencies for the shell", async () => {
  const packageJson = JSON.parse(await readAppFile("package.json"));
  const globals = await readAppFile("app", "globals.css");
  const commandPrimitive = await readAppFile("components", "ui", "command.tsx");

  for (const dependency of [
    "@radix-ui/react-dialog",
    "@radix-ui/react-slot",
    "class-variance-authority",
    "cmdk",
    "clsx",
    "lucide-react",
    "tailwind-merge",
  ]) {
    assert.ok(packageJson.dependencies?.[dependency], `${dependency} should be a research-console dependency`);
  }

  for (const devDependency of ["tailwindcss", "postcss", "autoprefixer"]) {
    assert.ok(packageJson.devDependencies?.[devDependency], `${devDependency} should be a research-console devDependency`);
  }

  for (const file of [
    ["components", "ui", "button.tsx"],
    ["components", "ui", "badge.tsx"],
    ["components", "ui", "card.tsx"],
    ["components", "ui", "command.tsx"],
    ["components", "ui", "input.tsx"],
    ["components", "ui", "separator.tsx"],
    ["components", "ui", "textarea.tsx"],
    ["lib", "utils.ts"],
    ["tailwind.config.ts"],
    ["postcss.config.mjs"],
  ]) {
    await access(appPath(...file));
  }

  assert.match(globals, /@tailwind base/);
  assert.match(globals, /--radius/);
  assert.match(commandPrimitive, /DialogPrimitive\.Title/);
  assert.match(commandPrimitive, /DialogPrimitive\.Description/);
});

test("professional opportunity workflow is split into blotter, inspector, timeline, and view model", async () => {
  const workspace = await readAppFile("components", "ResearchWorkspace.tsx");
  const board = await readAppFile("components", "OpportunityBoard.tsx");

  for (const file of [
    ["components", "research", "OpportunityBlotter.tsx"],
    ["components", "research", "ResearchInspector.tsx"],
    ["components", "research", "EvidenceTimeline.tsx"],
    ["components", "research", "AgentTimeline.tsx"],
    ["components", "research", "opportunity-view-model.ts"],
  ]) {
    await access(appPath(...file));
  }

  const blotter = await readAppFile("components", "research", "OpportunityBlotter.tsx");
  const inspector = await readAppFile("components", "research", "ResearchInspector.tsx");
  const evidenceTimeline = await readAppFile("components", "research", "EvidenceTimeline.tsx");
  const viewModel = await readAppFile("components", "research", "opportunity-view-model.ts");

  assert.match(workspace, /session=\{session\}/);
  assert.match(board, /session\?:\s*ResearchSession\s*\|\s*null/);
  assert.match(board, /buildOpportunityRows/);
  assert.match(board, /<OpportunityBlotter/);
  assert.match(board, /<ResearchInspector/);
  assert.match(board, /onSessionRefresh/);

  assert.match(blotter, /<table/);
  assert.match(blotter, /rank \/ symbol \/ score \/ confidence/i);
  assert.match(blotter, /research status/i);
  assert.match(blotter, /evidence gap/i);
  assert.match(blotter, /ArrowDown/);
  assert.match(blotter, /ArrowUp/);
  assert.match(blotter, /aria-selected/);

  assert.match(inspector, /判断摘要/);
  assert.match(inspector, /证据缺口/);
  assert.match(inspector, /外部证据动作/);
  assert.match(inspector, /复盘入口/);
  assert.match(inspector, /EvidenceTimeline/);
  assert.match(inspector, /\/api\/research\/review-record/);
  assert.doesNotMatch(inspector, /rawMarkdown|rawJson|process\.env|Authorization|chain-of-thought/i);

  assert.match(evidenceTimeline, /supporting|contradicting|neutral|blocked/);
  assert.match(viewModel, /export type OpportunityRowView/);
  assert.match(viewModel, /export type EvidenceActionView/);
  assert.match(viewModel, /export type InspectorView/);
  assert.match(viewModel, /待补证据/);
  assert.match(viewModel, /证据已刷新/);
  assert.match(viewModel, /观察中/);
  assert.match(viewModel, /已失效/);
  assert.match(viewModel, /已复盘/);
});

test("opportunity blotter uses roving focus when keyboard selection changes rows", async () => {
  const blotter = await readAppFile("components", "research", "OpportunityBlotter.tsx");

  assert.match(blotter, /useRef/);
  assert.match(blotter, /rowRefs/);
  assert.match(blotter, /function focusOpportunityRow/);
  assert.match(blotter, /scrollIntoView\(\{ block: "nearest"/);
  assert.match(blotter, /focus\(\{ preventScroll: true \}\)/);
  assert.match(blotter, /tabIndex=\{selected \? 0 : -1\}/);
  assert.match(blotter, /moveSelection\(rows, row\.symbol, 1, onSelectedSymbolChange, focusOpportunityRow\)/);
  assert.match(blotter, /moveSelection\(rows, row\.symbol, -1, onSelectedSymbolChange, focusOpportunityRow\)/);
});

test("command palette and agent rail expose professional research workflow actions", async () => {
  const workspace = await readAppFile("components", "ResearchWorkspace.tsx");
  const agentPanel = await readAppFile("components", "AgentPanel.tsx");
  const agentTimeline = await readAppFile("components", "research", "AgentTimeline.tsx");

  for (const label of [
    "Go to module",
    "Switch research day",
    "Open symbol",
    "Run evidence action",
    "Ask agent",
    "Create review note",
  ]) {
    assert.match(workspace, new RegExp(label));
  }

  for (const token of ["@", "day:", "/evidence", "/agent"]) {
    assert.match(workspace, new RegExp(token.replace("/", "\\/")));
  }

  assert.match(workspace, /pendingEvidenceAction/);
  assert.match(workspace, /pendingReviewSymbol/);
  assert.match(workspace, /type CommandIntent/);
  assert.match(workspace, /function parseCommandIntent/);
  assert.match(workspace, /intent\.evidenceToken/);
  assert.match(workspace, /visibleEvidenceCommands/);
  assert.match(workspace, /intent\.agentAction === "invalidate"/);
  assert.match(workspace, /explicitSymbol/);
  assert.match(workspace, /value=\{`day:\$\{availableDay\} \$\{availableDay\} \$\{intent\.explicitSymbol \? `@\$\{intent\.explicitSymbol\}` : ""\}`\}/);
  assert.match(workspace, /选择后会切换到 \{availableDay\} 并选中 \{intent\.explicitSymbol\}/);
  assert.match(workspace, /选择后会/);
  assert.match(workspace, /setLastFocusedElement/);
  assert.match(workspace, /lastFocusedElementRef/);

  assert.match(agentPanel, /selectedSymbol\?:\s*string\s*\|\s*null/);
  assert.match(agentPanel, /AgentTimeline/);
  assert.match(agentPanel, /当前机会/);
  assert.match(agentTimeline, /plan step/i);
  assert.match(agentTimeline, /tool blocked\/executed/i);
  assert.match(agentTimeline, /judgement summary/i);
  assert.match(agentTimeline, /invalidation note/i);
  assert.doesNotMatch(agentTimeline, /chain-of-thought|raw prompt|process\.env|Authorization/i);
});

test("blotter filters and inspector forms are daily-use ready", async () => {
  const board = await readAppFile("components", "OpportunityBoard.tsx");
  const blotter = await readAppFile("components", "research", "OpportunityBlotter.tsx");
  const inspector = await readAppFile("components", "research", "ResearchInspector.tsx");
  const viewModel = await readAppFile("components", "research", "opportunity-view-model.ts");
  const globals = await readAppFile("app", "globals.css");
  const filterChipRule = globals.match(/\.filter-chip-button \{[^}]+\}/)?.[0] ?? "";

  for (const label of ["状态", "置信度", "工具", "证据缺口"]) {
    assert.match(blotter, new RegExp(label));
  }

  assert.match(board, /filterOpportunityRows/);
  assert.match(board, /const allRows = useMemo/);
  assert.match(board, /allRows=\{allRows\}/);
  assert.doesNotMatch(board, /showEmptyFilter \?/);

  assert.match(blotter, /allRows:\s*OpportunityRowView\[\]/);
  assert.match(blotter, /function activeFilterSummary/);
  assert.match(blotter, /function filterCountBy/);
  assert.match(blotter, /function resetOpportunityFilters/);
  assert.match(blotter, /筛选结果/);
  assert.match(blotter, /filter-chip-button/);
  assert.match(blotter, /aria-pressed=\{/);
  assert.match(blotter, /aria-label=\{`筛选状态/);
  assert.doesNotMatch(blotter, /<select/);
  assert.match(globals, /\.opportunity-filter-pills[\s\S]*overflow-x:\s*auto/);
  assert.match(globals, /\.opportunity-filter-pills[\s\S]*flex-wrap:\s*nowrap/);
  assert.match(globals, /\.opportunity-filter-chip-group[\s\S]*flex-wrap:\s*nowrap/);
  assert.match(globals, /\.opportunity-board\.opportunity-blotter > \.opportunity-board-head[\s\S]*display:\s*none/);
  assert.match(filterChipRule, /white-space:\s*nowrap/);
  assert.match(blotter, /待补证据/);
  assert.match(blotter, /证据已刷新/);
  assert.match(blotter, /已复盘/);
  assert.match(blotter, /has-tools/);
  assert.match(blotter, /blocked/);
  assert.match(blotter, /cached/);

  assert.match(viewModel, /EXECUTABLE_EVIDENCE_TOOLS/);
  assert.match(viewModel, /manual_filing_review/);
  assert.match(viewModel, /state:\s*"blocked"/);
  assert.match(viewModel, /人工复核/);
  assert.doesNotMatch(viewModel, /request:\s*buildActionRequest\([^)]*manual_filing_review/);

  for (const label of ["复盘结果", "观察到的变化", "失效原因", "学习记录"]) {
    assert.match(inspector, new RegExp(label));
  }
  assert.match(inspector, /reviewFormRef/);
  assert.match(inspector, /scrollIntoView/);
  assert.match(inspector, /focus\(\)/);
  assert.doesNotMatch(inspector, />outcome</);
  assert.doesNotMatch(inspector, />observedMove</);
  assert.doesNotMatch(inspector, />failureReason</);
  assert.doesNotMatch(inspector, />learning</);
});

test("inspector evidence actions explain state, question, and last run context", async () => {
  const inspector = await readAppFile("components", "research", "ResearchInspector.tsx");
  const viewModel = await readAppFile("components", "research", "opportunity-view-model.ts");
  const globals = await readAppFile("app", "globals.css");
  const evidenceQueueIndex = inspector.indexOf("Evidence Queue");
  const judgementIndex = inspector.indexOf("判断摘要");

  for (const field of [
    "groupLabel",
    "stateReason",
    "lastRunLabel",
    "lastRunSummary",
    "lastRunAt",
    "lastRunVerdictLabel",
  ]) {
    assert.match(viewModel, new RegExp(`${field}:`));
  }

  assert.match(viewModel, /EVIDENCE_KIND_LABELS/);
  assert.match(viewModel, /VERDICT_LABELS/);
  assert.match(viewModel, /无运行记录/);
  assert.match(viewModel, /可再运行/);

  for (const token of [
    "inspector-action-card",
    "inspector-action-head",
    "inspector-action-state",
    "inspector-action-question",
    "inspector-action-reason",
    "inspector-action-last-run",
    "inspector-action-foot",
    "inspector-evidence-queue",
    "inspector-evidence-queue-head",
    "inspector-evidence-queue-stats",
    "inspector-evidence-primary",
    "inspector-evidence-focus-button",
  ]) {
    assert.match(inspector, new RegExp(token));
    assert.match(globals, new RegExp(`\\.${token}`));
  }

  assert.match(inspector, /刷新后会更新最近 evidence runs 和机会状态/);
  assert.ok(evidenceQueueIndex >= 0, "inspector should render an Evidence Queue section");
  assert.ok(
    evidenceQueueIndex < judgementIndex,
    "Evidence Queue should appear before narrative judgement details",
  );
  assert.match(inspector, /function buildEvidenceQueueStats/);
  assert.match(inspector, /function orderedEvidenceActions/);
  assert.match(inspector, /function primaryEvidenceAction/);
  assert.match(inspector, /const evidenceQueueStats = buildEvidenceQueueStats\(activeView\.evidenceActions\)/);
  assert.match(inspector, /const orderedActions = orderedEvidenceActions\(activeView\.evidenceActions\)/);
  assert.match(inspector, /const primaryAction = primaryEvidenceAction\(orderedActions\)/);
  assert.match(inspector, /定位首个可运行/);
  assert.match(inspector, /上次证据/);
  assert.match(inspector, /action\.stateReason/);
  assert.match(inspector, /action\.lastRunSummary/);
  assert.match(inspector, /action\.lastRunLabel/);
  assert.match(inspector, /action\.lastRunVerdictLabel/);
  assert.match(inspector, /aria-live="polite"/);
  assert.match(inspector, /disabled=\{pending \|\| !action\.executable\}/);
});

test("command palette evidence actions focus inspector cards instead of hidden background execution", async () => {
  const workspace = await readAppFile("components", "ResearchWorkspace.tsx");
  const board = await readAppFile("components", "OpportunityBoard.tsx");
  const inspector = await readAppFile("components", "research", "ResearchInspector.tsx");
  const globals = await readAppFile("app", "globals.css");

  assert.match(workspace, /onEvidenceCommand\(\{ symbol: targetSymbol, tool: command\.tool, label: command\.label \}\)/);
  assert.match(workspace, /pendingEvidenceAction:\s*\{\s*id:\s*number;\s*symbol:\s*string;\s*tool:\s*string;\s*label:\s*string;\s*\}/);
  assert.match(workspace, /选择后会切换到机会观察，选中 \{targetSymbol\} 并定位/);

  assert.match(board, /pendingEvidenceAction=\{pendingEvidenceAction\}/);
  assert.match(board, /onPendingEvidenceActionHandled=\{onPendingEvidenceActionHandled\}/);
  assert.doesNotMatch(board, /void runEvidenceTool\(\{ day, \.\.\.action\.request \}\)/);
  assert.doesNotMatch(board, /正在从命令面板触发/);

  assert.match(inspector, /pendingEvidenceAction\?:\s*PendingEvidenceAction\s*\|\s*null/);
  assert.match(inspector, /onPendingEvidenceActionHandled\?:\s*\(id:\s*number\) => void/);
  assert.match(inspector, /actionButtonRefs/);
  assert.match(inspector, /pendingActionStatus/);
  assert.match(inspector, /commandHandoff/);
  assert.match(inspector, /inspector-command-handoff/);
  assert.match(inspector, /focusCommandHandoffTarget/);
  assert.match(inspector, /Command handoff/);
  assert.match(inspector, /查看目标/);
  assert.match(inspector, /来自命令面板/);
  assert.match(inspector, /scrollIntoView/);
  assert.match(inspector, /focus\(\)/);
  assert.match(inspector, /inspector-action-card-command/);
  assert.match(inspector, /data-command-target/);
  assert.match(inspector, /按 Enter 或点击运行/);
  assert.match(inspector, /aria-live="polite"[\s\S]*pendingActionStatus/);
  assert.match(globals, /\.inspector-action-card-command/);
  assert.match(globals, /\.inspector-command-handoff/);
});

test("command palette evidence actions keep label, token, and tool contract aligned", async () => {
  const workspace = await readAppFile("components", "ResearchWorkspace.tsx");

  assert.match(workspace, /const EVIDENCE_COMMANDS = \[/);
  for (const tool of [
    "yfinance_quote",
    "yfinance_history",
    "alpha_vantage_quote",
    "longbridge_quote",
    "news_search",
  ]) {
    assert.match(workspace, new RegExp(`tool: "${tool}"`));
  }
  assert.match(workspace, /const visibleEvidenceCommands = EVIDENCE_COMMANDS\.filter/);
  assert.match(workspace, /visibleEvidenceCommands\.map\(\(command\)/);
  assert.match(workspace, /value=\{`\/evidence \$\{command\.token\} \$\{targetSymbol\}`\}/);
  assert.match(workspace, /onEvidenceCommand\(\{ symbol: targetSymbol, tool: command\.tool, label: command\.label \}\)/);
  assert.doesNotMatch(workspace, /tool:\s*targetEvidenceTool/);
  assert.doesNotMatch(workspace, /function commandEvidenceTool/);
});

test("inspector evidence action results stay attached to the executed card", async () => {
  const inspector = await readAppFile("components", "research", "ResearchInspector.tsx");
  const globals = await readAppFile("app", "globals.css");

  assert.match(inspector, /type ActionResultView/);
  assert.match(inspector, /actionResultById/);
  assert.match(inspector, /setActionResultById/);
  assert.match(inspector, /\[action\.id\]:\s*\{\s*\.\.\.result,\s*capturedAt:/);
  assert.match(inspector, /actionResult\s*=\s*actionResultById\[action\.id\]/);
  assert.match(inspector, /inspector-action-result/);
  assert.match(inspector, /本次结果/);
  assert.match(inspector, /resultStatus\(actionResult\)/);
  assert.match(inspector, /actionResult\.tool\.result_summary/);
  assert.match(inspector, /actionResult\.capturedAt/);
  assert.match(inspector, /setPendingActionStatus\(`已完成/);
  assert.doesNotMatch(inspector, /actionResult\.tool\.input|actionResult\.tool\.cwd|actionResult\.tool\.env_keys/);

  for (const token of [
    "inspector-action-result",
    "inspector-action-result-allowed",
    "inspector-action-result-blocked",
    "inspector-action-result-failed",
  ]) {
    assert.match(globals, new RegExp(`\\.${token}`));
  }
});

test("inspector evidence action results are structured for fast scanning", async () => {
  const inspector = await readAppFile("components", "research", "ResearchInspector.tsx");
  const globals = await readAppFile("app", "globals.css");

  assert.match(inspector, /function resultLabel/);
  assert.match(inspector, /function resultNextStep/);
  assert.match(inspector, /function resultTone/);
  assert.match(inspector, /const actionResultStatus = actionResult \? resultStatus\(actionResult\) : ""/);
  assert.match(inspector, /const actionResultLabel = resultLabel\(actionResultStatus\)/);
  assert.match(inspector, /const actionResultNextStep = resultNextStep\(actionResultStatus\)/);
  assert.match(inspector, /inspector-action-result-head/);
  assert.match(inspector, /inspector-action-result-grid/);
  assert.match(inspector, /<span>状态<\/span>[\s\S]*\{actionResultLabel\}/);
  assert.match(inspector, /<span>原因<\/span>[\s\S]*\{actionResult\.tool\.result_summary\}/);
  assert.match(inspector, /<span>下一步<\/span>[\s\S]*\{actionResultNextStep\}/);
  assert.match(inspector, /<span>时间<\/span>[\s\S]*\{actionResult\.capturedAt\}/);
  assert.match(inspector, /被阻断/);
  assert.match(inspector, /复核工具配置或改走人工复核/);
  assert.match(inspector, /回到最近 evidence runs 复核证据影响/);

  for (const token of [
    "inspector-action-result-head",
    "inspector-action-result-grid",
    "inspector-action-result-summary",
  ]) {
    assert.match(globals, new RegExp(`\\.${token}`));
  }
});

test("evidence tool execution errors remain visible as non-ready timeline evidence", async () => {
  const coreTypes = await readAppFile("..", "..", "packages", "summary-core", "src", "index.ts");
  const evidenceRoute = await readAppFile("app", "api", "research", "evidence", "route.ts");
  const sessionLib = await readAppFile("lib", "research-session.ts");
  const viewModel = await readAppFile("components", "research", "opportunity-view-model.ts");
  const timeline = await readAppFile("components", "research", "EvidenceTimeline.tsx");
  const globals = await readAppFile("app", "globals.css");

  assert.match(coreTypes, /\|\s*"error"/);
  assert.match(evidenceRoute, /function traceFromToolError/);
  assert.match(evidenceRoute, /const errorTrace = traceFromToolError/);
  assert.match(evidenceRoute, /await appendEvidenceRun\(day,[\s\S]*verdict: "error"/);
  assert.match(sessionLib, /input\.verdict !== "blocked" && input\.verdict !== "error"/);
  assert.match(viewModel, /matchingRun\.verdict === "error"/);
  assert.match(timeline, /error: "error"/);
  assert.match(timeline, /verdict === "error"/);
  assert.match(globals, /evidence-run-error/);
});

test("inspector evidence results can be carried into a focused review draft", async () => {
  const inspector = await readAppFile("components", "research", "ResearchInspector.tsx");
  const globals = await readAppFile("app", "globals.css");

  assert.match(inspector, /function buildReviewDraftFromAction/);
  assert.match(inspector, /function prefillReviewFromAction/);
  assert.match(inspector, /reviewDraftStatus/);
  assert.match(inspector, /setReviewDraftStatus/);
  assert.match(inspector, /setObservedMove\(draft\.observedMove\)/);
  assert.match(inspector, /setFailureReason\(draft\.failureReason\)/);
  assert.match(inspector, /setLearning\(draft\.learning\)/);
  assert.match(inspector, /setOutcome\(draft\.outcome\)/);
  assert.match(inspector, /reviewFormRef\.current\?\.scrollIntoView/);
  assert.match(inspector, /本次证据已带入复盘草稿/);
  assert.match(inspector, /带入复盘/);
  assert.match(inspector, /inspector-review-bridge/);
  assert.match(inspector, /inspector-review-draft-status/);
  assert.match(inspector, /action\.question/);
  assert.match(inspector, /actionResultNextStep/);
  assert.doesNotMatch(inspector, /setOutcome\("validated"\)/);

  for (const token of [
    "inspector-review-bridge",
    "inspector-review-draft-status",
    "inspector-review-bridge-button",
  ]) {
    assert.match(globals, new RegExp(`\\.${token}`));
  }
});

test("inspector exposes a compact workflow strip for evidence to review progress", async () => {
  const inspector = await readAppFile("components", "research", "ResearchInspector.tsx");
  const globals = await readAppFile("app", "globals.css");

  assert.match(inspector, /type WorkflowStepTone/);
  assert.match(inspector, /function buildWorkflowSteps/);
  assert.match(inspector, /function workflowNextAction/);
  assert.match(inspector, /const workflowSteps = buildWorkflowSteps\(activeView\)/);
  assert.match(inspector, /const nextWorkflowAction = workflowNextAction\(activeView\)/);
  assert.match(inspector, /inspector-workflow-strip/);
  assert.match(inspector, /inspector-workflow-step/);
  assert.match(inspector, /data-workflow-state/);
  assert.match(inspector, /证据缺口/);
  assert.match(inspector, /Evidence run/);
  assert.match(inspector, /复盘状态/);
  assert.match(inspector, /关键下一步/);
  assert.match(inspector, /view\.evidenceGaps\.length/);
  assert.match(inspector, /view\.recentEvidenceRuns\.length/);
  assert.match(inspector, /view\.reviewRecords\.length/);
  assert.match(inspector, /记录复盘/);
  assert.doesNotMatch(inspector, /买入|卖出|仓位|目标价/);

  for (const token of [
    "inspector-workflow-strip",
    "inspector-workflow-step",
    "inspector-workflow-next",
  ]) {
    assert.match(globals, new RegExp(`\\.${token}`));
  }
});

test("inspector workflow next action is an executable focus shortcut", async () => {
  const inspector = await readAppFile("components", "research", "ResearchInspector.tsx");
  const globals = await readAppFile("app", "globals.css");

  assert.match(inspector, /type WorkflowNextTarget/);
  assert.match(inspector, /function workflowNextTarget/);
  assert.match(inspector, /function workflowNextButtonLabel/);
  assert.match(inspector, /const workflowTarget = workflowNextTarget\(activeView\)/);
  assert.match(inspector, /const workflowButtonLabel = workflowNextButtonLabel\(workflowTarget\)/);
  assert.match(inspector, /function focusFirstExecutableEvidenceAction/);
  assert.match(inspector, /function handleWorkflowNextAction/);
  assert.match(inspector, /const firstExecutableAction = primaryAction/);
  assert.match(inspector, /const primaryAction = primaryEvidenceAction\(orderedActions\)/);
  assert.match(inspector, /actionButtonRefs\.current\[firstExecutableAction\.id\]\?\.scrollIntoView/);
  assert.match(inspector, /reviewFormRef\.current\?\.scrollIntoView/);
  assert.match(inspector, /invalidationSectionRef\.current\?\.scrollIntoView/);
  assert.match(inspector, /inspector-workflow-next-button/);
  assert.match(inspector, /aria-label=\{`执行关键下一步：\$\{nextWorkflowAction\}`\}/);
  assert.match(inspector, /onClick=\{handleWorkflowNextAction\}/);
  assert.match(inspector, /定位证据动作/);
  assert.match(inspector, /打开复盘入口/);
  assert.match(inspector, /查看失效条件/);

  assert.match(globals, /\.inspector-workflow-next-button/);
  assert.match(globals, /\.inspector-workflow-next-button:focus-visible/);
});

test("inspector workflow can hand current opportunity prompts to the agent rail", async () => {
  const workspace = await readAppFile("components", "ResearchWorkspace.tsx");
  const board = await readAppFile("components", "OpportunityBoard.tsx");
  const inspector = await readAppFile("components", "research", "ResearchInspector.tsx");
  const agentPanel = await readAppFile("components", "AgentPanel.tsx");
  const globals = await readAppFile("app", "globals.css");

  assert.match(inspector, /onAgentPrompt\?: \(command: \{ text: string; source\?: string; symbol\?: string; promptType\?: string; day\?: string \}\) => void/);
  assert.match(inspector, /function buildWorkflowAgentPrompt/);
  assert.match(inspector, /function sendWorkflowPromptToAgent/);
  assert.match(inspector, /onAgentPrompt\?\.\(\{[\s\S]*text: buildWorkflowAgentPrompt\(\{/);
  assert.match(inspector, /activeView\.row\.symbol/);
  assert.match(inspector, /day,/);
  assert.match(inspector, /workflowTarget,/);
  assert.match(inspector, /问 Agent 反证/);
  assert.match(inspector, /inspector-workflow-agent-button/);
  assert.match(inspector, /已写入右侧 Agent 输入框/);
  assert.doesNotMatch(inspector, /chain-of-thought|raw prompt|process\.env|Authorization/i);
  assert.doesNotMatch(inspector, /买入|卖出|仓位|目标价/);

  assert.match(board, /onAgentPrompt\?: \(command: \{ text: string; source\?: string; symbol\?: string; promptType\?: string; day\?: string \}\) => void/);
  assert.match(board, /onAgentPrompt=\{onAgentPrompt\}/);
  assert.match(workspace, /onAgentPrompt: \(command: Omit<AgentPromptCommand, "id">\) => void/);
  assert.match(workspace, /onAgentPrompt=\{handleAgentPrompt\}/);
  assert.match(workspace, /<OpportunityBoard[\s\S]*onAgentPrompt=\{onAgentPrompt\}/);

  assert.match(agentPanel, /const messageInputRef = useRef<HTMLTextAreaElement \| null>\(null\)/);
  assert.match(agentPanel, /messageInputRef\.current\?\.focus\(\)/);
  assert.match(agentPanel, /ref=\{messageInputRef\}/);

  assert.match(globals, /\.inspector-workflow-agent-button/);
  assert.match(globals, /\.inspector-workflow-agent-status/);
});

test("agent panel shows prompt source metadata from inspector handoff", async () => {
  const workspace = await readAppFile("components", "ResearchWorkspace.tsx");
  const inspector = await readAppFile("components", "research", "ResearchInspector.tsx");
  const agentPanel = await readAppFile("components", "AgentPanel.tsx");
  const globals = await readAppFile("app", "globals.css");

  assert.match(workspace, /type AgentPromptCommand = \{[\s\S]*source\?: string[\s\S]*symbol\?: string[\s\S]*promptType\?: string[\s\S]*day\?: string/);
  assert.match(workspace, /function handleAgentPrompt\(command: Omit<AgentPromptCommand, "id">\)/);
  assert.match(workspace, /setAgentPrompt\(\{ id: Date\.now\(\), \.\.\.command \}\)/);

  assert.match(inspector, /onAgentPrompt\?: \(command: \{ text: string; source\?: string; symbol\?: string; promptType\?: string; day\?: string \}\) => void/);
  assert.match(inspector, /source: "Inspector"/);
  assert.match(inspector, /symbol: activeView\.row\.symbol/);
  assert.match(inspector, /promptType: workflowTarget/);

  assert.match(agentPanel, /promptCommand\?: \{ id: number; text: string; source\?: string; symbol\?: string; promptType\?: string; day\?: string \} \| null/);
  assert.match(agentPanel, /const \[promptMeta, setPromptMeta\]/);
  assert.match(agentPanel, /setPromptMeta\(\{[\s\S]*source: promptCommand\.source/);
  assert.match(agentPanel, /agent-prompt-origin/);
  assert.match(agentPanel, /Prompt source/);
  assert.match(agentPanel, /promptMeta\.source/);
  assert.match(agentPanel, /promptMeta\.symbol/);
  assert.match(agentPanel, /promptMeta\.promptType/);
  assert.doesNotMatch(agentPanel, /chain-of-thought|raw prompt|process\.env|Authorization/i);

  assert.match(globals, /\.agent-prompt-origin/);
  assert.match(globals, /\.agent-prompt-origin strong/);
});

test("review loop gives clear feedback and follows the selected opportunity", async () => {
  const workspace = await readAppFile("components", "ResearchWorkspace.tsx");
  const inspector = await readAppFile("components", "research", "ResearchInspector.tsx");

  assert.match(inspector, /reviewSaveStatus/);
  assert.match(inspector, /复盘已保存/);
  assert.match(inspector, /disabled=\{savingReview \|\| !observedMove\.trim\(\) \|\| !learning\.trim\(\)\}/);
  assert.match(inspector, /aria-live="polite"[\s\S]*reviewSaveStatus/);

  assert.match(workspace, /selectedSymbol\?:\s*string\s*\|\s*null/);
  assert.match(workspace, /selectedOpportunity/);
  assert.match(workspace, /opportunity\.symbols\.some/);
  assert.match(workspace, /<ReviewRecordsPanel[\s\S]*selectedSymbol=\{selectedSymbol\}/);
  assert.match(workspace, /REVIEW_OUTCOME_LABELS/);
  assert.match(workspace, /已验证/);
  assert.match(workspace, /已失效/);
  assert.match(workspace, /未确认/);
});

test("review outcome is visible in the blotter row and inspector review timeline", async () => {
  const blotter = await readAppFile("components", "research", "OpportunityBlotter.tsx");
  const inspector = await readAppFile("components", "research", "ResearchInspector.tsx");
  const viewModel = await readAppFile("components", "research", "opportunity-view-model.ts");
  const globals = await readAppFile("app", "globals.css");

  assert.match(viewModel, /latestReview:\s*ReviewRecord\s*\|\s*null/);
  assert.match(viewModel, /latestReviewLabel:\s*string/);
  assert.match(viewModel, /latestReviewAt:\s*string/);
  assert.match(viewModel, /latestReviewLearning:\s*string/);
  assert.match(viewModel, /reviewRecordsForOpportunity\(session,\s*opportunity\)/);

  assert.match(blotter, /<th scope="col">Review<\/th>/);
  assert.match(blotter, /blotter-review/);
  assert.match(blotter, /row\.latestReviewLabel/);
  assert.match(blotter, /row\.latestReviewAt/);
  assert.match(blotter, /row\.latestReviewLearning/);

  assert.match(inspector, /复盘时间线/);
  assert.match(inspector, /inspector-review-timeline/);
  assert.match(inspector, /inspector-review-event/);
  assert.match(inspector, /record\.createdAt/);
  assert.match(inspector, /REVIEW_OUTCOME_LABELS\[record\.outcome\]/);
  assert.match(inspector, /学习/);

  for (const token of [
    "blotter-review",
    "inspector-review-timeline",
    "inspector-review-event",
    "inspector-review-meta",
  ]) {
    assert.match(globals, new RegExp(`\\.${token}`));
  }
});

test("review save awaits session refresh before claiming the blotter and review list are current", async () => {
  const workspace = await readAppFile("components", "ResearchWorkspace.tsx");
  const inspector = await readAppFile("components", "research", "ResearchInspector.tsx");
  const board = await readAppFile("components", "OpportunityBoard.tsx");
  const globals = await readAppFile("app", "globals.css");

  assert.match(inspector, /onSessionRefresh\?:\s*\(\)\s*=>\s*Promise<void>/);
  assert.match(inspector, /await onSessionRefresh\?\.\(\)/);
  assert.match(inspector, /复盘已保存，机会行和复盘列表已刷新。/);
  assert.match(inspector, /const latestReviewSyncStatus/);
  assert.match(inspector, /view\.reviewRecords\[0\]/);
  assert.match(inspector, /inspector-review-sync-status/);
  assert.match(inspector, /最新复盘已同步到机会行和复盘列表/);

  assert.match(workspace, /onSaved:\s*\(\)\s*=>\s*Promise<void>/);
  assert.match(workspace, /await onSaved\(\)/);
  assert.match(workspace, /async function refreshSession/);
  assert.match(workspace, /await loadSession\(\)/);
  assert.match(workspace, /onSessionRefresh=\{refreshSession\}/);
  assert.match(workspace, /onSaved=\{onSessionRefresh\}/);
  assert.match(workspace, /复盘已保存，机会行和复盘列表已刷新。/);

  assert.match(board, /onSessionRefresh\?:\s*\(\)\s*=>\s*Promise<void>/);
  assert.match(board, /await onSessionRefresh\?\.\(\)/);
  assert.match(globals, /\.inspector-review-sync-status/);
});

test("review module renders a filterable ledger with selected-symbol context", async () => {
  const workspace = await readAppFile("components", "ResearchWorkspace.tsx");
  const globals = await readAppFile("app", "globals.css");

  assert.match(workspace, /type ReviewOutcomeFilter = ReviewRecord\["outcome"\] \| "all"/);
  assert.match(workspace, /onOpenOpportunity:\s*\(symbol:\s*string,\s*context\?:\s*ReviewOpenContext\)\s*=>\s*void/);
  assert.match(workspace, /reviewLedgerFilteredCount/);
  assert.match(workspace, /reviewLedgerTotalCount/);
  assert.match(workspace, /const summaryFilters/);
  assert.match(workspace, /setReviewOutcomeFilter\(item\.value\)/);
  assert.match(workspace, /onOpenOpportunity\(row\.symbols\[0\],\s*\{ source: "review-ledger", reviewId: row\.record\.id \}\)/);
  assert.match(workspace, /onOpenOpportunity=\{handleReviewLedgerOpen\}/);
  assert.match(workspace, /reviewOutcomeFilter,\s*setReviewOutcomeFilter/);
  assert.match(workspace, /reviewSymbolFilter,\s*setReviewSymbolFilter/);
  assert.match(workspace, /setReviewSymbolFilter\(selectedSymbol \?\? "all"\)/);
  assert.match(workspace, /filteredReviewRecords/);
  assert.match(workspace, /reviewOutcomeCounts/);
  assert.match(workspace, /reviewSymbolOptions/);

  for (const token of [
    "review-ledger-toolbar",
    "review-ledger-summary",
    "review-ledger-table",
    "review-ledger-row",
    "review-ledger-empty",
    "data-selected-symbol",
    "review-ledger-summary-button",
    "review-ledger-filter-status",
    "review-ledger-action-cell",
    "review-ledger-open-button",
  ]) {
    assert.match(workspace, new RegExp(token));
  }

  for (const label of [
    "全部结果",
    "全部标的",
    "已验证",
    "已失效",
    "未确认",
    "观察到的变化",
    "失效原因",
    "学习记录",
    "打开机会",
    "显示",
  ]) {
    assert.match(workspace, new RegExp(label));
  }

  for (const token of [
    "review-ledger-toolbar",
    "review-ledger-summary",
    "review-ledger-table",
    "review-ledger-row",
    "review-ledger-empty",
    "review-ledger-summary-button",
    "review-ledger-filter-status",
    "review-ledger-action-cell",
    "review-ledger-open-button",
  ]) {
    assert.match(globals, new RegExp(`\\.${token}`));
  }
});

test("review ledger opens the opportunity with an explicit review handoff", async () => {
  const workspace = await readAppFile("components", "ResearchWorkspace.tsx");
  const board = await readAppFile("components", "OpportunityBoard.tsx");
  const inspector = await readAppFile("components", "research", "ResearchInspector.tsx");

  assert.match(workspace, /type ReviewOpenContext = \{ source: "review-ledger"; reviewId: string \}/);
  assert.match(workspace, /function handleReviewLedgerOpen\(symbol: string, context\?: ReviewOpenContext\)/);
  assert.match(workspace, /setPendingReviewSymbol\(\{ id: Date\.now\(\), symbol, source: context\?\.source, reviewId: context\?\.reviewId \}\)/);
  assert.match(workspace, /onOpenOpportunity\(row\.symbols\[0\],\s*\{ source: "review-ledger", reviewId: row\.record\.id \}\)/);

  assert.match(board, /type PendingReviewCommand = \{ id: number; symbol: string; source\?: "command-palette" \| "review-ledger"; reviewId\?: string \}/);
  assert.match(board, /reviewCommandSource=\{pendingReviewCommand\?\.source\}/);
  assert.match(board, /reviewCommandReviewId=\{pendingReviewCommand\?\.reviewId\}/);

  assert.match(inspector, /reviewCommandSource\?: "command-palette" \| "review-ledger"/);
  assert.match(inspector, /reviewCommandReviewId\?: string/);
  assert.match(inspector, /来自复盘账本/);
  assert.match(inspector, /复核最新记录后决定是否继续补证据/);
});

test("review ledger keeps rows scanable with expandable full review details", async () => {
  const workspace = await readAppFile("components", "ResearchWorkspace.tsx");
  const globals = await readAppFile("app", "globals.css");

  assert.match(workspace, /<th scope="col">复盘摘要<\/th>/);
  assert.doesNotMatch(workspace, /<th scope="col">观察到的变化<\/th>\s*<th scope="col">失效原因<\/th>\s*<th scope="col">学习记录<\/th>/);
  assert.match(workspace, /className="review-ledger-summary-cell"/);
  assert.match(workspace, /className="review-ledger-primary-text"/);
  assert.match(workspace, /className="review-ledger-detail-toggle"/);
  assert.match(workspace, /className="review-ledger-detail-grid"/);
  assert.match(workspace, /查看完整复盘/);

  for (const label of ["观察到的变化", "失效原因", "学习记录"]) {
    assert.match(workspace, new RegExp(`<dt>${label}</dt>`));
  }

  for (const token of [
    "review-ledger-summary-cell",
    "review-ledger-primary-text",
    "review-ledger-detail-toggle",
    "review-ledger-detail-grid",
  ]) {
    assert.match(globals, new RegExp(`\\.${token}`));
  }
});

test("inspector narrative lists use stable non-text keys for repeated research notes", async () => {
  const inspector = await readAppFile("components", "research", "ResearchInspector.tsx");

  assert.doesNotMatch(inspector, /view\.supportingEvidence\.map\(\(item\) => <li key=\{item\}>/);
  assert.doesNotMatch(inspector, /view\.evidenceGaps\.map\(\(need\) => \(\s*<li key=\{`\$\{need\.kind\}-\$\{need\.question\}`\}>/);
  assert.doesNotMatch(inspector, /view\.invalidation\.map\(\(item\) => <li key=\{item\}>/);

  assert.match(inspector, /view\.supportingEvidence\.map\(\(item, index\) => <li key=\{`supporting-\$\{index\}`\}>/);
  assert.match(inspector, /view\.evidenceGaps\.map\(\(need, index\) => \(/);
  assert.match(inspector, /<li key=\{`evidence-gap-\$\{need\.kind\}-\$\{index\}`\}>/);
  assert.match(inspector, /view\.invalidation\.map\(\(item, index\) => <li key=\{`invalidation-\$\{index\}`\}>/);
});

test("agent rail is a compact research copilot timeline with selected-symbol prompts", async () => {
  const agentPanel = await readAppFile("components", "AgentPanel.tsx");
  const agentTimeline = await readAppFile("components", "research", "AgentTimeline.tsx");

  assert.match(agentPanel, /AGENT_QUICK_ACTIONS/);
  assert.match(agentPanel, /buildAgentPrompt/);
  assert.match(agentPanel, /反证当前机会/);
  assert.match(agentPanel, /证据缺口清单/);
  assert.match(agentPanel, /市场状态摘要/);
  assert.match(agentPanel, /selectedSymbol \?\? "当前机会"/);
  assert.match(agentPanel, /setMessage\(buildAgentPrompt/);

  for (const label of ["当前运行", "计划步骤", "工具执行", "判断摘要", "反证条件", "最近运行"]) {
    assert.match(agentTimeline, new RegExp(label));
  }
  for (const token of [
    "agent-timeline-summary",
    "agent-timeline-event",
    "agent-timeline-status",
    "agent-timeline-tool-chip",
    "agent-timeline-run-card",
  ]) {
    assert.match(agentTimeline, new RegExp(token));
  }
  assert.match(agentTimeline, /已执行/);
  assert.match(agentTimeline, /已阻断/);
  assert.match(agentTimeline, /待执行/);
  assert.match(agentTimeline, /候选标的/);
  assert.doesNotMatch(agentTimeline, /chain-of-thought|raw prompt|process\.env|Authorization/i);
});

test("agent timeline does not render corrupted cached question-mark previews", async () => {
  const agentTimeline = await readAppFile("components", "research", "AgentTimeline.tsx");
  const runHistory = await readAppFile("components", "AgentRunHistory.tsx");

  assert.match(agentTimeline, /CORRUPTED_AGENT_TEXT_PLACEHOLDER/);
  assert.match(agentTimeline, /looksCorruptedAgentText/);
  assert.match(agentTimeline, /cleanAgentTimelineText/);
  assert.match(agentTimeline, /内容疑似转码损坏，建议重新运行 Agent/);
  assert.match(agentTimeline, /cleanAgentTimelineText\(run\.message_preview\)/);
  assert.match(agentTimeline, /cleanAgentTimelineText\(item\)/);

  assert.match(runHistory, /cleanAgentTimelineText/);
  assert.match(runHistory, /cleanAgentTimelineText\(run\.message_preview\)/);
});

test("agent timeline exposes tool reasons and bounded execution summaries without raw tool input", async () => {
  const agentTimeline = await readAppFile("components", "research", "AgentTimeline.tsx");
  const globals = await readAppFile("app", "globals.css");

  assert.match(agentTimeline, /agent-timeline-step-question/);
  assert.match(agentTimeline, /step\.question/);
  assert.match(agentTimeline, /step\.expectedOutput/);
  assert.match(agentTimeline, /agent-timeline-tool-reason/);
  assert.match(agentTimeline, /tool\.reason/);
  assert.match(agentTimeline, /agent-timeline-tool-summary/);
  assert.match(agentTimeline, /tool\.result_summary/);
  assert.match(agentTimeline, /decision\.reason/);
  assert.match(agentTimeline, /cleanAgentTimelineText\(tool\.result_summary\)/);
  assert.match(agentTimeline, /cleanAgentTimelineText\(decision\.reason\)/);
  assert.doesNotMatch(agentTimeline, /tool\.input|tool\.cwd|tool\.env_keys|command_preview/);

  for (const token of [
    "agent-timeline-step-question",
    "agent-timeline-step-output",
    "agent-timeline-tool-reason",
    "agent-timeline-tool-summary",
  ]) {
    assert.match(globals, new RegExp(`\\.${token}`));
  }
});

test("agent rail keeps long answer and trace details collapsed behind the timeline", async () => {
  const agentPanel = await readAppFile("components", "AgentPanel.tsx");
  const globals = await readAppFile("app", "globals.css");

  assert.match(agentPanel, /<AgentTimeline reply=\{reply\} history=\{runHistory\} \/>[\s\S]*agent-deep-dive/);
  assert.match(agentPanel, /<details className="agent-auxiliary-section agent-deep-dive"/);
  assert.match(agentPanel, /<summary>[\s\S]*Agent 深度详情/);
  assert.match(agentPanel, /reply \? reply\.run_id : `\$\{messages\.length\} 条上下文`/);
  assert.match(agentPanel, /aria-label="Agent 回答"[\s\S]*className="agent-reply"/);
  assert.match(agentPanel, /className="agent-history"/);
  assert.doesNotMatch(agentPanel, /<section aria-label="Agent 回答" aria-live="polite" className="agent-reply">/);

  assert.match(globals, /\.agent-deep-dive/);
  assert.match(globals, /\.agent-deep-dive summary span/);
  assert.match(globals, /\.agent-deep-dive \.agent-reply/);
});
