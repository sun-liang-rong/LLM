import assert from "node:assert/strict";
import { test } from "node:test";
import {
  expandKeysByWeight,
  orderedWeightedCandidates,
} from "../src/modules/key-pool/key-pool-scheduler.util";
import { KeyPoolService } from "../src/modules/key-pool/key-pool.service";
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

test("rate limit failures without Retry-After use short retry cooldown instead of request window", async () => {
  const windowStartedAt = new Date(Date.now() - 60_000);
  const updates: Array<{ status: string; cooldownUntil: Date | null }> = [];
  const prisma = {
    providerKey: {
      findUnique: async () => ({
        id: "key-1",
        windowStartedAt,
        windowSizeMinutes: 300,
      }),
      update: async ({ data }: { data: { status: string; cooldownUntil: Date | null } }) => {
        updates.push(data);
      },
    },
  };
  const service = new KeyPoolService(
    { get: () => "" } as never,
    prisma as never,
    { decrypt: (value: string) => value } as never,
  );

  await service.reportFailure("key-1", "rate_limit", "429 Too Many Requests");

  const cooldownMs = updates[0].cooldownUntil!.getTime() - Date.now();
  assert.equal(updates[0].status, "rate_limited");
  assert.ok(cooldownMs > 0);
  assert.ok(
    cooldownMs <= 65_000,
    `expected cooldown near one minute, got ${Math.round(cooldownMs / 60_000)} minutes`,
  );
});

test("expired cooldown refresh clears stale 429 error details", async () => {
  let updateManyData: Record<string, unknown> | undefined;
  const prisma = {
    providerKey: {
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        updateManyData = data;
      },
      findMany: async () => [],
    },
  };
  const service = new KeyPoolService(
    { get: () => "" } as never,
    prisma as never,
    { decrypt: (value: string) => value } as never,
  );

  await service.list();

  assert.deepEqual(updateManyData, {
    status: "healthy",
    cooldownUntil: null,
    lastError: null,
  });
});
