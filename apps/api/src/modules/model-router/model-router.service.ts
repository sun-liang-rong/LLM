import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { RoutingDecision } from "@gateway/protocol";
import type {
  GatewayModel,
  ModelAlias,
  ProviderId,
  RouteCandidateScore,
  RouteTarget,
  UpstreamProtocol,
} from "@gateway/shared";
import { PrismaService } from "../database/prisma.service";
import { KeyPoolService } from "../key-pool/key-pool.service";

@Injectable()
export class ModelRouterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keyPool: KeyPoolService,
  ) {}

  async decide(model: string): Promise<RoutingDecision> {
    return this.decideWithFallback(model);
  }

  async decideWithFallback(
    model: string,
    options?: { excludeAliases?: string[] },
  ): Promise<RoutingDecision> {
    const aliases = await this.listAliases();
    const excluded = new Set(options?.excludeAliases ?? []);
    const alias = aliases.find(
      (item) => item.alias === model && !excluded.has(item.alias),
    );
    if (!alias) {
      throw new NotFoundException(
        `No model route configured for requested model: ${model}`,
      );
    }

    const selection = await this.pickTarget(alias);
    const target = selection.selected;
    if (!target) {
      throw new NotFoundException(`Model route has no enabled target: ${model}`);
    }
    const provider = await this.prisma.provider.findUnique({
      where: { id: target.providerId },
    });
    if (!provider || !provider.enabled) {
      throw new NotFoundException(
        `Provider not found or disabled for model route: ${model}`,
      );
    }
    return {
      provider: provider.provider as ProviderId,
      providerId: provider.id,
      providerSlug: provider.provider,
      upstreamProtocol: provider.protocol as UpstreamProtocol,
      upstreamModel: target.upstreamModel,
      baseUrl: provider.baseUrl,
      reason: `alias:${alias.alias}:${alias.mode}:${target.providerSlug}/${target.upstreamModel}`,
    };
  }

  async explain(model: string) {
    const aliases = await this.listAliases();
    const alias = aliases.find((item) => item.alias === model);
    if (!alias) {
      throw new NotFoundException(
        `No model route configured for requested model: ${model}`,
      );
    }
    const decision = await this.decide(model);
    const keyStats = await this.prisma.providerKey.groupBy({
      by: ["status"],
      where: { providerId: decision.providerId },
      _count: { _all: true },
    });
    const availableKeys = await this.availableKeyCount(decision.providerId);

    return {
      requestedModel: model,
      providerId: decision.providerId,
      providerSlug: decision.providerSlug,
      upstreamProtocol: decision.upstreamProtocol,
      upstreamModel: decision.upstreamModel,
      baseUrl: decision.baseUrl,
      reason: decision.reason,
      availableKeys,
      keyStats: Object.fromEntries(
        keyStats.map((item) => [item.status, item._count._all]),
      ),
      mode: alias.mode,
      candidateCount: alias.targets.length,
      targets: alias.targets,
      candidates: (await this.pickTarget(alias)).candidates,
      endpoint:
        decision.upstreamProtocol === "anthropic"
          ? this.joinUrl(decision.baseUrl, "/v1/messages")
          : this.joinUrl(decision.baseUrl, "/v1/chat/completions"),
    };
  }

  async listModels(): Promise<GatewayModel[]> {
    const models = await this.prisma.model.findMany({
      where: { enabled: true, provider: { enabled: true } },
      include: { provider: true },
      orderBy: { publicId: "asc" },
    });

    return models.map((model) => ({
      id: model.publicId,
      displayName: model.displayName,
      provider: model.provider.provider as ProviderId,
      upstreamModel: model.upstreamModel,
      inputUsdPerMillionTokens: model.inputUsdPerMillionTokens,
      outputUsdPerMillionTokens: model.outputUsdPerMillionTokens,
      supportsTools: model.supportsTools,
      supportsVision: model.supportsVision,
      supportsStreaming: model.supportsStreaming,
    }));
  }

  async listAliases(): Promise<ModelAlias[]> {
    const aliases = await this.prisma.modelAlias.findMany({
      orderBy: { alias: "asc" },
    });

    const providers = await this.listProviderReferences();
    return aliases.map((alias) => this.serializeAlias(alias, providers));
  }

  async listAliasesPage(query: { page?: number; pageSize?: number }) {
    const pageSize = Math.min(Math.max(query.pageSize ?? 10, 1), 100);
    const page = Math.max(query.page ?? 1, 1);
    const total = await this.prisma.modelAlias.count();
    const maxPage = Math.max(Math.ceil(total / pageSize), 1);
    const normalizedPage = Math.min(page, maxPage);

    const aliases = await this.prisma.modelAlias.findMany({
      orderBy: { alias: "asc" },
      skip: (normalizedPage - 1) * pageSize,
      take: pageSize,
    });
    const providers = await this.listProviderReferences();

    return {
      rows: aliases.map((alias) => this.serializeAlias(alias, providers)),
      total,
      page: normalizedPage,
      pageSize,
    };
  }

  private normalizeTargets(
    rawTargets: unknown,
    providers: Array<{ id: string; slug: string; protocol: UpstreamProtocol }>,
  ): RouteTarget[] {
    if (!Array.isArray(rawTargets)) {
      return [];
    }

    return rawTargets
      .map((target, index) => {
        if (typeof target !== "object" || target === null) {
          return undefined;
        }
        const item = target as Record<string, unknown>;
        const legacyProvider = typeof item.provider === "string" ? item.provider : "";
        const providerSlug =
          typeof item.providerSlug === "string"
            ? item.providerSlug
            : legacyProvider;
        const provider = providers.find(
          (candidate) =>
            candidate.id === item.providerId || candidate.slug === providerSlug,
        );
        if (!provider) {
          return undefined;
        }

        return {
          providerId: provider.id,
          providerSlug: provider.slug,
          upstreamProtocol:
            typeof item.upstreamProtocol === "string"
              ? (item.upstreamProtocol as UpstreamProtocol)
              : provider.protocol,
          upstreamModel:
            typeof item.upstreamModel === "string"
              ? item.upstreamModel
              : String(item.model ?? ""),
          weight: typeof item.weight === "number" ? item.weight : 1,
          priority: typeof item.priority === "number" ? item.priority : index + 1,
          enabled: typeof item.enabled === "boolean" ? item.enabled : true,
        };
      })
      .filter((target): target is RouteTarget => Boolean(target?.enabled));
  }

  async upsertAlias(body: Record<string, unknown>): Promise<ModelAlias> {
    const alias = this.requiredString(body.alias, "alias");
    const mode = this.optionalMode(body.mode);
    const providerId = this.requiredString(body.providerId, "providerId");
    const upstreamModel = this.requiredString(body.upstreamModel, "upstreamModel");
    const provider = await this.prisma.provider.findUnique({
      where: { id: providerId },
    });
    if (!provider) {
      throw new NotFoundException("Provider not found");
    }

    const targets = this.normalizeInputTargets(body.targets, {
      providerId,
      providerSlug: provider.provider,
      upstreamProtocol: provider.protocol as UpstreamProtocol,
      upstreamModel,
      weight: this.optionalInt(body.weight) ?? 1,
      priority: this.optionalInt(body.priority) ?? 1,
      enabled: typeof body.enabled === "boolean" ? body.enabled : true,
    });

    await this.prisma.modelAlias.upsert({
      where: { alias },
      update: {
        mode,
        targets: JSON.stringify(targets),
      },
      create: {
        alias,
        mode,
        targets: JSON.stringify(targets),
      },
    });

    const saved = (await this.listAliases()).find((item) => item.alias === alias);
    if (!saved) {
      throw new Error("Saved model route could not be loaded");
    }
    return saved;
  }

  async deleteAlias(alias: string) {
    await this.prisma.modelAlias.delete({ where: { alias } });
    return { ok: true };
  }

  private requiredString(value: unknown, field: string) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new BadRequestException(`Missing required field: ${field}`);
    }
    return value.trim();
  }

  private optionalMode(value: unknown): ModelAlias["mode"] {
    if (
      value === "cost" ||
      value === "latency" ||
      value === "quality" ||
      value === "balanced"
    ) {
      return value;
    }
    return "balanced";
  }

  private optionalInt(value: unknown) {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : undefined;
  }

  private validateProtocol(value: string) {
    if (value !== "openai-compatible" && value !== "anthropic") {
      throw new BadRequestException("Unsupported upstream protocol");
    }
  }

  private async availableKeyCount(providerId: string) {
    const now = new Date();
    const keys = await this.prisma.providerKey.findMany({
      where: {
        providerId,
        status: { in: ["healthy", "cooldown", "rate_limited"] },
      },
    });

    return keys.filter((key) => {
      if (key.status !== "healthy" && key.cooldownUntil && key.cooldownUntil > now) {
        return false;
      }
      if (!key.windowStartedAt) {
        return key.windowRequestCount < key.windowRequestLimit;
      }
      const windowExpired =
        key.windowStartedAt.getTime() + key.windowSizeMinutes * 60_000 <=
        now.getTime();
      return windowExpired || key.windowRequestCount < key.windowRequestLimit;
    }).length;
  }

  private async pickTarget(alias: ModelAlias) {
    const providers = await this.prisma.provider.findMany({
      where: { id: { in: alias.targets.map((target) => target.providerId) } },
    });
    const models = await this.prisma.model.findMany({
      where: {
        providerId: { in: alias.targets.map((target) => target.providerId) },
        upstreamModel: { in: alias.targets.map((target) => target.upstreamModel) },
      },
    });

    const providerMap = new Map(providers.map((provider) => [provider.id, provider]));
    const modelMap = new Map(
      models.map((model) => [`${model.providerId}:${model.upstreamModel}`, model]),
    );

    const candidates = (await Promise.all(
      alias.targets.map(async (target) => {
        const provider = providerMap.get(target.providerId);
        if (!provider || !provider.enabled || !target.enabled) {
          return undefined;
        }
        const availability = await this.keyPool.availability(target.providerId);
        if (availability.available <= 0) {
          return undefined;
        }
        const model = modelMap.get(`${target.providerId}:${target.upstreamModel}`);
        const unitCost =
          (model?.inputUsdPerMillionTokens ?? 0) +
          (model?.outputUsdPerMillionTokens ?? 0);
        const stats = await this.targetStats(target);
        const scored = this.targetScore(alias.mode, {
          priority: target.priority,
          weight: target.weight,
          availableKeys: availability.available,
          cost: unitCost,
          averageLatencyMs: stats.averageLatencyMs,
          successRatePercent: stats.successRatePercent,
          recentRequests: stats.recentRequests,
        });
        return {
          target,
          candidate: {
            providerId: target.providerId,
            providerSlug: target.providerSlug,
            upstreamModel: target.upstreamModel,
            availableKeys: availability.available,
            averageLatencyMs: stats.averageLatencyMs,
            successRatePercent: stats.successRatePercent,
            recentRequests: stats.recentRequests,
            unitCost,
            score: scored.score,
            selected: false as boolean,
            reasons: scored.reasons,
          } satisfies RouteCandidateScore,
        };
      }),
    )) as Array<
      | { target: RouteTarget; candidate: RouteCandidateScore }
      | undefined
    >;

    const ranked = candidates
      .filter((item): item is { target: RouteTarget; candidate: RouteCandidateScore } =>
        item !== undefined,
      )
      .sort((left, right) => right.candidate.score - left.candidate.score);

    const selected = ranked[0]?.target;
    const selectedKey = selected
      ? `${selected.providerId}:${selected.upstreamModel}`
      : "";
    const hydratedCandidates = ranked.map((item) => ({
      ...item.candidate,
      selected:
        `${item.target.providerId}:${item.target.upstreamModel}` === selectedKey,
    }));

    return {
      selected,
      candidates: hydratedCandidates,
    };
  }

  private targetScore(
    mode: ModelAlias["mode"],
    input: {
      priority: number;
      weight: number;
      availableKeys: number;
      cost: number;
      averageLatencyMs: number;
      successRatePercent: number;
      recentRequests: number;
    },
  ) {
    const priorityBoost = Math.max(0, 100 - input.priority * 10);
    const weightBoost = input.weight * 8;
    const availabilityBoost = input.availableKeys * 12;
    const costPenalty = input.cost;
    const latencyPenalty =
      input.averageLatencyMs > 0 ? input.averageLatencyMs / 120 : 0;
    const successBoost = input.successRatePercent * 0.9;
    const trafficConfidence = Math.min(input.recentRequests, 25);
    const reasons = [
      `priority:${input.priority}`,
      `weight:${input.weight}`,
      `availableKeys:${input.availableKeys}`,
      `success:${input.successRatePercent.toFixed(2)}%`,
      `latency:${Math.round(input.averageLatencyMs)}ms`,
      `recentRequests:${input.recentRequests}`,
      `unitCost:${input.cost.toFixed(4)}`,
    ];

    if (mode === "latency") {
      return {
        score:
          priorityBoost +
          availabilityBoost +
          weightBoost +
          successBoost +
          trafficConfidence -
          latencyPenalty * 5 -
          costPenalty * 0.2,
        reasons,
      };
    }
    if (mode === "cost") {
      return {
        score:
          priorityBoost +
          weightBoost +
          successBoost * 0.7 +
          trafficConfidence * 0.4 -
          costPenalty * 6 -
          latencyPenalty,
        reasons,
      };
    }
    if (mode === "quality") {
      return {
        score:
          priorityBoost +
          weightBoost +
          successBoost * 1.3 +
          trafficConfidence +
          costPenalty * 2 -
          latencyPenalty * 0.6,
        reasons,
      };
    }
    return {
      score:
        priorityBoost +
        weightBoost +
        availabilityBoost +
        successBoost +
        trafficConfidence -
        costPenalty * 1.2 -
        latencyPenalty * 1.8,
      reasons,
    };
  }

  private async targetStats(target: RouteTarget) {
    const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [completedAgg, totalCount, successCount] = await Promise.all([
      this.prisma.requestLog.aggregate({
        where: {
          provider: target.providerSlug,
          upstreamModel: target.upstreamModel,
          status: "completed",
          createdAt: { gte: start },
        },
        _avg: {
          latencyMs: true,
        },
      }),
      this.prisma.requestLog.count({
        where: {
          provider: target.providerSlug,
          upstreamModel: target.upstreamModel,
          createdAt: { gte: start },
        },
      }),
      this.prisma.requestLog.count({
        where: {
          provider: target.providerSlug,
          upstreamModel: target.upstreamModel,
          status: "completed",
          createdAt: { gte: start },
        },
      }),
    ]);

    const averageLatencyMs = completedAgg._avg.latencyMs ?? 0;
    const successRatePercent =
      totalCount > 0 ? Math.round((successCount / totalCount) * 10000) / 100 : 100;

    return {
      averageLatencyMs,
      successRatePercent,
      recentRequests: totalCount,
    };
  }

  private normalizeInputTargets(
    rawTargets: unknown,
    fallback: RouteTarget,
  ) {
    if (!Array.isArray(rawTargets) || rawTargets.length === 0) {
      this.validateProtocol(fallback.upstreamProtocol);
      return [fallback];
    }

    const targets = rawTargets
      .map((item, index) => {
        if (typeof item !== "object" || item === null) {
          return undefined;
        }
        const record = item as Record<string, unknown>;
        const providerId =
          typeof record.providerId === "string"
            ? record.providerId
            : fallback.providerId;
        const providerSlug =
          typeof record.providerSlug === "string"
            ? record.providerSlug
            : fallback.providerSlug;
        const upstreamProtocol =
          typeof record.upstreamProtocol === "string"
            ? (record.upstreamProtocol as UpstreamProtocol)
            : fallback.upstreamProtocol;
        const upstreamModel =
          typeof record.upstreamModel === "string"
            ? record.upstreamModel
            : fallback.upstreamModel;
        this.validateProtocol(upstreamProtocol);
        return {
          providerId,
          providerSlug,
          upstreamProtocol,
          upstreamModel,
          weight: this.optionalInt(record.weight) ?? 1,
          priority: this.optionalInt(record.priority) ?? index + 1,
          enabled:
            typeof record.enabled === "boolean" ? record.enabled : true,
        } satisfies RouteTarget;
      })
      .filter((target): target is RouteTarget => Boolean(target));

    return targets.length > 0 ? targets : [fallback];
  }

  private joinUrl(baseUrl: string, endpoint: string) {
    const normalizedBase = baseUrl.replace(/\/+$/, "");
    if (
      endpoint.startsWith("/v1/") &&
      normalizedBase.toLowerCase().endsWith("/v1")
    ) {
      return `${normalizedBase}${endpoint.slice(3)}`;
    }
    return `${normalizedBase}${endpoint}`;
  }

  private async listProviderReferences() {
    const providers = await this.prisma.provider.findMany();
    return providers.map((provider) => ({
      id: provider.id,
      slug: provider.provider,
      protocol: provider.protocol as UpstreamProtocol,
    }));
  }

  private serializeAlias(
    alias: { alias: string; mode: string; targets: string },
    providers: Array<{ id: string; slug: string; protocol: UpstreamProtocol }>,
  ): ModelAlias {
    return {
      alias: alias.alias,
      mode: alias.mode as ModelAlias["mode"],
      targets: this.normalizeTargets(JSON.parse(alias.targets), providers),
    };
  }
}
