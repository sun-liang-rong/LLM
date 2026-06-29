import assert from "node:assert/strict";
import { test } from "node:test";
import { PricingService } from "../src/modules/billing/pricing.service";

function serviceForCost(baseCostUsd: number) {
  const prisma = {
    model: {
      findFirst: async () => ({
        inputUsdPerMillionTokens: baseCostUsd * 1_000_000,
        outputUsdPerMillionTokens: 0,
        priceMultiplier: 1,
      }),
    },
    user: {
      findUnique: async () => undefined,
    },
    billingGroup: {
      findUnique: async () => undefined,
    },
  };
  const service = new PricingService(prisma as never);
  return service.calculateUsageCost({
    upstreamModel: "model",
    usage: {
      inputTokens: 1,
      outputTokens: 0,
      totalTokens: 1,
    },
  });
}

test("usage cost is rounded to six decimal places", async () => {
  assert.equal((await serviceForCost(0.1234564))?.costUsd, 0.123456);
  assert.equal((await serviceForCost(0.1234566))?.costUsd, 0.123457);
});
