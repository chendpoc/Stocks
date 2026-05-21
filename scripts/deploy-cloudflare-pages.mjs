import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./lib/local-env.mjs";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultOutputDir = "docs/.vitepress/dist";
loadLocalEnv(rootDir);

function parseArgs(argv) {
  const options = {
    dryRun: false,
    skipBuild: false,
    outputDir: defaultOutputDir,
    projectName:
      process.env.CLOUDFLARE_PAGES_PROJECT ||
      process.env.CF_PAGES_PROJECT ||
      "stocks-emw",
    branch: process.env.CLOUDFLARE_PAGES_BRANCH || process.env.CF_PAGES_BRANCH || "",
    siteBaseUrl: process.env.SUMMARY_SITE_BASE_URL || process.env.SITE_BASE_URL || process.env.CF_PAGES_URL || "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--skip-build") {
      options.skipBuild = true;
    } else if (arg === "--project-name") {
      options.projectName = argv[++index];
    } else if (arg.startsWith("--project-name=")) {
      options.projectName = arg.slice("--project-name=".length);
    } else if (arg === "--branch") {
      options.branch = argv[++index];
    } else if (arg.startsWith("--branch=")) {
      options.branch = arg.slice("--branch=".length);
    } else if (arg === "--site-base-url") {
      options.siteBaseUrl = argv[++index];
    } else if (arg.startsWith("--site-base-url=")) {
      options.siteBaseUrl = arg.slice("--site-base-url=".length);
    } else if (arg === "--output-dir") {
      options.outputDir = argv[++index];
    } else if (arg.startsWith("--output-dir=")) {
      options.outputDir = arg.slice("--output-dir=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.projectName) {
    throw new Error("Missing Cloudflare Pages project name.");
  }
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(options.projectName)) {
    throw new Error("Cloudflare Pages project name must use lowercase letters, numbers, and hyphens.");
  }
  if (options.branch && !/^[A-Za-z0-9._/-]+$/.test(options.branch)) {
    throw new Error("Branch name contains unsupported characters for this deploy script.");
  }
  options.siteBaseUrl = normalizeSiteBaseUrl(options.siteBaseUrl || `https://${options.projectName}.pages.dev`);

  return options;
}

function normalizeSiteBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value ?? "").trim());
  } catch {
    throw new Error("Site base URL must be a valid http(s) URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Site base URL must use http or https.");
  }
  parsed.search = "";
  parsed.hash = "";
  if (!parsed.pathname.endsWith("/")) parsed.pathname = `${parsed.pathname}/`;
  return parsed.toString();
}

function commandName(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function run(command, args, options = {}) {
  const useShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
    shell: useShell,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}${output ? `\n${output}` : ""}`);
  }

  return result;
}

function currentGitBranch() {
  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd: rootDir,
    stdio: "pipe",
    encoding: "utf8",
    shell: false,
  });

  if (result.status !== 0) {
    return "main";
  }

  return result.stdout.trim() || "main";
}

function printPlan(options, outputDirAbs) {
  const branch = options.branch || currentGitBranch();
  const outputDirForDisplay = relative(rootDir, outputDirAbs).replaceAll("\\", "/");
  const deployArgs = [
    "wrangler",
    "pages",
    "deploy",
    outputDirForDisplay,
    `--project-name=${options.projectName}`,
    `--branch=${branch}`,
  ];

  console.log("cloudflare pages deploy plan");
  console.log(`project_name: ${options.projectName}`);
  console.log(`branch: ${branch}`);
  console.log(`output_dir: ${outputDirForDisplay}`);
  console.log(`site_url: ${options.siteBaseUrl}`);
  console.log(`deploy_command: npx ${deployArgs.join(" ")}`);
  console.log(`notify_card_env: SUMMARY_SITE_BASE_URL=${options.siteBaseUrl}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputDirAbs = resolve(rootDir, options.outputDir);

  if (!options.skipBuild) {
    run(commandName("npm"), ["run", "docs:build"]);
  }

  const indexPath = resolve(outputDirAbs, "index.html");
  if (!existsSync(indexPath)) {
    const message = `Build output is missing index.html: ${indexPath}`;
    if (!options.dryRun) {
      throw new Error(message);
    }
    console.warn(`warning: ${message}`);
  }

  printPlan(options, outputDirAbs);

  if (options.dryRun) {
    console.log("dry_run: true");
    return;
  }

  const branch = options.branch || currentGitBranch();
  run(commandName("npx"), [
    "wrangler",
    "pages",
    "deploy",
    outputDirAbs,
    `--project-name=${options.projectName}`,
    `--branch=${branch}`,
  ]);

  console.log(`configured_site_url: ${options.siteBaseUrl}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
