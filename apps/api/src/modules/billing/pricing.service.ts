import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import type { ProviderUsage } from "../providers/providers/provider-adapter";

export interface UsageCostBreakdown {
  baseCostUsd: number;
  costUsd: number;
  inputCostUsd: number;
  outputCostUsd: number;
  modelMultiplier: number;
  multiplier: number;
  billingGroupId?: string;
  billingGroupName?: string;
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  readonly platformTenantId = "default";

  async ensureDefaultGroup(tenantId: string) {
    const existing = await this.prisma.billingGroup.findFirst({
      where: { tenantId, isDefault: true },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.billingGroup.create({
      data: {
        tenantId,
        name: "Default",
        multiplier: 1,
        description: "Default billing group",
        isDefault: true,
      },
    });
  }

  async listGroups(tenantId?: string) {
    const groups = await this.prisma.billingGroup.findMany({
      where: { tenantId },
      include: { _count: { select: { users: true, apiKeys: true } } },
      orderBy: [{ tenantId: "asc" }, { isDefault: "desc" }, { name: "asc" }],
    });
    return groups.map((group) => ({
      id: group.id,
      tenantId: group.tenantId,
      name: group.name,
      multiplier: group.multiplier,
      allowedModels: this.parseAllowedModels(group.allowedModels),
      description: group.description ?? undefined,
      isDefault: group.isDefault,
      userCount: group._count.users,
      apiKeyCount: group._count.apiKeys,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    }));
  }

  async listPlatformGroups() {
    return this.listGroups(this.platformTenantId);
  }

  async saveGroup(input: {
    id?: string;
    tenantId: string;
    name: string;
    multiplier: number;
    allowedModels?: string[];
    description?: string;
    isDefault?: boolean;
  }) {
    const name = input.name.trim();
    if (!name) {
      throw new BadRequestException("Group name is required");
    }
    if (!Number.isFinite(input.multiplier) || input.multiplier <= 0) {
      throw new BadRequestException("Multiplier must be greater than 0");
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
    });
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.billingGroup.updateMany({
          where: { tenantId: input.tenantId },
          data: { isDefault: false },
        });
      }

      const data = {
        tenantId: input.tenantId,
        name,
        multiplier: input.multiplier,
        allowedModels: JSON.stringify(
          this.normalizeAllowedModels(input.allowedModels),
        ),
        description: input.description?.trim() || null,
        isDefault: input.isDefault ?? false,
      };

      if (input.id) {
        const existing = await tx.billingGroup.findUnique({
          where: { id: input.id },
        });
        if (!existing) {
          throw new NotFoundException("Billing group not found");
        }
        return tx.billingGroup.update({
          where: { id: input.id },
          data,
        });
      }

      return tx.billingGroup.create({ data });
    });
  }

  async deleteGroup(id: string) {
    const existing = await this.prisma.billingGroup.findUnique({
      where: { id },
      include: { _count: { select: { users: true, apiKeys: true } } },
    });
    if (!existing) {
      throw new NotFoundException("Billing group not found");
    }
    if (existing.isDefault) {
      throw new BadRequestException("Default billing group cannot be deleted");
    }
    if (existing._count.users > 0) {
      throw new BadRequestException("Billing group still has users");
    }
    if (existing._count.apiKeys > 0) {
      throw new BadRequestException("Billing group still has API keys");
    }
    await this.prisma.billingGroup.delete({ where: { id } });
    return { ok: true };
  }

  async assertCanUseModel(input: {
    userId?: string;
    billingGroupId?: string;
    modelGroupId?: string;
    model: string;
  }) {
    if (input.modelGroupId) {
      const model = await this.prisma.model.findFirst({
        where: {
          publicId: input.model,
          OR: [{ modelGroupId: input.modelGroupId }, { modelGroupId: null }],
        },
      });
      if (!model) {
        throw new ForbiddenException("Model is not available for this API key group");
      }
    }
    if (!input.userId && !input.billingGroupId) {
      return;
    }
    const group = await this.resolveBillingGroup(input);
    const allowedModels = this.parseAllowedModels(group?.allowedModels);
    if (allowedModels.length === 0) {
      return;
    }
    if (!allowedModels.includes(input.model)) {
      throw new ForbiddenException(
        `Model ${input.model} is not available for group ${group?.name ?? ""}`.trim(),
      );
    }
  }

  async listModelPrices() {
    const models = await this.prisma.model.findMany({
      include: { provider: true, modelGroup: true },
      orderBy: [{ provider: { provider: "asc" } }, { publicId: "asc" }],
    });
    return models.map((model) => this.serializeModelPrice(model));
  }

  async listPublicModels() {
    const models = await this.prisma.model.findMany({
      where: {
        enabled: true,
        provider: { enabled: true },
        OR: [{ modelGroupId: null }, { modelGroup: { enabled: true } }],
      },
      include: { provider: true, modelGroup: true },
      orderBy: [
        { modelGroup: { sortOrder: "asc" } },
        { provider: { provider: "asc" } },
        { publicId: "asc" },
      ],
    });
    return models.map((model) => this.serializeModelPrice(model));
  }

  async saveModelPrice(input: {
    id?: string;
    providerId: string;
    modelGroupId?: string;
    publicId: string;
    upstreamModel: string;
    displayName: string;
    description?: string;
    contextWindow?: number;
    priceMultiplier?: number;
    inputUsdPerMillionTokens: number;
    outputUsdPerMillionTokens: number;
    supportsTools?: boolean;
    supportsVision?: boolean;
    supportsStreaming?: boolean;
    enabled?: boolean;
  }) {
    const provider = await this.prisma.provider.findUnique({
      where: { id: input.providerId },
    });
    if (!provider) {
      throw new NotFoundException("Provider not found");
    }
    if (input.modelGroupId) {
      const group = await this.prisma.modelGroup.findUnique({
        where: { id: input.modelGroupId },
      });
      if (!group) {
        throw new NotFoundException("Model group not found");
      }
    }
    this.assertPositivePrice(input.inputUsdPerMillionTokens, "input price");
    this.assertPositivePrice(input.outputUsdPerMillionTokens, "output price");
    this.assertPositivePrice(input.priceMultiplier ?? 1, "price multiplier");

    const data = {
      providerId: input.providerId,
      modelGroupId: input.modelGroupId || null,
      publicId: this.required(input.publicId, "publicId"),
      upstreamModel: this.required(input.upstreamModel, "upstreamModel"),
      displayName: this.required(input.displayName, "displayName"),
      description: input.description?.trim() || null,
      contextWindow:
        typeof input.contextWindow === "number" && input.contextWindow > 0
          ? Math.round(input.contextWindow)
          : null,
      priceMultiplier: input.priceMultiplier ?? 1,
      inputUsdPerMillionTokens: input.inputUsdPerMillionTokens,
      outputUsdPerMillionTokens: input.outputUsdPerMillionTokens,
      supportsTools: input.supportsTools ?? false,
      supportsVision: input.supportsVision ?? false,
      supportsStreaming: input.supportsStreaming ?? true,
      enabled: input.enabled ?? true,
    };

    if (input.id) {
      return this.prisma.model.update({
        where: { id: input.id },
        data,
      });
    }

    return this.prisma.model.upsert({
      where: { publicId: data.publicId },
      update: data,
      create: data,
    });
  }

  async deleteModelPrice(id: string) {
    await this.prisma.model.delete({ where: { id } });
    return { ok: true };
  }

  async calculateUsageCost(input: {
    upstreamModel: string;
    publicModel?: string;
    usage?: ProviderUsage;
    providerId?: string;
    userId?: string;
    billingGroupId?: string;
    modelGroupId?: string;
  }): Promise<UsageCostBreakdown | undefined> {
    if (!input.usage) {
      return undefined;
    }

    const model = await this.prisma.model.findFirst({
      where: {
        OR: [
          { upstreamModel: input.upstreamModel },
          ...(input.publicModel ? [{ publicId: input.publicModel }] : []),
        ],
        ...(input.providerId ? { providerId: input.providerId } : {}),
      },
    });

    if (!model) {
      return undefined;
    }

    const cost = this.calculateModelCost(model, input.usage);
    const group = await this.resolveBillingGroup({
      userId: input.userId,
      billingGroupId: input.billingGroupId,
    });
    const modelMultiplier = model.priceMultiplier ?? 1;
    const multiplier = group?.multiplier ?? 1;
    const costUsd = Number(
      (cost.baseCostUsd * modelMultiplier * multiplier).toFixed(8),
    );

    return {
      ...cost,
      costUsd,
      modelMultiplier,
      multiplier,
      billingGroupId: group?.id,
      billingGroupName: group?.name,
    };
  }

  private async userBillingGroup(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { billingGroup: true },
    });
    if (!user) {
      return undefined;
    }
    return user.billingGroup ?? this.ensureDefaultGroup(user.tenantId);
  }

  private async resolveBillingGroup(input: {
    userId?: string;
    billingGroupId?: string;
  }) {
    if (input.billingGroupId) {
      const group = await this.prisma.billingGroup.findUnique({
        where: { id: input.billingGroupId },
      });
      if (group) {
        return group;
      }
    }
    return input.userId ? this.userBillingGroup(input.userId) : undefined;
  }

  private normalizeAllowedModels(value?: string[]) {
    return Array.from(
      new Set(
        (value ?? [])
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
      ),
    );
  }

  private parseAllowedModels(value?: string | null) {
    if (!value) {
      return [];
    }
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return this.normalizeAllowedModels(
          parsed.filter((item): item is string => typeof item === "string"),
        );
      }
    } catch {
      return [];
    }
    return [];
  }

  private calculateModelCost(
    model: {
      inputUsdPerMillionTokens: number;
      outputUsdPerMillionTokens: number;
      priceMultiplier: number;
    },
    usage: ProviderUsage,
  ) {
    const cacheReadTokens = usage.cacheReadTokens ?? 0;
    const cacheCreationTokens = usage.cacheCreationTokens ?? 0;
    const cacheTokens = cacheReadTokens + cacheCreationTokens;
    const cacheIncludedInInput =
      cacheTokens > 0 &&
      usage.inputTokens >= cacheTokens &&
      usage.totalTokens <= usage.inputTokens + usage.outputTokens;
    const regularInputTokens = cacheIncludedInInput
      ? Math.max(usage.inputTokens - cacheTokens, 0)
      : usage.inputTokens;
    const inputCostUsd =
      ((regularInputTokens + cacheReadTokens + cacheCreationTokens) /
        1_000_000) *
      model.inputUsdPerMillionTokens;
    const outputCostUsd =
      (usage.outputTokens / 1_000_000) * model.outputUsdPerMillionTokens;
    const baseCostUsd = Number((inputCostUsd + outputCostUsd).toFixed(8));

    return {
      baseCostUsd,
      inputCostUsd: Number(inputCostUsd.toFixed(8)),
      outputCostUsd: Number(outputCostUsd.toFixed(8)),
    };
  }

  private serializeModelPrice(model: {
    id: string;
    providerId: string;
    modelGroupId: string | null;
    publicId: string;
    upstreamModel: string;
    displayName: string;
    description: string | null;
    contextWindow: number | null;
    priceMultiplier: number;
    inputUsdPerMillionTokens: number;
    outputUsdPerMillionTokens: number;
    supportsTools: boolean;
    supportsVision: boolean;
    supportsStreaming: boolean;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
    provider: { provider: string; name: string; protocol: string; enabled: boolean };
    modelGroup: { id: string; slug: string; name: string } | null;
  }) {
    return {
      id: model.id,
      providerId: model.providerId,
      modelGroupId: model.modelGroupId ?? undefined,
      modelGroupSlug: model.modelGroup?.slug,
      modelGroupName: model.modelGroup?.name,
      provider: model.provider.provider,
      providerName: model.provider.name,
      protocol: model.provider.protocol,
      publicId: model.publicId,
      upstreamModel: model.upstreamModel,
      displayName: model.displayName,
      description: model.description ?? undefined,
      contextWindow: model.contextWindow ?? undefined,
      priceMultiplier: model.priceMultiplier,
      inputUsdPerMillionTokens: model.inputUsdPerMillionTokens,
      outputUsdPerMillionTokens: model.outputUsdPerMillionTokens,
      supportsTools: model.supportsTools,
      supportsVision: model.supportsVision,
      supportsStreaming: model.supportsStreaming,
      enabled: model.enabled,
      providerEnabled: model.provider.enabled,
      createdAt: model.createdAt.toISOString(),
      updatedAt: model.updatedAt.toISOString(),
    };
  }

  private required(value: string, field: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException(`${field} is required`);
    }
    return trimmed;
  }

  private assertPositivePrice(value: number, label: string) {
    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException(`${label} must be zero or greater`);
    }
  }
}
