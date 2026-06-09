import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { loadEnvFile } from "./loadEnv.js";

test("loadEnvFile reads .env in cwd without overriding existing keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "tw-env-"));
  writeFileSync(join(dir, ".env"), "LLM_API_KEY=from-file\n");
  const prevCwd = process.cwd();
  const prevKey = process.env.LLM_API_KEY;
  delete process.env.LLM_API_KEY;
  try {
    process.chdir(dir);
    loadEnvFile();
    assert.equal(process.env.LLM_API_KEY, "from-file");
    process.env.LLM_API_KEY = "preset";
    loadEnvFile();
    assert.equal(process.env.LLM_API_KEY, "preset");
  } finally {
    process.chdir(prevCwd);
    if (prevKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = prevKey;
  }
});
