import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { BudgetService } from "../billing/budget.service";
import { KeyCryptoService } from "../security/key-crypto.service";

export interface VerifiedGatewayKey {
  id: string;
  tenantId: string;
  projectId?: string;
  userId?: string;
  billingGroupId?: string;
  modelGroupId?: string;
  name: string;
}

@Injectable()
export class ApiKeyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budgets: BudgetService,
    private readonly crypto: KeyCryptoService,
  ) {}

  async create(body: Record<string, unknown>) {
    const name = this.requiredString(body.name, "name");
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "default";
    const projectId =
      typeof body.projectId === "string" && body.projectId.length > 0
        ? body.projectId
        : "default";
    const billingGroupId = await this.resolveBillingGroupId(
      tenantId,
      typeof body.billingGroupId === "string" ? body.billingGroupId : undefined,
      body.allowPlatformBillingGroup === true,
    );
    const modelGroupId = await this.resolveModelGroupId(
      typeof body.modelGroupId === "string" ? body.modelGroupId : undefined,
    );
    const customKey = this.optionalString(body.customKey);
    const key = customKey || `gw_live_${randomBytes(24).toString("base64url")}`;
    if (!key.startsWith("gw_")) {
      throw new BadRequestException("Custom key must start with gw_");
    }

    const created = await this.prisma.apiKey.create({
      data: {
        tenantId,
        projectId,
        userId: typeof body.userId === "string" ? body.userId : undefined,
        billingGroupId,
        modelGroupId,
        name,
        keyHash: this.hash(key),
        encryptedKey: this.crypto.encrypt(key),
        keyPrefix: this.prefix(key),
        enabled: true,
        customKey: Boolean(customKey),
        ipAllowlist: this.optionalString(body.ipAllowlist),
        rateLimitRpm: this.optionalInteger(body.rateLimitRpm),
        rateLimitTpm: this.optionalInteger(body.rateLimitTpm),
        expiresAt: this.optionalDate(body.expiresAt),
        dailyBudgetUsd: this.optionalNumber(body.dailyBudgetUsd),
        monthlyBudgetUsd: this.optionalNumber(body.monthlyBudgetUsd),
      },
    });

    return {
      id: created.id,
      tenantId: created.tenantId,
      projectId: created.projectId ?? undefined,
      billingGroupId: created.billingGroupId ?? undefined,
      modelGroupId: created.modelGroupId ?? undefined,
      name: created.name,
      key,
      keyPrefix: created.keyPrefix,
      enabled: created.enabled,
      customKey: created.customKey,
      ipAllowlist: created.ipAllowlist ?? undefined,
      rateLimitRpm: created.rateLimitRpm ?? undefined,
      rateLimitTpm: created.rateLimitTpm ?? undefined,
      expiresAt: created.expiresAt?.toISOString(),
      dailyBudgetUsd: created.dailyBudgetUsd ?? undefined,
      monthlyBudgetUsd: created.monthlyBudgetUsd ?? undefined,
      createdAt: created.createdAt,
    };
  }

  async createForTenant(input: {
    tenantId: string;
    projectId?: string;
    billingGroupId?: string;
    modelGroupId?: string;
    allowPlatformBillingGroup?: boolean;
    userId?: string;
    name: string;
    customKey?: string;
    ipAllowlist?: string;
    rateLimitRpm?: number;
    rateLimitTpm?: number;
    expiresAt?: string;
    dailyBudgetUsd?: number;
    monthlyBudgetUsd?: number;
  }) {
    return this.create({
      tenantId: input.tenantId,
      projectId: input.projectId,
      billingGroupId: input.billingGroupId,
      modelGroupId: input.modelGroupId,
      allowPlatformBillingGroup: input.allowPlatformBillingGroup,
      userId: input.userId,
      name: input.name,
      customKey: input.customKey,
      ipAllowlist: input.ipAllowlist,
      rateLimitRpm: input.rateLimitRpm,
      rateLimitTpm: input.rateLimitTpm,
      expiresAt: input.expiresAt,
      dailyBudgetUsd: input.dailyBudgetUsd,
      monthlyBudgetUsd: input.monthlyBudgetUsd,
    });
  }

  async list() {
    const keys = await this.prisma.apiKey.findMany({
      select: {
        id: true,
        tenantId: true,
        projectId: true,
        userId: true,
        billingGroupId: true,
        billingGroup: { select: { name: true, multiplier: true } },
        modelGroupId: true,
        modelGroup: { select: { name: true } },
        name: true,
        encryptedKey: true,
        keyPrefix: true,
        enabled: true,
        customKey: true,
        ipAllowlist: true,
        rateLimitRpm: true,
        rateLimitTpm: true,
        expiresAt: true,
        lastUsedAt: true,
        dailyBudgetUsd: true,
        monthlyBudgetUsd: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return Promise.all(
      keys.map(async (key) => ({
        ...this.withReadableKey(key),
        usage: await this.budgets.usageForApiKey(key.id),
      })),
    );
  }

  async listPage(query: { page?: number; pageSize?: number }) {
    const pageSize = Math.min(Math.max(query.pageSize ?? 10, 1), 100);
    const page = Math.max(query.page ?? 1, 1);
    const total = await this.prisma.apiKey.count();
    const maxPage = Math.max(Math.ceil(total / pageSize), 1);
    const normalizedPage = Math.min(page, maxPage);

    const rows = await this.prisma.apiKey.findMany({
      select: {
        id: true,
        tenantId: true,
        projectId: true,
        userId: true,
        billingGroupId: true,
        billingGroup: { select: { name: true, multiplier: true } },
        modelGroupId: true,
        modelGroup: { select: { name: true } },
        name: true,
        encryptedKey: true,
        keyPrefix: true,
        enabled: true,
        customKey: true,
        ipAllowlist: true,
        rateLimitRpm: true,
        rateLimitTpm: true,
        expiresAt: true,
        lastUsedAt: true,
        dailyBudgetUsd: true,
        monthlyBudgetUsd: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (normalizedPage - 1) * pageSize,
      take: pageSize,
    });

    return {
      rows: await Promise.all(
        rows.map(async (key) => ({
          ...this.withReadableKey(key),
          usage: await this.budgets.usageForApiKey(key.id),
        })),
      ),
      total,
      page: normalizedPage,
      pageSize,
    };
  }

  async listTenantPage(
    tenantId: string,
    query: { page?: number; pageSize?: number; userId?: string },
  ) {
    const pageSize = Math.min(Math.max(query.pageSize ?? 10, 1), 100);
    const page = Math.max(query.page ?? 1, 1);
    const where = { tenantId, userId: query.userId };
    const total = await this.prisma.apiKey.count({ where });
    const maxPage = Math.max(Math.ceil(total / pageSize), 1);
    const normalizedPage = Math.min(page, maxPage);

    const rows = await this.prisma.apiKey.findMany({
      where,
      select: {
        id: true,
        tenantId: true,
        projectId: true,
        userId: true,
        billingGroupId: true,
        billingGroup: { select: { name: true, multiplier: true } },
        modelGroupId: true,
        modelGroup: { select: { name: true } },
        name: true,
        encryptedKey: true,
        keyPrefix: true,
        enabled: true,
        customKey: true,
        ipAllowlist: true,
        rateLimitRpm: true,
        rateLimitTpm: true,
        expiresAt: true,
        lastUsedAt: true,
        dailyBudgetUsd: true,
        monthlyBudgetUsd: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (normalizedPage - 1) * pageSize,
      take: pageSize,
    });

    return {
      rows: await Promise.all(
        rows.map(async (key) => ({
          ...this.withReadableKey(key),
          usage: await this.budgets.usageForApiKey(key.id),
        })),
      ),
      total,
      page: normalizedPage,
      pageSize,
    };
  }

  async update(id: string, body: Record<string, unknown>) {
    const current =
      typeof body.billingGroupId === "string" || typeof body.modelGroupId === "string"
        ? await this.prisma.apiKey.findUnique({
            where: { id },
            select: { tenantId: true },
          })
        : undefined;
    return this.prisma.apiKey.update({
      where: { id },
      data: {
        name: typeof body.name === "string" ? body.name : undefined,
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        billingGroupId:
          typeof body.billingGroupId === "string"
            ? await this.resolveBillingGroupId(
                current?.tenantId,
                body.billingGroupId,
                body.allowPlatformBillingGroup === true,
              )
            : undefined,
        modelGroupId:
          typeof body.modelGroupId === "string"
            ? await this.resolveModelGroupId(body.modelGroupId)
            : undefined,
        ipAllowlist:
          body.ipAllowlist === null
            ? null
            : typeof body.ipAllowlist === "string"
              ? body.ipAllowlist
              : undefined,
        rateLimitRpm: this.optionalInteger(body.rateLimitRpm),
        rateLimitTpm: this.optionalInteger(body.rateLimitTpm),
        expiresAt:
          body.expiresAt === null ? null : this.optionalDate(body.expiresAt),
        dailyBudgetUsd: this.optionalNumber(body.dailyBudgetUsd),
        monthlyBudgetUsd: this.optionalNumber(body.monthlyBudgetUsd),
      },
      select: {
        id: true,
        tenantId: true,
        projectId: true,
        userId: true,
        billingGroupId: true,
        billingGroup: { select: { name: true, multiplier: true } },
        modelGroupId: true,
        modelGroup: { select: { name: true } },
        name: true,
        encryptedKey: true,
        keyPrefix: true,
        enabled: true,
        customKey: true,
        ipAllowlist: true,
        rateLimitRpm: true,
        rateLimitTpm: true,
        expiresAt: true,
        lastUsedAt: true,
        dailyBudgetUsd: true,
        monthlyBudgetUsd: true,
        updatedAt: true,
      },
    });
  }

  async updateTenantKey(
    id: string,
    tenantId: string,
    body: Record<string, unknown>,
    userId?: string,
    options: { allowPlatformBillingGroup?: boolean } = {},
  ) {
    await this.assertTenantKey(id, tenantId, userId);
    return this.update(id, {
      ...body,
      allowPlatformBillingGroup: options.allowPlatformBillingGroup,
    });
  }

  async delete(id: string) {
    await this.prisma.apiKey.delete({ where: { id } });
    return { ok: true };
  }

  async deleteTenantKey(id: string, tenantId: string, userId?: string) {
    await this.assertTenantKey(id, tenantId, userId);
    return this.delete(id);
  }

  async verify(rawKey: string | undefined): Promise<VerifiedGatewayKey> {
    if (!rawKey) {
      throw new UnauthorizedException("Missing gateway API key");
    }

    const key = rawKey.trim();
    if (!key.startsWith("gw_")) {
      throw new UnauthorizedException("Invalid gateway API key");
    }

    const hash = this.hash(key);
    const candidates = await this.prisma.apiKey.findMany({
      where: { enabled: true, keyPrefix: this.prefix(key) },
      include: {
        user: {
          select: {
            disabled: true,
          },
        },
      },
    });

    const match = candidates.find((candidate) =>
      this.safeEqual(candidate.keyHash, hash),
    );
    if (!match) {
      throw new UnauthorizedException("Invalid gateway API key");
    }
    if (match.user?.disabled) {
      throw new UnauthorizedException("Account disabled");
    }

    await this.prisma.apiKey.update({
      where: { id: match.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      id: match.id,
      tenantId: match.tenantId,
      projectId: match.projectId ?? undefined,
      userId: match.userId ?? undefined,
      billingGroupId: match.billingGroupId ?? undefined,
      modelGroupId: match.modelGroupId ?? undefined,
      name: match.name,
    };
  }

  extract(headers: Record<string, unknown>) {
    const authorization = this.header(headers.authorization);
    if (authorization?.toLowerCase().startsWith("bearer ")) {
      return authorization.slice("bearer ".length).trim();
    }

    return (
      this.header(headers["x-api-key"]) ??
      this.header(headers["anthropic-api-key"]) ??
      this.header(headers["api-key"])
    );
  }

  private hash(key: string) {
    return createHash("sha256").update(key).digest("hex");
  }

  private prefix(key: string) {
    return key.slice(0, 16);
  }

  private withReadableKey<
    T extends {
      encryptedKey?: string | null;
      expiresAt?: Date | null;
      lastUsedAt?: Date | null;
      createdAt?: Date;
      updatedAt?: Date;
      billingGroupId?: string | null;
      billingGroup?: { name: string; multiplier: number } | null;
      modelGroup?: { name: string } | null;
    },
  >(key: T) {
    const { encryptedKey, ...rest } = key;
    return {
      ...rest,
      key: encryptedKey ? this.crypto.decrypt(encryptedKey) : undefined,
      expiresAt: key.expiresAt?.toISOString(),
      lastUsedAt: key.lastUsedAt?.toISOString(),
      createdAt: key.createdAt?.toISOString(),
      updatedAt: key.updatedAt?.toISOString(),
      modelGroupName:
        "modelGroup" in key ? key.modelGroup?.name : undefined,
      billingGroupName:
        "billingGroup" in key ? key.billingGroup?.name : undefined,
      billingMultiplier:
        "billingGroup" in key ? key.billingGroup?.multiplier : undefined,
    };
  }

  private safeEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private header(value: unknown) {
    if (Array.isArray(value)) {
      return typeof value[0] === "string" ? value[0] : undefined;
    }
    return typeof value === "string" ? value : undefined;
  }

  private requiredString(value: unknown, field: string) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new BadRequestException(`Missing required field: ${field}`);
    }
    return value.trim();
  }

  private optionalNumber(value: unknown) {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      throw new BadRequestException("Expected number value");
    }
    return parsed;
  }

  private optionalInteger(value: unknown) {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw new BadRequestException("Expected integer value");
    }
    return parsed;
  }

  private optionalString(value: unknown) {
    if (typeof value !== "string") {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private optionalDate(value: unknown) {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    if (typeof value !== "string") {
      throw new BadRequestException("Expected date string value");
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException("Invalid date value");
    }
    return date;
  }

  private async resolveModelGroupId(modelGroupId: string | undefined) {
    if (!modelGroupId) {
      return undefined;
    }
    const group = await this.prisma.modelGroup.findUnique({
      where: { id: modelGroupId },
      select: { id: true },
    });
    if (!group) {
      throw new BadRequestException("Group not found");
    }
    return modelGroupId;
  }

  private async resolveBillingGroupId(
    tenantId: string | undefined,
    billingGroupId: string | undefined,
    allowPlatformGroup = false,
  ) {
    if (!billingGroupId) {
      if (!tenantId) {
        return undefined;
      }
      const defaultGroup = await this.prisma.billingGroup.findFirst({
        where: { tenantId, isDefault: true },
        select: { id: true },
      });
      return defaultGroup?.id;
    }
    const group = await this.prisma.billingGroup.findUnique({
      where: { id: billingGroupId },
      select: { id: true, tenantId: true },
    });
    const canUseGroup =
      group &&
      (!tenantId ||
        group.tenantId === tenantId ||
        (allowPlatformGroup && group.tenantId === "default"));
    if (!canUseGroup) {
      throw new BadRequestException("Billing group not found");
    }
    return group.id;
  }

  private async assertTenantKey(id: string, tenantId: string, userId?: string) {
    const key = await this.prisma.apiKey.findUnique({
      where: { id },
      select: { tenantId: true, userId: true },
    });
    if (!key || key.tenantId !== tenantId || (userId && key.userId !== userId)) {
      throw new UnauthorizedException("API key not found");
    }
  }
}
