import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  readChartHandoff,
  resolveTraderChartBinary,
  writeChartHandoff,
} from "./traderChart.js";

test("writeChartHandoff and read roundtrip", () => {
  const dir = mkdtempSync(join(tmpdir(), "trader-chart-"));
  const prev = process.env.TRADER_CHART_HANDOFF;
  process.env.TRADER_CHART_HANDOFF = join(dir, "handoff.json");
  try {
    writeChartHandoff({ symbol: "tsla", chart: "5m" });
    const read = readChartHandoff();
    assert.equal(read?.symbol, "TSLA");
    assert.equal(read?.chart, "5m");
  } finally {
    if (prev === undefined) delete process.env.TRADER_CHART_HANDOFF;
    else process.env.TRADER_CHART_HANDOFF = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveTraderChartBinary returns error when missing", () => {
  const prevBin = process.env.TRADER_CHART_BIN;
  delete process.env.TRADER_CHART_BIN;
  const r = resolveTraderChartBinary();
  assert.ok("error" in r || "path" in r);
  if ("error" in r) assert.match(r.error, /trader-chart/);
  if (prevBin) process.env.TRADER_CHART_BIN = prevBin;
});
