import assert from "node:assert/strict";
import test from "node:test";

import { buildQuery } from "./queryBuilder.js";

test("buildQuery returns empty string when params are empty", () => {
  assert.equal(buildQuery({}), "");
});

test("buildQuery skips undefined and null values", () => {
  assert.equal(
    buildQuery({
      symbol: "TSLA",
      status: undefined,
      limit: null,
    }),
    "symbol=TSLA",
  );
});

test("buildQuery encodes string, number, and boolean values", () => {
  assert.equal(
    buildQuery({
      symbol: "TSLA",
      limit: 12,
      allow_live_fallback: true,
    }),
    "symbol=TSLA&limit=12&allow_live_fallback=true",
  );
});

test("buildQuery preserves insertion order for multiple params", () => {
  assert.equal(
    buildQuery({
      symbol: "TSLA",
      status: "pending",
      limit: 5,
    }),
    "symbol=TSLA&status=pending&limit=5",
  );
});

test("buildQuery URL-encodes special characters", () => {
  assert.equal(
    buildQuery({
      session_id: "sess with spaces",
      profile: "a&b=c",
    }),
    "session_id=sess+with+spaces&profile=a%26b%3Dc",
  );
});
