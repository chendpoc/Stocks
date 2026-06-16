import assert from "node:assert/strict";
import test from "node:test";

import {
  runPipeline,
  runPipelineFromStep,
  type PipelineStep,
} from "./pipeline.js";
import { mergeGraphState } from "./stateMerge.js";

type TestState = {
  run_id: string;
  count: number;
  label: string | null;
  errors: string[];
};

const baseState: TestState = {
  run_id: "run-1",
  count: 0,
  label: null,
  errors: [],
};

test("mergeGraphState replaces fields by default", () => {
  const merged = mergeGraphState(baseState, {
    count: 2,
    label: "done",
  });
  assert.equal(merged.run_id, "run-1");
  assert.equal(merged.count, 2);
  assert.equal(merged.label, "done");
  assert.deepEqual(merged.errors, []);
});

test("mergeGraphState appends errors accumulator", () => {
  const withOne = mergeGraphState(baseState, { errors: ["first"] });
  const withTwo = mergeGraphState(withOne, { errors: ["second"] });
  assert.deepEqual(withTwo.errors, ["first", "second"]);
});

test("runPipeline executes steps in order with partial merge", async () => {
  const order: string[] = [];
  const steps: PipelineStep<TestState>[] = [
    async (state) => {
      order.push("step-1");
      return { count: state.count + 1 };
    },
    async (state) => {
      order.push("step-2");
      return { count: state.count + 2, label: "mid" };
    },
    async (state) => {
      order.push("step-3");
      return { label: `${state.label}-final` };
    },
  ];

  const final = await runPipeline(baseState, steps);

  assert.deepEqual(order, ["step-1", "step-2", "step-3"]);
  assert.equal(final.count, 3);
  assert.equal(final.label, "mid-final");
  assert.equal(final.run_id, "run-1");
});

test("runPipeline accumulates errors across steps", async () => {
  const steps: PipelineStep<TestState>[] = [
    async () => ({ errors: ["normalize failed"] }),
    async () => ({ errors: ["build snapshot failed"] }),
    async () => ({ count: 1 }),
  ];

  const final = await runPipeline(baseState, steps);

  assert.equal(final.count, 1);
  assert.deepEqual(final.errors, ["normalize failed", "build snapshot failed"]);
});

test("runPipelineFromStep resumes from a middle step", async () => {
  const order: string[] = [];
  const steps: PipelineStep<TestState>[] = [
    async () => {
      order.push("step-0");
      return { count: 1 };
    },
    async (state) => {
      order.push("step-1");
      return { count: state.count + 10 };
    },
    async (state) => {
      order.push("step-2");
      return { count: state.count + 100 };
    },
  ];

  const resumed = await runPipelineFromStep(
    { ...baseState, count: 1 },
    steps,
    1,
  );

  assert.deepEqual(order, ["step-1", "step-2"]);
  assert.equal(resumed.count, 111);
});
