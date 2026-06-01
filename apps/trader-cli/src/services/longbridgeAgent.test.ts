import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import type { LongbridgeProbe } from "./longbridge.js";
import {
  normalizeLongbridgeAgent,
  ensureLongbridgeAgentOnStartup,
  getLongbridgeBootstrapWarning,
  probeWarningMessage,
  _resetForTest,
} from "./longbridgeAgent.js";

describe("normalizeLongbridgeAgent", () => {
  it("defaults to on", () => {
    assert.equal(normalizeLongbridgeAgent(undefined), "on");
    assert.equal(normalizeLongbridgeAgent(""), "on");
  });

  it("accepts off variants", () => {
    assert.equal(normalizeLongbridgeAgent("off"), "off");
    assert.equal(normalizeLongbridgeAgent("false"), "off");
    assert.equal(normalizeLongbridgeAgent("0"), "off");
  });
});

describe("probeWarningMessage", () => {
  it("not installed → contains '未检测到'", () => {
    const msg = probeWarningMessage({
      installed: false, cliPath: null, authOk: false, message: "",
    });
    assert.ok(msg.includes("未检测到"));
  });

  it("not authed → contains 'auth login'", () => {
    const msg = probeWarningMessage({
      installed: true, cliPath: "/lb", authOk: false, message: "",
    });
    assert.ok(msg.includes("auth login"));
  });

  it("all ok → empty string", () => {
    const msg = probeWarningMessage({
      installed: true, cliPath: "/lb", authOk: true, message: "ok",
    });
    assert.equal(msg, "");
  });
});

describe("ensureLongbridgeAgentOnStartup", () => {
  let savedEnv: string | undefined;
  let probeCallCount: number;
  let setEnvCalls: Array<[string, string]>;

  function fakeProbe(result: LongbridgeProbe): () => Promise<LongbridgeProbe> {
    return async () => { probeCallCount++; return result; };
  }

  function fakeSetEnv(key: string, value: string): void {
    setEnvCalls.push([key, value]);
  }

  beforeEach(() => {
    probeCallCount = 0;
    setEnvCalls = [];
    savedEnv = process.env.TRADER_LONGBRIDGE_AGENT;
    process.env.TRADER_LONGBRIDGE_AGENT = "on";
  });

  afterEach(() => {
    _resetForTest();
    if (savedEnv === undefined) delete process.env.TRADER_LONGBRIDGE_AGENT;
    else process.env.TRADER_LONGBRIDGE_AGENT = savedEnv;
  });

  it("probe not installed → warning '未检测到', env set to off", async () => {
    _resetForTest({
      probe: fakeProbe({ installed: false, cliPath: null, authOk: false, message: "not found" }),
      setEnv: fakeSetEnv,
    });

    await ensureLongbridgeAgentOnStartup();

    const w = getLongbridgeBootstrapWarning();
    assert.ok(w, "warning should not be null");
    assert.ok(w.includes("未检测到"), `expected '未检测到', got: ${w}`);
    assert.ok(
      setEnvCalls.some(([k, v]) => k === "TRADER_LONGBRIDGE_AGENT" && v === "off"),
      "should have called setEnv with off",
    );
  });

  it("probe not authed → warning 'auth login', env set to off", async () => {
    _resetForTest({
      probe: fakeProbe({ installed: true, cliPath: "C:\\lb.exe", authOk: false, message: "please login" }),
      setEnv: fakeSetEnv,
    });

    await ensureLongbridgeAgentOnStartup();

    const w = getLongbridgeBootstrapWarning();
    assert.ok(w, "warning should not be null");
    assert.ok(w.includes("auth login"), `expected 'auth login', got: ${w}`);
    assert.ok(
      setEnvCalls.some(([k, v]) => k === "TRADER_LONGBRIDGE_AGENT" && v === "off"),
      "should have called setEnv with off",
    );
  });

  it("probe success → no warning, env not changed to off", async () => {
    _resetForTest({
      probe: fakeProbe({ installed: true, cliPath: "C:\\lb.exe", authOk: true, message: "ok" }),
      setEnv: fakeSetEnv,
    });

    await ensureLongbridgeAgentOnStartup();

    assert.equal(getLongbridgeBootstrapWarning(), null);
    assert.ok(
      !setEnvCalls.some(([k, v]) => k === "TRADER_LONGBRIDGE_AGENT" && v === "off"),
      "should NOT have called setEnv with off",
    );
  });

  it("second call short-circuits via bootstrapDone", async () => {
    _resetForTest({
      probe: fakeProbe({ installed: true, cliPath: "C:\\lb.exe", authOk: true, message: "ok" }),
      setEnv: fakeSetEnv,
    });

    await ensureLongbridgeAgentOnStartup();
    await ensureLongbridgeAgentOnStartup();

    assert.equal(probeCallCount, 1, "probeLongbridge should be called only once");
  });
});
