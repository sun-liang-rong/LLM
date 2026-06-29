import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTrendChartModel } from "../src/utils/trend-chart.ts";

test("builds chart ticks, labels, points, and tooltip data for usage trend", () => {
  const chart = buildTrendChartModel([
    { bucket: "2026-06-27", requests: 10, tokens: 1200, costUsd: 0.25 },
    { bucket: "2026-06-28", requests: 30, tokens: 3600, costUsd: 0.5 },
    { bucket: "2026-06-29", requests: 20, tokens: 2400, costUsd: 0.75 },
  ]);

  assert.equal(chart.requestTicks.length, 5);
  assert.equal(chart.costTicks.length, 5);
  assert.equal(chart.xLabels.length, 3);
  assert.deepEqual(
    chart.points.map((point) => point.tooltip),
    [
      {
        bucket: "2026-06-27",
        requests: "10",
        tokens: "1.2K",
        cost: "$0.2500",
      },
      {
        bucket: "2026-06-28",
        requests: "30",
        tokens: "3.6K",
        cost: "$0.5000",
      },
      {
        bucket: "2026-06-29",
        requests: "20",
        tokens: "2.4K",
        cost: "$0.7500",
      },
    ],
  );
  assert.equal(chart.points[1].requestLabel, "30");
  assert.equal(chart.points[2].costLabel, "$0.7500");
  assert.equal(chart.points[0].hitWidth > 100, true);
});
