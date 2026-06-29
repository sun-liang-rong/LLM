import assert from "node:assert/strict";
import { test } from "node:test";
import { formatUsd } from "../src/utils/money.ts";

test("formats balances with exactly two decimal places", () => {
  assert.equal(formatUsd(1), "$1.00");
  assert.equal(formatUsd(1.235), "$1.24");
  assert.equal(formatUsd(0.000001), "$0.00");
});

test("supports signed positive money labels", () => {
  assert.equal(formatUsd(0.08, { signed: true }), "+$0.08");
  assert.equal(formatUsd(-0.08, { signed: true }), "$-0.08");
});
