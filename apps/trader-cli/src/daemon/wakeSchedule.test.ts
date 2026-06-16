import assert from "node:assert/strict";
import test from "node:test";
import {
  addDynamicTask,
  getActiveDynamicTasks,
  mergeWakeConfigPatch,
  removeDynamicTask,
} from "./wakeSchedule.js";

test("mergeWakeConfigPatch preserves existing overrides across updates", () => {
  const merged = mergeWakeConfigPatch(
    {
      preMarket: { intervalMinutes: 3 },
    },
    {
      weekend: { intervalMinutes: 240 },
    },
  );

  assert.deepEqual(merged, {
    preMarket: { intervalMinutes: 3 },
    weekend: { intervalMinutes: 240 },
  });
});

test("mergeWakeConfigPatch updates an existing session override", () => {
  const merged = mergeWakeConfigPatch(
    {
      preMarket: { intervalMinutes: 3 },
    },
    {
      preMarket: { intervalMinutes: 5 },
    },
  );

  assert.deepEqual(merged, {
    preMarket: { intervalMinutes: 5 },
  });
});

test("dynamic wake tasks can be added and removed in memory", () => {
  const now = new Date();
  const activeTask = addDynamicTask({
    at: new Date(now.getTime() + 60 * 60 * 1000),
    reason: "review macro release",
    priority: "normal",
    createdBy: "test",
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
  });

  const tasks = getActiveDynamicTasks();
  assert.ok(tasks.some((t) => t.id === activeTask.id));

  const removed = removeDynamicTask(activeTask.id);
  assert.equal(removed, true);

  const remaining = getActiveDynamicTasks();
  assert.equal(remaining.some((t) => t.id === activeTask.id), false);
});

test("getActiveDynamicTasks filters expired tasks", () => {
  const now = new Date();
  const expired = addDynamicTask({
    at: new Date(now.getTime() - 90 * 60 * 1000),
    reason: "expired",
    priority: "normal",
    createdBy: "test",
    expiresAt: new Date(now.getTime() - 30 * 60 * 1000),
  });

  const active = getActiveDynamicTasks();
  assert.equal(active.some((t) => t.id === expired.id), false);
});
