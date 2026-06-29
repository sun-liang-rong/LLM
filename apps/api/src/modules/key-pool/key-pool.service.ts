import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ProviderId, ProviderKeySummary } from "@gateway/shared";
import { PrismaService } from "../database/prisma.service";
import type { ProviderErrorKind } from "../providers/providers/provider-adapter";
import { KeyCryptoService } from "../security/key-crypto.service";
import { orderedWeightedCandidates } from "./key-pool-scheduler.util";

export interface ProviderKey {
  id: string;
  provider: ProviderId;
  providerId?: string;
  providerSlug?: string;
  value: string;
  name: string;
  weight: number;
}

@Injectable()
export class KeyPoolService {
  private readonly keys: ProviderKey[];
  private cursor = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly crypto: KeyCryptoService,
  ) {
    this.keys = [
      ...this.readKeys("openai", "OPENAI_API_KEYS"),
      ...this.readKeys("anthropic", "ANTHROPIC_API_KEYS"),
    ];
  }

  async select(providerId: string): Promise<ProviderKey | undefined> {
    const candidates = await this.candidates(providerId);
    if (candidates.length === 0) {
      return undefined;
    }

    const selected = candidates[this.cursor % candidates.length];
    this.cursor += 1;
    return selected;
  }

  async candidates(providerIdOrSlug: string): Promise<ProviderKey[]> {
    await this.restoreExpiredCooldowns(providerIdOrSlug);
    const dbKeys = await this.databaseKeys(providerIdOrSlug);
    const candidates =
      dbKeys.length > 0
        ? dbKeys
        : this.keys.filter((key) => key.provider === providerIdOrSlug);
    if (candidates.length < 2) {
      return candidates;
    }

    const result = orderedWeightedCandidates(candidates, this.cursor);
    this.cursor = result.nextCursor;
    const ordered = result.ordered;
    return ordered;
  }

  async availability(providerIdOrSlug: string) {
    await this.restoreExpiredCooldowns(providerIdOrSlug);
    await this.resetExpiredWindows(providerIdOrSlug);

    const keys = await this.prisma.providerKey.findMany({
      where: {
        provider: {
          OR: [{ id: providerIdOrSlug }, { provider: providerIdOrSlug }],
          enabled: true,
        },
      },
      select: {
        status: true,
        windowRequestCount: true,
        windowRequestLimit: true,
      },
    });

    const byStatus: Record<string, number> = {};
    let exhausted = 0;
    let available = 0;

    for (const key of keys) {
      byStatus[key.status] = (byStatus[key.status] ?? 0) + 1;
      const windowAvailable = key.windowRequestCount < key.windowRequestLimit;
      const statusAvailable = key.status === "healthy";
      if (!windowAvailable) {
        exhausted += 1;
      }
      if (statusAvailable && windowAvailable) {
        available += 1;
      }
    }

    return {
      total: keys.length,
      available,
      exhausted,
      byStatus,
    };
  }

  async reportAttempt(keyId: string) {
    if (this.isEnvKey(keyId)) {
      return;
    }
    await this.incrementWindowCount(keyId);
  }

  async list(): Promise<ProviderKeySummary[]> {
    await this.restoreExpiredCooldowns();
    const dbKeys = await this.prisma.providerKey.findMany({
      include: { provider: true },
      orderBy: { createdAt: "desc" },
    });

    if (dbKeys.length > 0) {
      return dbKeys.map((key) => ({
        id: key.id,
        provider: key.provider.provider as ProviderId,
        name: key.name,
        status: key.status as ProviderKeySummary["status"],
        rpmLimit: key.rpmLimit ?? undefined,
        tpmLimit: key.tpmLimit ?? undefined,
        dailyBudgetUsd: key.dailyBudgetUsd ?? undefined,
        weight: key.weight,
        windowSizeMinutes: key.windowSizeMinutes,
        windowRequestLimit: key.windowRequestLimit,
        windowStartedAt: key.windowStartedAt?.toISOString(),
        windowRequestCount: key.windowRequestCount,
        windowRemaining: Math.max(
          key.windowRequestLimit - key.windowRequestCount,
          0,
        ),
        windowResetAt: key.windowStartedAt
          ? new Date(
              key.windowStartedAt.getTime() + key.windowSizeMinutes * 60_000,
            ).toISOString()
          : undefined,
        cooldownUntil: key.cooldownUntil?.toISOString(),
        lastError: key.lastError ?? undefined,
      }));
    }

    return this.keys.map((key) => ({
      id: key.id,
      provider: key.provider,
      name: key.name,
      status: "healthy",
      weight: key.weight,
    }));
  }

  async reportSuccess(keyId: string) {
    if (this.isEnvKey(keyId)) {
      return;
    }

    await this.prisma.providerKey.update({
      where: { id: keyId },
      data: {
        status: "healthy",
        lastError: null,
        cooldownUntil: null,
      },
    });
  }

  async reportFailure(
    keyId: string,
    kind: ProviderErrorKind,
    message: string,
    retryAfterMs?: number,
  ) {
    if (this.isEnvKey(keyId)) {
      return;
    }

    const status = this.statusForFailure(kind);
    const cooldownUntil = await this.cooldownUntil(keyId, kind, retryAfterMs);
    await this.prisma.providerKey.update({
      where: { id: keyId },
      data: {
        status,
        lastError: message.slice(0, 1000),
        cooldownUntil,
      },
    });
  }

  private async databaseKeys(providerIdOrSlug: string): Promise<ProviderKey[]> {
    await this.resetExpiredWindows(providerIdOrSlug);
    const keys = await this.prisma.providerKey.findMany({
      where: {
        OR: [
          { status: "healthy" },
          { status: "cooldown", cooldownUntil: { lte: new Date() } },
          { status: "rate_limited", cooldownUntil: { lte: new Date() } },
        ],
        provider: {
          OR: [{ id: providerIdOrSlug }, { provider: providerIdOrSlug }],
          enabled: true,
        },
      },
      include: { provider: true },
      orderBy: { createdAt: "asc" },
    });

    return keys
      .filter((key) => key.windowRequestCount < key.windowRequestLimit)
      .map((key) => ({
        id: key.id,
        provider: key.provider.provider as ProviderId,
        providerId: key.provider.id,
        providerSlug: key.provider.provider,
        value: this.crypto.decrypt(key.encryptedKey),
        name: key.name,
        weight: key.weight,
      }));
  }

  private async restoreExpiredCooldowns(providerIdOrSlug?: string) {
    await this.prisma.providerKey.updateMany({
      where: {
        status: { in: ["cooldown", "rate_limited"] },
        cooldownUntil: { lte: new Date() },
        provider: providerIdOrSlug
          ? { OR: [{ id: providerIdOrSlug }, { provider: providerIdOrSlug }] }
          : undefined,
      },
      data: {
        status: "healthy",
        cooldownUntil: null,
      },
    });
  }

  private async resetExpiredWindows(providerIdOrSlug?: string) {
    const now = new Date();
    const keys = await this.prisma.providerKey.findMany({
      where: {
        provider: providerIdOrSlug
          ? { OR: [{ id: providerIdOrSlug }, { provider: providerIdOrSlug }] }
          : undefined,
        windowStartedAt: { not: null },
      },
    });

    await Promise.all(
      keys
        .filter((key) => {
          if (!key.windowStartedAt) return false;
          return (
            key.windowStartedAt.getTime() + key.windowSizeMinutes * 60_000 <=
            now.getTime()
          );
        })
        .map((key) =>
          this.prisma.providerKey.update({
            where: { id: key.id },
            data: {
              windowStartedAt: null,
              windowRequestCount: 0,
              status:
                key.status === "rate_limited" || key.status === "cooldown"
                  ? "healthy"
                  : key.status,
              cooldownUntil: null,
            },
          }),
        ),
    );
  }

  private async incrementWindowCount(keyId: string) {
    const key = await this.prisma.providerKey.findUnique({ where: { id: keyId } });
    if (!key) {
      return;
    }

    const now = new Date();
    const windowExpired =
      !key.windowStartedAt ||
      key.windowStartedAt.getTime() + key.windowSizeMinutes * 60_000 <=
        now.getTime();

    await this.prisma.providerKey.update({
      where: { id: keyId },
      data: {
        windowStartedAt: windowExpired ? now : key.windowStartedAt,
        windowRequestCount: windowExpired ? 1 : key.windowRequestCount + 1,
      },
    });
  }

  private statusForFailure(kind: ProviderErrorKind) {
    if (kind === "auth") {
      return "healthy";
    }
    if (kind === "rate_limit") {
      return "rate_limited";
    }
    return "cooldown";
  }

  private async cooldownUntil(
    keyId: string,
    kind: ProviderErrorKind,
    retryAfterMs?: number,
  ) {
    if (kind === "auth") {
      return null;
    }

    if (kind === "rate_limit") {
      if (retryAfterMs !== undefined) {
        return new Date(Date.now() + retryAfterMs);
      }
      const key = await this.prisma.providerKey.findUnique({ where: { id: keyId } });
      if (key?.windowStartedAt) {
        return new Date(
          key.windowStartedAt.getTime() + key.windowSizeMinutes * 60_000,
        );
      }
      return new Date(Date.now() + 60 * 1000);
    }

    const seconds =
      kind === "server_error" || kind === "timeout"
          ? 30
          : 15;
    return new Date(Date.now() + seconds * 1000);
  }

  private isEnvKey(keyId: string) {
    return keyId.startsWith("openai-") || keyId.startsWith("anthropic-");
  }

  private readKeys(provider: ProviderId, envName: string): ProviderKey[] {
    const raw = this.config.get<string>(envName, "");
    return raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value, index) => ({
        id: `${provider}-${index + 1}`,
        provider,
        value,
        name: `${provider} key ${index + 1}`,
        weight: 1,
      }));
  }
}
