import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { PortalProfile } from "@gateway/shared";
import { ApiKeyService } from "./api-key.service";
import { TenantAuthGuard } from "./tenant-auth.guard";
import { TenantAuthService } from "./tenant-auth.service";
import { RequestLogService } from "../observability/request-log.service";
import { AlertService } from "../billing/alert.service";
import { BudgetService } from "../billing/budget.service";
import { CreditService } from "../billing/credit.service";
import { PlatformConfigService } from "../billing/platform-config.service";
import { ModelRouterService } from "../model-router/model-router.service";
import { PrismaService } from "../database/prisma.service";
import { AuthConfigService } from "./auth-config.service";
import { PricingService } from "../billing/pricing.service";

@Controller("console")
@UseGuards(TenantAuthGuard)
export class TenantConsoleController {
  constructor(
    private readonly auth: TenantAuthService,
    private readonly apiKeys: ApiKeyService,
    private readonly logs: RequestLogService,
    private readonly alerts: AlertService,
    private readonly budgets: BudgetService,
    private readonly credits: CreditService,
    private readonly platformConfig: PlatformConfigService,
    private readonly models: ModelRouterService,
    private readonly pricing: PricingService,
    private readonly prisma: PrismaService,
    private readonly authConfig: AuthConfigService,
  ) {}

  @Get("profile")
  async profile(
    @Headers() headers: Record<string, unknown>,
  ): Promise<PortalProfile> {
    const payload = this.auth.verify(this.auth.extractAuthorization(headers));
    const user = await this.auth.currentPortalUser(payload);
    const [projects, apiKeyCount, today, month, total, usage, budgetUsage, alerts] =
      await Promise.all([
        this.prisma.project.count({ where: { tenantId: user.tenantId } }),
        this.prisma.apiKey.count({ where: { tenantId: user.tenantId } }),
        this.prisma.requestLog.count({
          where: {
            tenantId: user.tenantId,
            createdAt: { gte: this.startOfToday() },
          },
        }),
        this.prisma.requestLog.count({
          where: {
            tenantId: user.tenantId,
            createdAt: { gte: this.startOfMonth() },
          },
        }),
        this.prisma.requestLog.count({
          where: { tenantId: user.tenantId },
        }),
        this.logs.tenantOverview(user.tenantId),
        this.budgets.tenantBudgetUsageEntries(user.tenantId),
        this.alerts.listTenantAlerts(user.tenantId),
      ]);

    const monthAggregate = await this.prisma.requestLog.aggregate({
      where: {
        tenantId: user.tenantId,
        status: "completed",
        createdAt: { gte: this.startOfMonth() },
      },
      _sum: { costUsd: true },
    });
    const totalAggregate = await this.prisma.requestLog.aggregate({
      where: {
        tenantId: user.tenantId,
        status: "completed",
      },
      _sum: { costUsd: true },
    });

    return {
      user,
      projectCount: projects,
      apiKeyCount,
      recentUsage: {
        requestsToday: today,
        requestsThisMonth: month,
        totalRequests: total,
        costTodayUsd: usage.costTodayUsd,
        costThisMonthUsd: Number((monthAggregate._sum.costUsd ?? 0).toFixed(8)),
        totalCostUsd: Number((totalAggregate._sum.costUsd ?? 0).toFixed(8)),
        errorRatePercent: usage.errorRatePercent,
        p95LatencyMs: usage.p95LatencyMs,
      },
      budgetStatus: {
        totalRules: budgetUsage.length,
        exceededRules: budgetUsage.filter((item) => item.exceeded).length,
        warningAlerts: alerts.filter((item) => item.level === "warning").length,
        criticalAlerts: alerts.filter((item) => item.level === "critical").length,
      },
      onboarding: {
        needsApiKey: apiKeyCount === 0,
        needsFirstRequest: total === 0,
        recommendedBaseUrl: `${this.authConfig.apiBaseUrl()}/v1`,
        recommendedProtocol: "openai",
      },
    };
  }

  @Get("overview")
  async overview(
    @Headers() headers: Record<string, unknown>,
    @Query("range") range?: string,
    @Query("granularity") granularity?: string,
  ) {
    const user = this.auth.verify(this.auth.extractAuthorization(headers));
    return {
      usage: await this.logs.tenantOverview(user.tenantId, { range, granularity }),
      dashboard: await this.logs.tenantDashboardOverview(user.tenantId, {
        range,
        granularity,
      }),
      recentRequests: await this.logs.tenantRecentFromDb(user.tenantId, 20, {
        range,
      }),
      alerts: await this.alerts.listTenantAlerts(user.tenantId),
      aliases: await this.models.listAliases(),
      models: await this.models.listModels(),
      providers: [],
    };
  }

  @Get("api-keys")
  apiKeysList(
    @Headers() headers: Record<string, unknown>,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const user = this.auth.verify(this.auth.extractAuthorization(headers));
    return this.apiKeys.listTenantPage(user.tenantId, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      userId: user.sub,
    });
  }

  @Get("billing-groups")
  async billingGroupsList(@Headers() headers: Record<string, unknown>) {
    this.auth.verify(this.auth.extractAuthorization(headers));
    return this.pricing.listPlatformGroups();
  }

  @Post("api-keys")
  createApiKey(
    @Headers() headers: Record<string, unknown>,
    @Body() body: Record<string, unknown>,
  ) {
    const payload = this.auth.verify(this.auth.extractAuthorization(headers));
    return this.auth.requireVerifiedPortalUser(payload).then((user) =>
      this.apiKeys.createForTenant({
        tenantId: user.tenantId,
        userId: user.id,
        billingGroupId: this.requiredString(body.billingGroupId, "billingGroupId"),
        allowPlatformBillingGroup: true,
        name: this.requiredString(body.name, "name"),
        customKey:
          typeof body.customKey === "string" ? body.customKey : undefined,
        ipAllowlist:
          typeof body.ipAllowlist === "string" ? body.ipAllowlist : undefined,
        rateLimitRpm:
          typeof body.rateLimitRpm === "number" ? body.rateLimitRpm : undefined,
        rateLimitTpm:
          typeof body.rateLimitTpm === "number" ? body.rateLimitTpm : undefined,
        expiresAt:
          typeof body.expiresAt === "string" ? body.expiresAt : undefined,
        dailyBudgetUsd:
          typeof body.dailyBudgetUsd === "number"
            ? body.dailyBudgetUsd
            : undefined,
        monthlyBudgetUsd:
          typeof body.monthlyBudgetUsd === "number"
            ? body.monthlyBudgetUsd
            : undefined,
      }),
    );
  }

  @Get("credits")
  creditsSummary(@Headers() headers: Record<string, unknown>) {
    const user = this.auth.verify(this.auth.extractAuthorization(headers));
    return this.credits.summary(user.sub, user.tenantId);
  }

  @Get("credits/ledger")
  creditsLedger(
    @Headers() headers: Record<string, unknown>,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const user = this.auth.verify(this.auth.extractAuthorization(headers));
    return this.credits.ledger({
      userId: user.sub,
      tenantId: user.tenantId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get("check-in/status")
  checkInStatus(@Headers() headers: Record<string, unknown>) {
    const user = this.auth.verify(this.auth.extractAuthorization(headers));
    return this.credits.checkInStatus(user.sub, user.tenantId);
  }

  @Post("check-in")
  checkIn(@Headers() headers: Record<string, unknown>) {
    const user = this.auth.verify(this.auth.extractAuthorization(headers));
    return this.credits.checkIn(user.sub, user.tenantId);
  }

  @Patch("api-keys/:id")
  updateApiKey(
    @Headers() headers: Record<string, unknown>,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const payload = this.auth.verify(this.auth.extractAuthorization(headers));
    return this.auth.requireVerifiedPortalUser(payload).then((user) =>
      this.apiKeys.updateTenantKey(id, user.tenantId, body, user.id, {
        allowPlatformBillingGroup: true,
      }),
    );
  }

  @Delete("api-keys/:id")
  deleteApiKey(
    @Headers() headers: Record<string, unknown>,
    @Param("id") id: string,
  ) {
    const payload = this.auth.verify(this.auth.extractAuthorization(headers));
    return this.auth.requireVerifiedPortalUser(payload).then((user) =>
      this.apiKeys.deleteTenantKey(id, user.tenantId, user.id),
    );
  }

  @Get("budgets")
  budgetsList(@Headers() headers: Record<string, unknown>) {
    const user = this.auth.verify(this.auth.extractAuthorization(headers));
    return this.budgets.listTenantBudgets(user.tenantId);
  }

  @Get("budgets/usage")
  budgetsUsage(@Headers() headers: Record<string, unknown>) {
    const user = this.auth.verify(this.auth.extractAuthorization(headers));
    return this.budgets.tenantBudgetUsageEntries(user.tenantId);
  }

  @Post("budgets")
  saveBudget(
    @Headers() headers: Record<string, unknown>,
    @Body() body: Record<string, unknown>,
  ) {
    const payload = this.auth.verify(this.auth.extractAuthorization(headers));
    return this.auth.requireVerifiedPortalUser(payload).then((user) =>
      this.budgets.saveTenantBudget(user.tenantId, {
        id: typeof body.id === "string" ? body.id : undefined,
        scope:
          body.scope === "apiKey" ||
          body.scope === "project" ||
          body.scope === "tenant" ||
          body.scope === "provider" ||
          body.scope === "modelAlias"
            ? body.scope
            : "tenant",
        scopeId:
          typeof body.scopeId === "string" && body.scopeId.length > 0
            ? body.scopeId
            : user.tenantId,
        dailyUsd:
          typeof body.dailyUsd === "number" ? body.dailyUsd : undefined,
        monthlyUsd:
          typeof body.monthlyUsd === "number" ? body.monthlyUsd : undefined,
        action:
          body.action === "warn" ||
          body.action === "downgrade"
            ? body.action
            : "reject",
        downgradeModelAlias:
          typeof body.downgradeModelAlias === "string"
            ? body.downgradeModelAlias
            : undefined,
      }),
    );
  }

  @Delete("budgets/:id")
  deleteBudget(
    @Headers() headers: Record<string, unknown>,
    @Param("id") id: string,
  ) {
    const payload = this.auth.verify(this.auth.extractAuthorization(headers));
    return this.auth.requireVerifiedPortalUser(payload).then((user) =>
      this.budgets.deleteTenantBudget(id, user.tenantId),
    );
  }

  @Get("alerts")
  alertsList(@Headers() headers: Record<string, unknown>) {
    const user = this.auth.verify(this.auth.extractAuthorization(headers));
    return this.alerts.listTenantAlerts(user.tenantId);
  }

  @Get("requests")
  requests(
    @Headers() headers: Record<string, unknown>,
    @Query("status") status?: string,
    @Query("provider") provider?: string,
    @Query("model") model?: string,
    @Query("limit") limit?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const user = this.auth.verify(this.auth.extractAuthorization(headers));
    return this.logs.listTenantRequests(user.tenantId, {
      status,
      provider,
      model,
      limit: limit ? Number(limit) : undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get("requests/:requestId")
  async requestDetail(
    @Headers() headers: Record<string, unknown>,
    @Param("requestId") requestId: string,
  ) {
    const user = this.auth.verify(this.auth.extractAuthorization(headers));
    return this.logs.tenantRequestDetail(user.tenantId, requestId);
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

  private requiredString(value: unknown, field: string) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new BadRequestException(`Missing required field: ${field}`);
    }
    return value.trim();
  }

  private parseAllowedModels(value?: string | null) {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  }
}
