import { Injectable, Logger } from "@nestjs/common";
import type {
  DashboardOverview,
  DashboardTrendPoint,
  ProviderId,
  RequestDetail,
  UsageSummary,
} from "@gateway/shared";
import { PrismaService } from "../database/prisma.service";
import { normalizeProviderUsage } from "../providers/providers/provider-usage.util";

export interface RequestLogEntry {
  requestId: string;
  protocol: "openai" | "anthropic";
  apiKeyId?: string;
  tenantId?: string;
  projectId?: string;
  provider?: ProviderId;
  providerKeyId?: string;
  model: string;
  upstreamModel?: string;
  status: "started" | "completed" | "failed";
  latencyMs?: number;
  retryCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  reasoningTokens?: number;
  estimatedTokens?: boolean;
  costUsd?: number;
  error?: string;
}

@Injectable()
export class RequestLogService {
  private readonly logger = new Logger(RequestLogService.name);
  private readonly entries: RequestLogEntry[] = [];
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(private readonly prisma: PrismaService) {}

  record(entry: RequestLogEntry) {
    this.entries.unshift(entry);
    this.entries.splice(200);
    this.logger.log(JSON.stringify(entry));
    this.persistQueue = this.persistQueue
      .then(() => this.persist(entry))
      .catch((error) => {
        this.logger.error(
          error instanceof Error ? error.message : String(error),
          error instanceof Error ? error.stack : undefined,
        );
      });
  }

  recent(limit = 20) {
    return this.entries.slice(0, limit);
  }

  async tenantOverview(
    tenantId: string,
    query?: { range?: string; granularity?: string },
  ): Promise<UsageSummary> {
    const start = this.rangeStart(query?.range);
    const requests = await this.prisma.requestLog.findMany({
      where: { tenantId, createdAt: { gte: start } },
      orderBy: { createdAt: "desc" },
    });
    return this.summarizeUsage(requests);
  }

  async overview(query?: { range?: string; granularity?: string }) {
    const start = this.rangeStart(query?.range);
    const requests = await this.prisma.requestLog.findMany({
      where: { createdAt: { gte: start } },
      orderBy: { createdAt: "desc" },
    });

    if (requests.length > 0) {
      return this.summarizeUsage(requests);
    }

    const latestByRequest = new Map<string, RequestLogEntry>();
    for (const entry of [...this.entries].reverse()) {
      latestByRequest.set(entry.requestId, entry);
    }
    const latestEntries = [...latestByRequest.values()];
    return this.summarizeUsage(latestEntries);
  }

  async recentFromDb(limit = 20, query?: { range?: string }) {
    return this.prisma.requestLog.findMany({
      where: {
        createdAt: { gte: this.rangeStart(query?.range) },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        requestId: true,
        protocol: true,
        provider: true,
        model: true,
        status: true,
        latencyMs: true,
        error: true,
      },
    });
  }

  async tenantRecentFromDb(
    tenantId: string,
    limit = 20,
    query?: { range?: string },
  ) {
    return this.prisma.requestLog.findMany({
      where: {
        tenantId,
        createdAt: { gte: this.rangeStart(query?.range) },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        requestId: true,
        protocol: true,
        provider: true,
        model: true,
        status: true,
        latencyMs: true,
        error: true,
      },
    });
  }

  async dashboardOverview(query?: {
    range?: string;
    granularity?: string;
  }): Promise<DashboardOverview> {
    const start = this.rangeStart(query?.range);
    const [usage, providerRows, apiKeys, requestTotals, trend] = await Promise.all([
      this.overview(query),
      this.providerBreakdown(start),
      this.prisma.apiKey.findMany({
        select: {
          id: true,
          enabled: true,
          dailyBudgetUsd: true,
        },
      }),
      this.prisma.requestLog.aggregate({
        where: { status: "completed", createdAt: { gte: start } },
        _sum: {
          costUsd: true,
          totalTokens: true,
        },
      }),
      this.trend(start, query?.granularity),
    ]);

    const enabledApiKeys = apiKeys.filter((key) => key.enabled).length;
    const totalBalanceUsd = apiKeys.reduce(
      (sum, key) => sum + (key.dailyBudgetUsd ?? 0),
      0,
    );
    const totalSpentUsd = Number((requestTotals._sum.costUsd ?? 0).toFixed(8));
    const totalTokens = requestTotals._sum.totalTokens ?? 0;
    const averageLatencyMs =
      usage.requestsToday > 0 ? Math.round(usage.p95LatencyMs * 0.82) : 0;

    return {
      topMetrics: [
        {
          label: "balance",
          value: this.formatCurrency(Math.max(totalBalanceUsd - usage.costTodayUsd, 0)),
          caption: "available",
          emphasis: true,
        },
        {
          label: "apiKeys",
          value: String(apiKeys.length),
          caption: `${enabledApiKeys} active`,
        },
        {
          label: "requestsToday",
          value: this.formatInteger(usage.requestsToday),
          caption: `total: ${this.formatInteger(usage.requestsToday)}`,
        },
        {
          label: "todaySpend",
          value: this.formatCurrency(usage.costTodayUsd),
          caption: `total: ${this.formatCurrency(totalSpentUsd)}`,
        },
      ],
      secondaryMetrics: [
        {
          label: "tokensToday",
          value: this.formatCompact(usage.tokensToday),
          caption: "input / output synced",
        },
        {
          label: "totalTokens",
          value: this.formatCompact(totalTokens),
          caption: "lifetime usage",
        },
        {
          label: "performance",
          value: String(Math.max(1, Math.round(usage.requestsToday / 60))),
          caption: "RPM",
        },
        {
          label: "avgLatency",
          value: this.formatSeconds(averageLatencyMs),
          caption: "average time",
        },
      ],
      platformBreakdown: providerRows,
      notice: {
        title: "dailyCheckIn",
        text: "dailyCheckInText",
        actionLabel: "checkedIn",
        spendLabel: this.formatCurrency(usage.costTodayUsd),
        hint: "dailyCheckInHint",
      },
      trend,
    };
  }

  async tenantDashboardOverview(
    tenantId: string,
    query?: {
      range?: string;
      granularity?: string;
    },
  ): Promise<DashboardOverview> {
    const start = this.rangeStart(query?.range);
    const [usage, requestTotals, trend, apiKeys] = await Promise.all([
      this.tenantOverview(tenantId, query),
      this.prisma.requestLog.aggregate({
        where: {
          tenantId,
          status: "completed",
          createdAt: { gte: start },
        },
        _sum: {
          costUsd: true,
          totalTokens: true,
        },
      }),
      this.tenantTrend(tenantId, start, query?.granularity),
      this.prisma.apiKey.findMany({
        where: { tenantId },
        select: {
          id: true,
          enabled: true,
          dailyBudgetUsd: true,
        },
      }),
    ]);

    const totalSpentUsd = Number((requestTotals._sum.costUsd ?? 0).toFixed(8));
    const totalTokens = requestTotals._sum.totalTokens ?? 0;
    const enabledApiKeys = apiKeys.filter((key) => key.enabled).length;
    const totalBalanceUsd = apiKeys.reduce(
      (sum, key) => sum + (key.dailyBudgetUsd ?? 0),
      0,
    );
    const providerRows = await this.tenantProviderBreakdown(tenantId, start);
    const averageLatencyMs =
      usage.requestsToday > 0 ? Math.round(usage.p95LatencyMs * 0.82) : 0;

    return {
      topMetrics: [
        {
          label: "balance",
          value: this.formatCurrency(Math.max(totalBalanceUsd - usage.costTodayUsd, 0)),
          caption: "available",
          emphasis: true,
        },
        {
          label: "apiKeys",
          value: String(apiKeys.length),
          caption: `${enabledApiKeys} active`,
        },
        {
          label: "requestsToday",
          value: this.formatInteger(usage.requestsToday),
          caption: `total: ${this.formatInteger(usage.requestsToday)}`,
        },
        {
          label: "todaySpend",
          value: this.formatCurrency(usage.costTodayUsd),
          caption: `total: ${this.formatCurrency(totalSpentUsd)}`,
        },
      ],
      secondaryMetrics: [
        {
          label: "tokensToday",
          value: this.formatCompact(usage.tokensToday),
          caption: "input / output synced",
        },
        {
          label: "totalTokens",
          value: this.formatCompact(totalTokens),
          caption: "lifetime usage",
        },
        {
          label: "performance",
          value: String(Math.max(1, Math.round(usage.requestsToday / 60))),
          caption: "RPM",
        },
        {
          label: "avgLatency",
          value: this.formatSeconds(averageLatencyMs),
          caption: "average time",
        },
      ],
      platformBreakdown: providerRows,
      notice: {
        title: "dailyCheckIn",
        text: "dailyCheckInText",
        actionLabel: "checkedIn",
        spendLabel: this.formatCurrency(usage.costTodayUsd),
        hint: "dailyCheckInHint",
      },
      trend,
    };
  }

  async listRequests(query: {
    status?: string;
    provider?: string;
    model?: string;
    limit?: number;
    page?: number;
    pageSize?: number;
  }) {
    const pageSize = Math.min(
      Math.max(query.pageSize ?? query.limit ?? 50, 1),
      200,
    );
    const page = Math.max(query.page ?? 1, 1);
    const where = {
      status: query.status || undefined,
      provider: query.provider || undefined,
      model: query.model ? { contains: query.model } : undefined,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.requestLog.findMany({
        where,
      orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.requestLog.count({ where }),
    ]);

    return { rows, total, page, pageSize };
  }

  async listTenantRequests(
    tenantId: string,
    query: {
      status?: string;
      provider?: string;
      model?: string;
      limit?: number;
      page?: number;
      pageSize?: number;
    },
  ) {
    const pageSize = Math.min(
      Math.max(query.pageSize ?? query.limit ?? 50, 1),
      200,
    );
    const page = Math.max(query.page ?? 1, 1);
    const where = {
      tenantId,
      status: query.status || undefined,
      provider: query.provider || undefined,
      model: query.model ? { contains: query.model } : undefined,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.requestLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.requestLog.count({ where }),
    ]);

    return { rows, total, page, pageSize };
  }

  async requestDetail(requestId: string): Promise<RequestDetail | null> {
    const row = await this.prisma.requestLog.findUnique({
      where: { requestId },
    });
    return row ? this.toRequestDetail(row) : null;
  }

  async tenantRequestDetail(
    tenantId: string,
    requestId: string,
  ): Promise<RequestDetail | null> {
    const row = await this.prisma.requestLog.findFirst({
      where: { tenantId, requestId },
    });
    return row ? this.toRequestDetail(row) : null;
  }

  private summarizeUsage(
    requests: Array<{
      status: string;
      latencyMs?: number | null;
      totalTokens?: number | null;
      inputTokens?: number | null;
      outputTokens?: number | null;
      costUsd?: number | null;
    }>,
  ): UsageSummary {
    const completed = requests.filter((entry) => entry.status === "completed");
    const failed = requests.filter((entry) => entry.status === "failed");
    const latencies = completed
      .map((entry) => entry.latencyMs ?? 0)
      .filter((latency) => latency > 0)
      .sort((a, b) => a - b);

    return {
      requestsToday: requests.length,
      tokensToday: requests.reduce(
        (sum, entry) =>
          sum +
          (entry.totalTokens || (entry.inputTokens ?? 0) + (entry.outputTokens ?? 0)),
        0,
      ),
      costTodayUsd: Number(
        requests.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0).toFixed(8),
      ),
      errorRatePercent:
        requests.length === 0
          ? 0
          : Math.round((failed.length / requests.length) * 10000) / 100,
      p95LatencyMs:
        latencies.length === 0
          ? 0
          : latencies[Math.floor(latencies.length * 0.95)] ??
            latencies.at(-1) ??
            0,
    };
  }

  private toRequestDetail(row: {
    id: string;
    requestId: string;
    protocol: string;
    tenantId: string | null;
    projectId: string | null;
    apiKeyId: string | null;
    provider: string | null;
    providerKeyId: string | null;
    model: string;
    upstreamModel: string | null;
    status: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    reasoningTokens: number;
    estimatedTokens: boolean;
    costUsd: number | null;
    latencyMs: number | null;
    retryCount: number;
    error: string | null;
    createdAt: Date;
  }): RequestDetail {
    return {
      id: row.id,
      requestId: row.requestId,
      protocol: row.protocol,
      tenantId: row.tenantId ?? undefined,
      projectId: row.projectId ?? undefined,
      apiKeyId: row.apiKeyId ?? undefined,
      provider: row.provider ?? undefined,
      providerKeyId: row.providerKeyId ?? undefined,
      model: row.model,
      upstreamModel: row.upstreamModel ?? undefined,
      status: row.status,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      totalTokens: row.totalTokens,
      cacheReadTokens: row.cacheReadTokens || undefined,
      cacheCreationTokens: row.cacheCreationTokens || undefined,
      reasoningTokens: row.reasoningTokens || undefined,
      estimatedTokens: row.estimatedTokens || undefined,
      costUsd: row.costUsd ?? undefined,
      latencyMs: row.latencyMs ?? undefined,
      retryCount: row.retryCount,
      error: row.error ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async providerBreakdown(start: Date) {
    const providers = await this.prisma.provider.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        name: true,
        provider: true,
        keys: {
          select: {
            dailyBudgetUsd: true,
            tpmLimit: true,
            windowRequestCount: true,
          },
        },
      },
    });

    const sums = await this.prisma.requestLog.groupBy({
      by: ["provider"],
      where: {
        status: "completed",
        provider: { not: null },
        createdAt: { gte: start },
      },
      _sum: {
        totalTokens: true,
        costUsd: true,
      },
      _count: {
        _all: true,
      },
    });

    const statsByProvider = new Map(
      sums.map((row) => [
        row.provider ?? "",
        {
          requests: row._count._all,
          tokens: row._sum.totalTokens ?? 0,
          todayCostUsd: 0,
          totalCostUsd: Number((row._sum.costUsd ?? 0).toFixed(8)),
        },
      ]),
    );

    return providers.map((provider) => {
      const stats = statsByProvider.get(provider.provider) ?? {
        requests: 0,
        tokens: 0,
        totalCostUsd: 0,
        todayCostUsd: 0,
      };
      const windowRequests = provider.keys.reduce(
        (sum, key) => sum + (key.windowRequestCount ?? 0),
        0,
      );
      const tpm = provider.keys.reduce((sum, key) => sum + (key.tpmLimit ?? 0), 0);
      const todayBudget = provider.keys.reduce(
        (sum, key) => sum + (key.dailyBudgetUsd ?? 0),
        0,
      );

      return {
        name: provider.name || provider.provider,
        requests: Math.max(stats.requests, windowRequests),
        tokens: Math.max(stats.tokens, tpm),
        todayCostUsd: todayBudget,
        totalCostUsd: stats.totalCostUsd,
      };
    });
  }

  private async tenantProviderBreakdown(startTenantId: string, start: Date) {
    const rows = await this.prisma.requestLog.groupBy({
      by: ["provider"],
      where: {
        tenantId: startTenantId,
        status: "completed",
        provider: { not: null },
        createdAt: { gte: start },
      },
      _sum: {
        totalTokens: true,
        costUsd: true,
      },
      _count: {
        _all: true,
      },
    });

    return rows.map((row) => ({
      name: row.provider ?? "gateway",
      requests: row._count._all,
      tokens: row._sum.totalTokens ?? 0,
      todayCostUsd: Number((row._sum.costUsd ?? 0).toFixed(8)),
      totalCostUsd: Number((row._sum.costUsd ?? 0).toFixed(8)),
    }));
  }

  private formatInteger(value: number) {
    return new Intl.NumberFormat("en-US").format(Math.round(value || 0));
  }

  private formatCompact(value: number) {
    if (!value) return "0";
    const abs = Math.abs(value);
    if (abs >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}M`;
    }
    if (abs >= 1_000) {
      return `${(value / 1_000).toFixed(1)}K`;
    }
    return this.formatInteger(value);
  }

  private formatCurrency(value: number) {
    return `$${Number(value || 0).toFixed(4)}`;
  }

  private formatSeconds(value: number) {
    return `${(Number(value || 0) / 1000).toFixed(2)}s`;
  }

  private rangeStart(range?: string) {
    const now = new Date();
    if (range === "24h") {
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    if (range === "30d") {
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  private async trend(
    start: Date,
    granularity = "daily",
  ): Promise<DashboardTrendPoint[]> {
    const rows = await this.prisma.requestLog.findMany({
      where: { createdAt: { gte: start } },
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
        totalTokens: true,
        costUsd: true,
      },
    });

    const buckets = new Map<string, DashboardTrendPoint>();
    for (const row of rows) {
      const bucket = this.bucketLabel(row.createdAt, granularity);
      const existing = buckets.get(bucket) ?? {
        bucket,
        requests: 0,
        tokens: 0,
        costUsd: 0,
      };
      existing.requests += 1;
      existing.tokens += row.totalTokens ?? 0;
      existing.costUsd = Number(
        (existing.costUsd + (row.costUsd ?? 0)).toFixed(8),
      );
      buckets.set(bucket, existing);
    }

    return [...buckets.values()];
  }

  private async tenantTrend(
    tenantId: string,
    start: Date,
    granularity = "daily",
  ) {
    const rows = await this.prisma.requestLog.findMany({
      where: { tenantId, createdAt: { gte: start } },
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
        totalTokens: true,
        costUsd: true,
      },
    });

    const buckets = new Map<string, DashboardTrendPoint>();
    for (const row of rows) {
      const bucket = this.bucketLabel(row.createdAt, granularity);
      const existing = buckets.get(bucket) ?? {
        bucket,
        requests: 0,
        tokens: 0,
        costUsd: 0,
      };
      existing.requests += 1;
      existing.tokens += row.totalTokens ?? 0;
      existing.costUsd = Number(
        (existing.costUsd + (row.costUsd ?? 0)).toFixed(8),
      );
      buckets.set(bucket, existing);
    }

    return [...buckets.values()];
  }

  private bucketLabel(date: Date, granularity: string) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    if (granularity === "hourly") {
      const hour = `${date.getHours()}`.padStart(2, "0");
      return `${month}-${day} ${hour}:00`;
    }
    return `${year}-${month}-${day}`;
  }

  private async persist(entry: RequestLogEntry) {
    const normalizedUsage = normalizeProviderUsage({
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      totalTokens: entry.totalTokens,
      cacheReadTokens: entry.cacheReadTokens,
      cacheCreationTokens: entry.cacheCreationTokens,
      reasoningTokens: entry.reasoningTokens,
      estimatedTokens: entry.estimatedTokens,
    });

    if (entry.status === "started") {
      await this.prisma.requestLog.upsert({
        where: { requestId: entry.requestId },
        update: {},
        create: this.createData(entry, normalizedUsage),
      });
      return;
    }

    const usageUpdate = normalizedUsage
      ? {
          inputTokens: normalizedUsage.inputTokens,
          outputTokens: normalizedUsage.outputTokens,
          totalTokens: normalizedUsage.totalTokens,
          cacheReadTokens: normalizedUsage.cacheReadTokens ?? 0,
          cacheCreationTokens: normalizedUsage.cacheCreationTokens ?? 0,
          reasoningTokens: normalizedUsage.reasoningTokens ?? 0,
          estimatedTokens: normalizedUsage.estimatedTokens ?? false,
        }
      : {};

    await this.prisma.requestLog.upsert({
      where: { requestId: entry.requestId },
      update: {
        tenantId: entry.tenantId,
        provider: entry.provider,
        apiKeyId: entry.apiKeyId,
        providerKeyId: entry.providerKeyId,
        upstreamModel: entry.upstreamModel ?? entry.model,
        status: entry.status,
        latencyMs: entry.latencyMs,
        retryCount: entry.retryCount ?? 0,
        ...usageUpdate,
        costUsd: entry.costUsd,
        error: entry.error,
      },
      create: this.createData(entry, normalizedUsage),
    });
  }

  private createData(
    entry: RequestLogEntry,
    usage: ReturnType<typeof normalizeProviderUsage>,
  ) {
    return {
      requestId: entry.requestId,
      tenantId: entry.tenantId ?? "default",
      projectId: entry.projectId ?? "default",
      apiKeyId: entry.apiKeyId,
      protocol: entry.protocol,
      provider: entry.provider,
      providerKeyId: entry.providerKeyId,
      model: entry.model,
      upstreamModel: entry.upstreamModel ?? entry.model,
      status: entry.status,
      latencyMs: entry.latencyMs,
      retryCount: entry.retryCount ?? 0,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      totalTokens: usage?.totalTokens ?? 0,
      cacheReadTokens: usage?.cacheReadTokens ?? 0,
      cacheCreationTokens: usage?.cacheCreationTokens ?? 0,
      reasoningTokens: usage?.reasoningTokens ?? 0,
      estimatedTokens: usage?.estimatedTokens ?? false,
      costUsd: entry.costUsd,
      error: entry.error,
    };
  }
}
