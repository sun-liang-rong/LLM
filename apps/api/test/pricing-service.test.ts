import assert from "node:assert/strict";
import { test } from "node:test";
import { PricingService } from "../src/modules/billing/pricing.service";

const provider = {
  id: "provider-1",
  provider: "deepseek",
  protocol: "openai-compatible",
};

const modelInput = {
  providerId: provider.id,
  publicId: "deepseek-v4-flash",
  upstreamModel: "deepseek-v4-flash",
  displayName: "DeepSeek V4 Flash",
  inputUsdPerMillionTokens: 0,
  outputUsdPerMillionTokens: 0,
};

test("saving a model price creates a matching model route when none exists", async () => {
  const createdAliases: unknown[] = [];
  const prisma = {
    provider: {
      findUnique: async () => provider,
    },
    model: {
      upsert: async (args: { create: unknown }) => ({
        id: "model-1",
        ...(args.create as object),
      }),
    },
    modelAlias: {
      findUnique: async () => null,
      create: async (args: unknown) => {
        createdAliases.push(args);
      },
    },
  };
  const service = new PricingService(prisma as never);

  await service.saveModelPrice(modelInput);

  assert.deepEqual(createdAliases, [
    {
      data: {
        alias: "deepseek-v4-flash",
        mode: "balanced",
        targets: JSON.stringify([
          {
            providerId: provider.id,
            providerSlug: provider.provider,
            upstreamProtocol: provider.protocol,
            upstreamModel: "deepseek-v4-flash",
            weight: 1,
            priority: 1,
            enabled: true,
          },
        ]),
      },
    },
  ]);
});

test("saving a model price does not overwrite an existing model route", async () => {
  let createAliasCalled = false;
  const prisma = {
    provider: {
      findUnique: async () => provider,
    },
    model: {
      upsert: async (args: { create: unknown }) => ({
        id: "model-1",
        ...(args.create as object),
      }),
    },
    modelAlias: {
      findUnique: async () => ({ alias: "deepseek-v4-flash" }),
      create: async () => {
        createAliasCalled = true;
      },
    },
  };
  const service = new PricingService(prisma as never);

  await service.saveModelPrice(modelInput);

  assert.equal(createAliasCalled, false);
});
