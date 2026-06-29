import assert from "node:assert/strict";
import { test } from "node:test";
import { RequestLogService } from "../src/modules/observability/request-log.service";

test("tenant dashboard API key metric counts only the current user's keys", async () => {
  const calls: unknown[] = [];
  const prisma = {
    requestLog: {
      findMany: async () => [],
      aggregate: async () => ({ _sum: { costUsd: 0, totalTokens: 0 } }),
      groupBy: async () => [],
    },
    apiKey: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [{ id: "own-key", enabled: true, dailyBudgetUsd: 5 }];
      },
    },
  };
  const service = new RequestLogService(prisma as never);

  const overview = await service.tenantDashboardOverview("tenant-1", "user-1");

  assert.deepEqual(calls, [
    {
      where: { tenantId: "tenant-1", userId: "user-1" },
      select: { id: true, enabled: true, dailyBudgetUsd: true },
    },
  ]);
  assert.equal(
    overview.topMetrics.find((metric) => metric.label === "apiKeys")?.value,
    "1",
  );
});

test("admin dashboard overview reports platform operating metrics", async () => {
  const prisma = {
    requestLog: {
      findMany: async () => [
        {
          createdAt: new Date("2026-06-29T01:00:00.000Z"),
          status: "completed",
          latencyMs: 120,
          totalTokens: 300,
          inputTokens: 100,
          outputTokens: 200,
          costUsd: 0.02,
        },
      ],
      aggregate: async (args: { where?: unknown }) =>
        args.where && "createdAt" in (args.where as Record<string, unknown>)
          ? { _sum: { costUsd: 0.02, totalTokens: 300 } }
          : { _sum: { costUsd: 2.5, totalTokens: 12_000 } },
      count: async () => 48,
      groupBy: async () => [],
    },
    provider: {
      findMany: async () => [],
    },
    apiKey: {
      findMany: async () => [{ id: "key-1", enabled: true, dailyBudgetUsd: 5 }],
    },
    user: {
      count: async (args?: { where?: unknown }) =>
        args?.where && "lastLoginAt" in (args.where as Record<string, unknown>)
          ? 7
          : 12,
    },
  };
  const service = new RequestLogService(prisma as never);

  const overview = await service.dashboardOverview({ range: "7d" });

  assert.deepEqual(
    overview.topMetrics.map((metric) => metric.label),
    ["totalRequests", "totalTokens", "userCount", "activeUsers"],
  );
  assert.equal(
    overview.topMetrics.find((metric) => metric.label === "totalRequests")?.value,
    "48",
  );
  assert.equal(
    overview.topMetrics.find((metric) => metric.label === "userCount")?.value,
    "12",
  );
  assert.equal(
    overview.topMetrics.find((metric) => metric.label === "activeUsers")?.value,
    "7",
  );
  assert.equal(
    overview.topMetrics.some((metric) => metric.label === "todaySpend"),
    false,
  );
});
