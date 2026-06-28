import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ProviderId } from "@gateway/shared";
import { PrismaService } from "../database/prisma.service";
import { KeyCryptoService } from "../security/key-crypto.service";

@Injectable()
export class AdminProviderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: KeyCryptoService,
  ) {}

  async listProviders() {
    const providers = await this.prisma.provider.findMany({
      include: { keys: true },
      orderBy: { createdAt: "asc" },
    });

    return providers.map((provider) => this.serializeProvider(provider));
  }

  async listProvidersPage(query: { page?: number; pageSize?: number }) {
    const pageSize = Math.min(Math.max(query.pageSize ?? 5, 1), 50);
    const page = Math.max(query.page ?? 1, 1);
    const total = await this.prisma.provider.count();
    const maxPage = Math.max(Math.ceil(total / pageSize), 1);
    const normalizedPage = Math.min(page, maxPage);

    const rows = await this.prisma.provider.findMany({
      include: { keys: true },
      orderBy: { createdAt: "asc" },
      skip: (normalizedPage - 1) * pageSize,
      take: pageSize,
    });

    return {
      rows: rows.map((provider) => this.serializeProvider(provider)),
      total,
      page: normalizedPage,
      pageSize,
    };
  }

  async upsertProvider(body: Record<string, unknown>) {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const provider = this.normalizeSlug(this.requiredString(
      body.provider ?? body.slug,
      "slug",
    )) as ProviderId;
    const name = this.requiredString(body.name, "name");
    const baseUrl = this.requiredString(body.baseUrl, "baseUrl");
    const protocol = this.validateProtocol(this.requiredString(
      body.protocol ?? "openai-compatible",
      "protocol",
    ));
    const enabled = typeof body.enabled === "boolean" ? body.enabled : true;

    if (id) {
      const existing = await this.prisma.provider.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException("Provider not found");
      }

      return this.prisma.provider.update({
        where: { id },
        data: { provider, name, protocol, baseUrl, enabled },
      });
    }

    return this.prisma.provider.upsert({
      where: { provider },
      update: { name, protocol, baseUrl, enabled },
      create: { provider, name, protocol, baseUrl, enabled },
    });
  }

  async deleteProvider(id: string) {
    const existing = await this.prisma.provider.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Provider not found");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.providerKey.deleteMany({ where: { providerId: id } });
      await tx.model.deleteMany({ where: { providerId: id } });
      await tx.provider.delete({ where: { id } });

      const aliases = await tx.modelAlias.findMany();
      await Promise.all(
        aliases.map(async (alias) => {
          const existingTargets = this.parseAliasTargets(alias.targets);
          const targets = existingTargets.filter(
            (target) =>
              target.providerId !== id &&
              target.providerSlug !== existing.provider &&
              target.provider !== existing.provider,
          );
          if (targets.length === existingTargets.length) {
            return;
          }
          await tx.modelAlias.update({
            where: { id: alias.id },
            data: { targets: JSON.stringify(targets) },
          });
        }),
      );
    });

    return { ok: true };
  }

  async createProviderKey(body: Record<string, unknown>) {
    const providerId = this.requiredString(body.providerId, "providerId");
    const name = this.requiredString(body.name, "name");
    const secret = this.requiredString(body.secret, "secret");

    const provider = await this.prisma.provider.findUnique({
      where: { id: providerId },
    });
    if (!provider) {
      throw new NotFoundException("Provider not found");
    }

    return this.prisma.providerKey.create({
      data: {
        providerId,
        name,
        encryptedKey: this.crypto.encrypt(secret),
        status: "healthy",
        weight: this.optionalInt(body.weight) ?? 1,
        rpmLimit: this.optionalInt(body.rpmLimit),
        tpmLimit: this.optionalInt(body.tpmLimit),
        dailyBudgetUsd: this.optionalNumber(body.dailyBudgetUsd),
        windowSizeMinutes: this.optionalInt(body.windowSizeMinutes) ?? 300,
        windowRequestLimit: this.optionalInt(body.windowRequestLimit) ?? 500,
      },
      select: {
        id: true,
        name: true,
        status: true,
        weight: true,
        rpmLimit: true,
        tpmLimit: true,
        dailyBudgetUsd: true,
        windowSizeMinutes: true,
        windowRequestLimit: true,
        windowRequestCount: true,
        windowStartedAt: true,
        createdAt: true,
      },
    });
  }

  async updateProviderKey(id: string, body: Record<string, unknown>) {
    const existing = await this.prisma.providerKey.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Provider key not found");
    }

    return this.prisma.providerKey.update({
      where: { id },
      data: {
        name: typeof body.name === "string" ? body.name : undefined,
        status: typeof body.status === "string" ? body.status : undefined,
        weight: this.optionalInt(body.weight),
        rpmLimit: this.optionalInt(body.rpmLimit),
        tpmLimit: this.optionalInt(body.tpmLimit),
        dailyBudgetUsd: this.optionalNumber(body.dailyBudgetUsd),
        windowSizeMinutes: this.optionalInt(body.windowSizeMinutes),
        windowRequestLimit: this.optionalInt(body.windowRequestLimit),
        encryptedKey:
          typeof body.secret === "string" && body.secret.length > 0
            ? this.crypto.encrypt(body.secret)
            : undefined,
      },
      select: {
        id: true,
        name: true,
        status: true,
        weight: true,
        rpmLimit: true,
        tpmLimit: true,
        dailyBudgetUsd: true,
        windowSizeMinutes: true,
        windowRequestLimit: true,
        windowRequestCount: true,
        windowStartedAt: true,
        updatedAt: true,
      },
    });
  }

  async resetProviderKey(id: string) {
    const existing = await this.prisma.providerKey.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Provider key not found");
    }

    return this.prisma.providerKey.update({
      where: { id },
      data: {
        status: "healthy",
        lastError: null,
        cooldownUntil: null,
        windowStartedAt: null,
        windowRequestCount: 0,
      },
      select: {
        id: true,
        name: true,
        status: true,
        windowRequestCount: true,
        windowStartedAt: true,
        updatedAt: true,
      },
    });
  }

  async resetProviderKeys(providerId: string) {
    const existing = await this.prisma.provider.findUnique({
      where: { id: providerId },
    });
    if (!existing) {
      throw new NotFoundException("Provider not found");
    }

    await this.prisma.providerKey.updateMany({
      where: { providerId },
      data: {
        status: "healthy",
        lastError: null,
        cooldownUntil: null,
        windowStartedAt: null,
        windowRequestCount: 0,
      },
    });
    return { ok: true };
  }

  async deleteProviderKey(id: string) {
    await this.prisma.providerKey.delete({ where: { id } });
    return { ok: true };
  }

  private requiredString(value: unknown, field: string) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new BadRequestException(`Missing required field: ${field}`);
    }
    return value.trim();
  }

  private normalizeSlug(value: string) {
    const slug = value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(slug)) {
      throw new BadRequestException(
        "Slug can only contain lowercase letters, numbers, dots, underscores, and hyphens",
      );
    }
    return slug;
  }

  private validateProtocol(value: string) {
    if (value !== "openai-compatible" && value !== "anthropic") {
      throw new BadRequestException("Unsupported provider protocol");
    }
    return value;
  }

  private parseAliasTargets(
    value: string,
  ): Array<{ provider?: string; providerId?: string; providerSlug?: string }> {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private optionalInt(value: unknown) {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw new BadRequestException("Expected integer value");
    }
    return parsed;
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

  private serializeProvider(provider: {
    id: string;
    provider: string;
    protocol: string;
    name: string;
    baseUrl: string;
    enabled: boolean;
    keys: Array<{
      id: string;
      name: string;
      status: string;
      weight: number;
      rpmLimit: number | null;
      tpmLimit: number | null;
      dailyBudgetUsd: number | null;
      windowSizeMinutes: number;
      windowRequestLimit: number;
      windowStartedAt: Date | null;
      windowRequestCount: number;
      lastError: string | null;
      cooldownUntil: Date | null;
      createdAt: Date;
    }>;
  }) {
    return {
      id: provider.id,
      provider: provider.provider,
      slug: provider.provider,
      protocol: provider.protocol,
      name: provider.name,
      baseUrl: provider.baseUrl,
      enabled: provider.enabled,
      keys: provider.keys.map((key) => ({
        id: key.id,
        name: key.name,
        status: key.status,
        weight: key.weight,
        rpmLimit: key.rpmLimit,
        tpmLimit: key.tpmLimit,
        dailyBudgetUsd: key.dailyBudgetUsd,
        windowSizeMinutes: key.windowSizeMinutes,
        windowRequestLimit: key.windowRequestLimit,
        windowStartedAt: key.windowStartedAt,
        windowRequestCount: key.windowRequestCount,
        windowRemaining: Math.max(
          key.windowRequestLimit - key.windowRequestCount,
          0,
        ),
        windowResetAt: key.windowStartedAt
          ? new Date(
              key.windowStartedAt.getTime() + key.windowSizeMinutes * 60_000,
            )
          : null,
        lastError: key.lastError,
        cooldownUntil: key.cooldownUntil,
        createdAt: key.createdAt,
      })),
    };
  }
}
