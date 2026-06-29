import assert from "node:assert/strict";
import { test } from "node:test";
import { CreditService } from "../src/modules/billing/credit.service";

test("ledger filters rows and total by ledger type", async () => {
  const whereCalls: unknown[] = [];
  const prisma = {
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    creditLedger: {
      findMany: async (args: { where: unknown }) => {
        whereCalls.push(args.where);
        return [
          {
            id: "ledger-1",
            userId: "user-1",
            tenantId: "tenant-1",
            type: "checkin",
            amountCredits: 100_000_000n,
            balanceAfterCredits: 200_000_000n,
            createdAt: new Date("2026-06-29T01:00:00.000Z"),
            user: { email: "user@example.com", name: "User" },
          },
        ];
      },
      count: async (args: { where: unknown }) => {
        whereCalls.push(args.where);
        return 1;
      },
    },
  };
  const platformConfig = {};
  const service = new CreditService(prisma as never, platformConfig as never);

  const page = await service.ledger({
    userId: "user-1",
    tenantId: "tenant-1",
    type: "checkin",
  });

  assert.deepEqual(whereCalls, [
    { userId: "user-1", tenantId: "tenant-1", type: "checkin" },
    { userId: "user-1", tenantId: "tenant-1", type: "checkin" },
  ]);
  assert.equal(page.total, 1);
  assert.equal(page.rows[0].type, "checkin");
});

test("check-in status returns the stored reward after the user checked in", async () => {
  const prisma = {
    checkInRecord: {
      findUnique: async () => ({
        id: "checkin-1",
        userId: "user-1",
        tenantId: "tenant-1",
        checkInDate: "2026-06-29",
        rewardCredits: 204_000_000n,
        createdAt: new Date("2026-06-29T01:00:00.000Z"),
      }),
    },
  };
  const platformConfig = {
    randomDailyCheckInCents: async () => {
      throw new Error("random reward should not be used for existing check-in");
    },
  };
  const service = new CreditService(prisma as never, platformConfig as never);

  const status = await service.checkInStatus("user-1", "tenant-1");

  assert.equal(status.checkedIn, true);
  assert.equal(status.rewardUsd, 2.04);
});
