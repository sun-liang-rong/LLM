import assert from "node:assert/strict";
import { test } from "node:test";
import {
  expandKeysByWeight,
  orderedWeightedCandidates,
} from "../src/modules/key-pool/key-pool-scheduler.util";
import { parseRetryAfterMs } from "../src/modules/providers/providers/provider-adapter";

test("weighted candidates repeat keys by positive weight and preserve order", () => {
  const keys = [
    { id: "key-1", weight: 1 },
    { id: "key-2", weight: 3 },
    { id: "key-3", weight: 0 },
    { id: "key-4", weight: -2 },
  ];

  assert.deepEqual(
    expandKeysByWeight(keys).map((key) => key.id),
    ["key-1", "key-2", "key-2", "key-2", "key-3", "key-4"],
  );
});

test("ordered weighted candidates rotates by weight without duplicate retries", () => {
  const keys = [
    { id: "key-1", weight: 1 },
    { id: "key-2", weight: 2 },
  ];

  const result = orderedWeightedCandidates(keys, 1);

  assert.deepEqual(
    result.ordered.map((key) => key.id),
    ["key-2", "key-1"],
  );
  assert.equal(result.nextCursor, 2);
});

test("Retry-After parser supports seconds, dates, and ignores invalid values", () => {
  const now = Date.parse("2026-06-29T00:00:00.000Z");

  assert.equal(parseRetryAfterMs("2", now), 2_000);
  assert.equal(
    parseRetryAfterMs("Mon, 29 Jun 2026 00:01:00 GMT", now),
    60_000,
  );
  assert.equal(parseRetryAfterMs(["3"], now), 3_000);
  assert.equal(parseRetryAfterMs("not-a-date", now), undefined);
});
