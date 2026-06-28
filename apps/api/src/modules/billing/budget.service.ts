import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type {
  BudgetAction,
  BudgetRule,
  BudgetScope,
  BudgetUsageEntry,
} from "@gateway/shared";
import { PrismaService } from "../database/prisma.service";

export interface ApiKeyBudgetUsage {
  dailySpentUsd: number;
  monthlySpentUsd: number;
  dailyRemainingUsd?: number;
  monthlyRemainingUsd?: number;
}

export interface BudgetEnforcementResult {
  action: BudgetAction;
  exceeded: boolean;
  downgradeModelAlias?: string;
  warnings: string[];
  matchedBudgetIds: string[];
}

@Injectable()
export class BudgetService {
  constructor(private readonly prisma: PrismaService) {}

  async listBudgets(tenantId?: string): Promise<BudgetRule[]> {
    const rows = await this.prisma.budget.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: [{ scope: "asc" }, { createdAt: "desc" }],
    });

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      scope: row.scope as BudgetScope,
      scopeId: row.scopeId,
      dailyUsd: row.dailyUsd ?? undefined,
      monthlyUsd: row.monthlyUsd ?? undefined,
      action: row.action as BudgetAction,
      downgradeModelAlias: row.downgradeModelAlias ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async listTenantBudgets(tenantId: string) {
    return this.listBudgets(tenantId);
  }

  async saveBudget(body: {
    id?: string;
    tenantId: string;
    scope: BudgetScope;
    scopeId: string;
    dailyUsd?: number;
    monthlyUsd?: number;
    action?: BudgetAction;
    downgradeModelAlias?: string;
  }): Promise<BudgetRule> {
    const downgradeModelAlias = this.normalizeOptionalString(
      body.downgradeModelAlias,
    );
    await this.validateBudgetAction(body.action ?? "reject", downgradeModelAlias);

    const saved = body.id
      ? await this.prisma.budget.update({
          where: { id: body.id },
          data: {
            tenantId: body.tenantId,
            scope: body.scope,
            scopeId: body.scopeId,
            dailyUsd: body.dailyUsd,
            monthlyUsd: body.monthlyUsd,
            action: body.action ?? "reject",
            downgradeModelAlias:
              body.action === "downgrade" ? downgradeModelAlias : null,
          },
        })
      : await this.prisma.budget.create({
          data: {
            tenantId: body.tenantId,
            scope: body.scope,
            scopeId: body.scopeId,
            dailyUsd: body.dailyUsd,
            monthlyUsd: body.monthlyUsd,
            action: body.action ?? "reject",
            downgradeModelAlias:
              body.action === "downgrade" ? downgradeModelAlias : null,
          },
        });

    return {
      id: saved.id,
      tenantId: saved.tenantId,
      scope: saved.scope as BudgetScope,
      scopeId: saved.scopeId,
      dailyUsd: saved.dailyUsd ?? undefined,
      monthlyUsd: saved.monthlyUsd ?? undefined,
      action: saved.action as BudgetAction,
      downgradeModelAlias: saved.downgradeModelAlias ?? undefined,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async saveTenantBudget(
    tenantId: string,
    body: {
      id?: string;
      scope: BudgetScope;
      scopeId: string;
      dailyUsd?: number;
      monthlyUsd?: number;
      action?: BudgetAction;
      downgradeModelAlias?: string;
    },
  ) {
    if (body.id) {
      await this.assertTenantBudget(body.id, tenantId);
    }
    return this.saveBudget({
      ...body,
      tenantId,
    });
  }

  async deleteBudget(id: string) {
    await this.prisma.budget.delete({ where: { id } });
    return { ok: true };
  }

  async deleteTenantBudget(id: string, tenantId: string) {
    await this.assertTenantBudget(id, tenantId);
    return this.deleteBudget(id);
  }

  async budgetUsageEntries(tenantId?: string): Promise<BudgetUsageEntry[]> {
    const budgets = await this.prisma.budget.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: [{ scope: "asc" }, { createdAt: "desc" }],
    });

    return Promise.all(
      budgets.map(async (budget) => {
        const usage = await this.scopeUsage(
          budget.scope as BudgetScope,
          budget.scopeId,
          budget.tenantId,
        );

        const dailyRemaining =
          budget.dailyUsd == null
            ? undefined
            : Number((budget.dailyUsd - usage.dailySpentUsd).toFixed(8));
        const monthlyRemaining =
          budget.monthlyUsd == null
            ? undefined
            : Number((budget.monthlyUsd - usage.monthlySpentUsd).toFixed(8));
        const exceeded =
          (budget.dailyUsd != null && usage.dailySpentUsd >= budget.dailyUsd) ||
          (budget.monthlyUsd != null &&
            usage.monthlySpentUsd >= budget.monthlyUsd);

        return {
          scope: budget.scope as BudgetScope,
          scopeId: budget.scopeId,
          dailySpentUsd: usage.dailySpentUsd,
          monthlySpentUsd: usage.monthlySpentUsd,
          dailyBudgetUsd: budget.dailyUsd ?? undefined,
          monthlyBudgetUsd: budget.monthlyUsd ?? undefined,
          dailyRemainingUsd: dailyRemaining,
          monthlyRemainingUsd: monthlyRemaining,
          action: budget.action as BudgetAction,
          downgradeModelAlias: budget.downgradeModelAlias ?? undefined,
          exceeded,
        };
      }),
    );
  }

  async tenantBudgetUsageEntries(tenantId: string) {
    return this.budgetUsageEntries(tenantId);
  }

  async usageForApiKey(apiKeyId: string): Promise<ApiKeyBudgetUsage> {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { id: apiKeyId },
      select: { dailyBudgetUsd: true, monthlyBudgetUsd: true },
    });

    const [dailySpentUsd, monthlySpentUsd] = await Promise.all([
      this.spendSince(apiKeyId, this.startOfToday()),
      this.spendSince(apiKeyId, this.startOfMonth()),
    ]);

    return {
      dailySpentUsd,
      monthlySpentUsd,
      dailyRemainingUsd:
        apiKey?.dailyBudgetUsd == null
          ? undefined
          : Number((apiKey.dailyBudgetUsd - dailySpentUsd).toFixed(8)),
      monthlyRemainingUsd:
        apiKey?.monthlyBudgetUsd == null
          ? undefined
          : Number((apiKey.monthlyBudgetUsd - monthlySpentUsd).toFixed(8)),
    };
  }

  async enforceApiKeyBudget(apiKeyId: string) {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { id: apiKeyId },
      select: {
        dailyBudgetUsd: true,
        monthlyBudgetUsd: true,
      },
    });

    if (!apiKey) {
      return;
    }

    const usage = await this.usageForApiKey(apiKeyId);

    if (
      apiKey.dailyBudgetUsd != null &&
      usage.dailySpentUsd >= apiKey.dailyBudgetUsd
    ) {
      throw new ForbiddenException("API key daily budget exceeded");
    }

    if (
      apiKey.monthlyBudgetUsd != null &&
      usage.monthlySpentUsd >= apiKey.monthlyBudgetUsd
    ) {
      throw new ForbiddenException("API key monthly budget exceeded");
    }
  }

  async enforceUsageBudgets(input: {
    tenantId: string;
    projectId?: string;
    apiKeyId: string;
    modelAlias: string;
    providerId: string;
  }): Promise<BudgetEnforcementResult> {
    return this.evaluateBudgets({
      tenantId: input.tenantId,
      projectId: input.projectId,
      apiKeyId: input.apiKeyId,
      modelAlias: input.modelAlias,
      providerId: input.providerId,
    });
  }

  async previewUsageBudgetAction(input: {
    tenantId: string;
    projectId?: string;
    apiKeyId: string;
    modelAlias: string;
  }): Promise<BudgetEnforcementResult> {
    return this.evaluateBudgets({
      tenantId: input.tenantId,
      projectId: input.projectId,
      apiKeyId: input.apiKeyId,
      modelAlias: input.modelAlias,
    });
  }

  private async evaluateBudgets(input: {
    tenantId: string;
    projectId?: string;
    apiKeyId: string;
    modelAlias: string;
    providerId?: string;
  }): Promise<BudgetEnforcementResult> {
    const budgets = await this.prisma.budget.findMany({
      where: {
        OR: [
          { scope: "apiKey", scopeId: input.apiKeyId },
          input.projectId
            ? { scope: "project", scopeId: input.projectId }
            : undefined,
          { scope: "tenant", scopeId: input.tenantId },
          input.providerId
            ? { scope: "provider", scopeId: input.providerId }
            : undefined,
          { scope: "modelAlias", scopeId: input.modelAlias },
        ].filter(Boolean) as Array<{ scope: string; scopeId: string }>,
      },
    });

    const warnings: string[] = [];
    const matchedBudgetIds: string[] = [];
    let downgradeModelAlias: string | undefined;

    const scopePriority: Record<BudgetScope, number> = {
      apiKey: 1,
      project: 2,
      tenant: 3,
      provider: 4,
      modelAlias: 5,
    };

    const sortedBudgets = [...budgets].sort((left, right) => {
      const leftScope = scopePriority[left.scope as BudgetScope] ?? 99;
      const rightScope = scopePriority[right.scope as BudgetScope] ?? 99;
      if (leftScope !== rightScope) {
        return leftScope - rightScope;
      }
      return right.createdAt.getTime() - left.createdAt.getTime();
    });

    for (const budget of sortedBudgets) {
      const usage = await this.scopeUsage(
        budget.scope as BudgetScope,
        budget.scopeId,
        budget.tenantId,
      );
      const dailyExceeded =
        budget.dailyUsd != null && usage.dailySpentUsd >= budget.dailyUsd;
      const monthlyExceeded =
        budget.monthlyUsd != null && usage.monthlySpentUsd >= budget.monthlyUsd;
      const exceeded = dailyExceeded || monthlyExceeded;
      if (!exceeded) {
        continue;
      }

      matchedBudgetIds.push(budget.id);
      const exceededPeriod = dailyExceeded ? "daily" : "monthly";
      const message = `${budget.scope} ${exceededPeriod} budget exceeded: ${budget.scopeId}`;

      if (budget.action === "warn") {
        warnings.push(message);
        continue;
      }

      if (budget.action === "downgrade") {
        if (!downgradeModelAlias && budget.downgradeModelAlias) {
          downgradeModelAlias = budget.downgradeModelAlias;
        }
        warnings.push(
          `${message}; downgrade to ${budget.downgradeModelAlias ?? "fallback route"}`,
        );
        continue;
      }

      if (
        budget.dailyUsd != null &&
        usage.dailySpentUsd >= budget.dailyUsd
      ) {
        throw new ForbiddenException(
          `${budget.scope} daily budget exceeded: ${budget.scopeId}`,
        );
      }
      if (
        budget.monthlyUsd != null &&
        usage.monthlySpentUsd >= budget.monthlyUsd
      ) {
        throw new ForbiddenException(
          `${budget.scope} monthly budget exceeded: ${budget.scopeId}`,
        );
      }
    }

    return {
      action: downgradeModelAlias ? "downgrade" : warnings.length > 0 ? "warn" : "warn",
      exceeded: matchedBudgetIds.length > 0,
      downgradeModelAlias,
      warnings,
      matchedBudgetIds,
    };
  }

  private async spendSince(apiKeyId: string, since: Date) {
    const result = await this.prisma.requestLog.aggregate({
      where: {
        apiKeyId,
        status: "completed",
        createdAt: { gte: since },
      },
      _sum: { costUsd: true },
    });

    return Number((result._sum.costUsd ?? 0).toFixed(8));
  }

  private async scopeUsage(
    scope: BudgetScope,
    scopeId: string,
    tenantId: string,
  ) {
    const dailyWhere = this.scopeWhere(scope, scopeId, tenantId, this.startOfToday());
    const monthlyWhere = this.scopeWhere(
      scope,
      scopeId,
      tenantId,
      this.startOfMonth(),
    );

    const [daily, monthly] = await Promise.all([
      this.prisma.requestLog.aggregate({
        where: dailyWhere,
        _sum: { costUsd: true },
      }),
      this.prisma.requestLog.aggregate({
        where: monthlyWhere,
        _sum: { costUsd: true },
      }),
    ]);

    return {
      dailySpentUsd: Number((daily._sum.costUsd ?? 0).toFixed(8)),
      monthlySpentUsd: Number((monthly._sum.costUsd ?? 0).toFixed(8)),
    };
  }

  private scopeWhere(
    scope: BudgetScope,
    scopeId: string,
    tenantId: string,
    since: Date,
  ) {
    if (scope === "apiKey") {
      return {
        apiKeyId: scopeId,
        status: "completed",
        createdAt: { gte: since },
      };
    }
    if (scope === "project") {
      return {
        projectId: scopeId,
        status: "completed",
        createdAt: { gte: since },
      };
    }
    if (scope === "tenant") {
      return {
        tenantId: scopeId || tenantId,
        status: "completed",
        createdAt: { gte: since },
      };
    }
    if (scope === "provider") {
      const provider = scopeId.includes("provider_") ? undefined : scopeId;
      return {
        provider,
        status: "completed",
        createdAt: { gte: since },
      };
    }
    return {
      model: scopeId,
      status: "completed",
      createdAt: { gte: since },
    };
  }

  private startOfToday() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private startOfMonth() {
    const date = new Date();
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private async assertTenantBudget(id: string, tenantId: string) {
    const budget = await this.prisma.budget.findUnique({
      where: { id },
      select: { tenantId: true },
    });
    if (!budget || budget.tenantId !== tenantId) {
      throw new ForbiddenException("Budget not found");
    }
  }

  private normalizeOptionalString(value: string | undefined) {
    if (!value || value.trim().length === 0) {
      return undefined;
    }
    return value.trim();
  }

  private async validateBudgetAction(
    action: BudgetAction,
    downgradeModelAlias?: string,
  ) {
    if (action !== "downgrade") {
      return;
    }

    if (!downgradeModelAlias) {
      throw new BadRequestException(
        "Downgrade strategy requires a fallback model alias",
      );
    }

    const alias = await this.prisma.modelAlias.findUnique({
      where: { alias: downgradeModelAlias },
      select: { id: true },
    });
    if (!alias) {
      throw new BadRequestException("Fallback model alias not found");
    }
  }
}
