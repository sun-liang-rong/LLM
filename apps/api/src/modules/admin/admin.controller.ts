import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiKeyService } from "../auth/api-key.service";
import { AlertService } from "../billing/alert.service";
import { BudgetService } from "../billing/budget.service";
import { CreditService } from "../billing/credit.service";
import { PricingService } from "../billing/pricing.service";
import { PlatformConfigService } from "../billing/platform-config.service";
import { KeyPoolService } from "../key-pool/key-pool.service";
import { ModelRouterService } from "../model-router/model-router.service";
import { RequestLogService } from "../observability/request-log.service";
import { ProviderRegistry } from "../providers/provider-registry.service";
import { ProviderUpstreamError } from "../providers/providers/provider-adapter";
import { AdminProviderService } from "./admin-provider.service";
import { AdminAuthGuard } from "./admin-auth.guard";
import { AdminRoles } from "./admin-roles.decorator";
import { AdminTenantService } from "./admin-tenant.service";

@Controller("admin")
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(
    private readonly keys: KeyPoolService,
    private readonly models: ModelRouterService,
    private readonly logs: RequestLogService,
    private readonly providers: AdminProviderService,
    private readonly providerRegistry: ProviderRegistry,
    private readonly apiKeys: ApiKeyService,
    private readonly budgets: BudgetService,
    private readonly credits: CreditService,
    private readonly pricing: PricingService,
    private readonly platformConfig: PlatformConfigService,
    private readonly alerts: AlertService,
    private readonly tenants: AdminTenantService,
  ) {}

  @Get("overview")
  async overview(
    @Query("range") range?: string,
    @Query("granularity") granularity?: string,
  ) {
    return {
      usage: await this.logs.overview({ range, granularity }),
      dashboard: await this.logs.dashboardOverview({ range, granularity }),
      providers: await this.keys.list(),
      models: await this.models.listModels(),
      aliases: await this.models.listAliases(),
      recentRequests: await this.logs.recentFromDb(20, { range }),
      alerts: await this.alerts.listCurrentAlerts("default"),
    };
  }

  @Get("budgets")
  budgetsList(@Query("tenantId") tenantId?: string) {
    return this.budgets.listBudgets(tenantId);
  }

  @Get("budgets/usage")
  budgetsUsage(@Query("tenantId") tenantId?: string) {
    return this.budgets.budgetUsageEntries(tenantId);
  }

  @Post("budgets")
  @AdminRoles("admin")
  upsertBudget(@Body() body: Record<string, unknown>) {
    return this.budgets.saveBudget({
      id: typeof body.id === "string" ? body.id : undefined,
      tenantId: typeof body.tenantId === "string" ? body.tenantId : "default",
      scope:
        body.scope === "apiKey" ||
        body.scope === "project" ||
        body.scope === "tenant" ||
        body.scope === "provider" ||
        body.scope === "modelAlias"
          ? body.scope
          : "tenant",
      scopeId: typeof body.scopeId === "string" ? body.scopeId : "default",
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
    });
  }

  @Delete("budgets/:id")
  @AdminRoles("admin")
  deleteBudget(@Param("id") id: string) {
    return this.budgets.deleteBudget(id);
  }

  @Get("alerts")
  alertsList(@Query("tenantId") tenantId?: string) {
    return this.alerts.listCurrentAlerts(tenantId);
  }

  @Get("credits/users")
  creditsUsers(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("email") email?: string,
  ) {
    return this.credits.adminUsers({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      email,
    });
  }

  @Get("settings")
  settings() {
    return this.platformConfig.settings();
  }

  @Post("settings")
  @AdminRoles("admin")
  saveSettings(@Body() body: Record<string, unknown>) {
    return this.platformConfig.saveSettings(body);
  }

  @Get("announcements")
  announcements() {
    return this.platformConfig.listAnnouncements();
  }

  @Post("announcements")
  @AdminRoles("operator")
  saveAnnouncement(@Body() body: Record<string, unknown>) {
    return this.platformConfig.saveAnnouncement(body);
  }

  @Delete("announcements/:id")
  @AdminRoles("admin")
  deleteAnnouncement(@Param("id") id: string) {
    return this.platformConfig.deleteAnnouncement(id);
  }

  @Get("model-groups")
  modelGroups() {
    return this.platformConfig.listModelGroups();
  }

  @Post("model-groups")
  @AdminRoles("operator")
  saveModelGroup(@Body() body: Record<string, unknown>) {
    return this.platformConfig.saveModelGroup(body);
  }

  @Delete("model-groups/:id")
  @AdminRoles("admin")
  deleteModelGroup(@Param("id") id: string) {
    return this.platformConfig.deleteModelGroup(id);
  }

  @Get("credits/ledger")
  creditsLedger(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("userId") userId?: string,
  ) {
    return this.credits.ledger({
      userId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post("credits/adjust")
  @AdminRoles("admin")
  adjustCredits(@Body() body: Record<string, unknown>) {
    return this.credits.adjust({
      userId: typeof body.userId === "string" ? body.userId : "",
      amountUsd:
        typeof body.amountUsd === "number"
          ? body.amountUsd
          : Number(body.amountUsd),
      description:
        typeof body.description === "string" ? body.description : undefined,
    });
  }

  @Post("credits/users/:userId/reset-check-in")
  @AdminRoles("admin")
  resetUserCheckIn(@Param("userId") userId: string) {
    return this.credits.resetTodayCheckIn(userId);
  }

  @Get("model-prices")
  modelPricesList() {
    return this.pricing.listModelPrices();
  }

  @Get("billing-groups")
  billingGroupsList() {
    return this.pricing.listGroups("default");
  }

  @Post("billing-groups")
  @AdminRoles("operator")
  saveBillingGroup(@Body() body: Record<string, unknown>) {
    const allowedModels = Array.isArray(body.allowedModels)
      ? body.allowedModels.filter(
          (item): item is string => typeof item === "string",
        )
      : [];
    return this.pricing.saveGroup({
      id: typeof body.id === "string" ? body.id : undefined,
      tenantId: "default",
      name: typeof body.name === "string" ? body.name : "",
      multiplier:
        typeof body.multiplier === "number"
          ? body.multiplier
          : Number(body.multiplier ?? 1),
      allowedModels,
      description:
        typeof body.description === "string" ? body.description : undefined,
      isDefault: typeof body.isDefault === "boolean" ? body.isDefault : false,
    });
  }

  @Delete("billing-groups/:id")
  @AdminRoles("admin")
  deleteBillingGroup(@Param("id") id: string) {
    return this.pricing.deleteGroup(id);
  }

  @Post("model-prices")
  @AdminRoles("operator")
  upsertModelPrice(@Body() body: Record<string, unknown>) {
    return this.pricing.saveModelPrice({
      id: typeof body.id === "string" ? body.id : undefined,
      providerId: typeof body.providerId === "string" ? body.providerId : "",
      modelGroupId:
        typeof body.modelGroupId === "string" ? body.modelGroupId : undefined,
      publicId: typeof body.publicId === "string" ? body.publicId : "",
      upstreamModel:
        typeof body.upstreamModel === "string" ? body.upstreamModel : "",
      displayName: typeof body.displayName === "string" ? body.displayName : "",
      description:
        typeof body.description === "string" ? body.description : undefined,
      contextWindow:
        typeof body.contextWindow === "number"
          ? body.contextWindow
          : Number(body.contextWindow) || undefined,
      priceMultiplier:
        typeof body.priceMultiplier === "number"
          ? body.priceMultiplier
          : Number(body.priceMultiplier ?? 1),
      inputUsdPerMillionTokens:
        typeof body.inputUsdPerMillionTokens === "number"
          ? body.inputUsdPerMillionTokens
          : Number(body.inputUsdPerMillionTokens ?? 0),
      outputUsdPerMillionTokens:
        typeof body.outputUsdPerMillionTokens === "number"
          ? body.outputUsdPerMillionTokens
          : Number(body.outputUsdPerMillionTokens ?? 0),
      supportsTools:
        typeof body.supportsTools === "boolean" ? body.supportsTools : false,
      supportsVision:
        typeof body.supportsVision === "boolean" ? body.supportsVision : false,
      supportsStreaming:
        typeof body.supportsStreaming === "boolean"
          ? body.supportsStreaming
          : true,
      enabled: typeof body.enabled === "boolean" ? body.enabled : true,
    });
  }

  @Delete("model-prices/:id")
  @AdminRoles("admin")
  deleteModelPrice(@Param("id") id: string) {
    return this.pricing.deleteModelPrice(id);
  }

  @Get("tenants")
  tenantsList() {
    return this.tenants.listTenants();
  }

  @Post("tenants")
  @AdminRoles("owner")
  upsertTenant(@Body() body: Record<string, unknown>) {
    return this.tenants.saveTenant({
      id: typeof body.id === "string" ? body.id : undefined,
      name: typeof body.name === "string" ? body.name : "",
    });
  }

  @Get("projects")
  projectsList(@Query("tenantId") tenantId?: string) {
    return this.tenants.listProjects(tenantId);
  }

  @Post("projects")
  @AdminRoles("admin")
  upsertProject(@Body() body: Record<string, unknown>) {
    return this.tenants.saveProject({
      id: typeof body.id === "string" ? body.id : undefined,
      tenantId: typeof body.tenantId === "string" ? body.tenantId : "default",
      name: typeof body.name === "string" ? body.name : "",
    });
  }

  @Get("users")
  usersList(@Query("tenantId") tenantId?: string) {
    return this.tenants.listUsers(tenantId);
  }

  @Post("users")
  @AdminRoles("owner")
  upsertUser(@Body() body: Record<string, unknown>) {
    return this.tenants.saveUser({
      id: typeof body.id === "string" ? body.id : undefined,
      tenantId: typeof body.tenantId === "string" ? body.tenantId : "default",
      email: typeof body.email === "string" ? body.email : "",
      name: typeof body.name === "string" ? body.name : undefined,
      role:
        body.role === "owner" ||
        body.role === "admin" ||
        body.role === "operator" ||
        body.role === "viewer"
          ? body.role
          : "viewer",
      disabled: typeof body.disabled === "boolean" ? body.disabled : undefined,
    });
  }

  @Patch("users/:id/disabled")
  @AdminRoles("admin")
  setUserDisabled(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.tenants.setUserDisabled(id, body.disabled === true);
  }

  @Get("requests")
  requests(
    @Query("status") status?: string,
    @Query("provider") provider?: string,
    @Query("model") model?: string,
    @Query("limit") limit?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.logs.listRequests({
      status,
      provider,
      model,
      limit: limit ? Number(limit) : undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get("providers")
  providersList(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("all") all?: string,
  ) {
    if (all === "true") {
      return this.providers.listProviders();
    }
    return this.providers.listProvidersPage({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get("model-aliases")
  modelAliasesList(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.models.listAliasesPage({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post("model-aliases")
  @AdminRoles("operator")
  upsertModelAlias(@Body() body: Record<string, unknown>) {
    return this.models.upsertAlias(body);
  }

  @Get("model-aliases/:model/explain")
  explainModelAlias(@Param("model") model: string) {
    return this.models.explain(model);
  }

  @Post("model-aliases/:model/test")
  @AdminRoles("operator")
  async testModelAlias(@Param("model") model: string) {
    const started = Date.now();
    const decision = await this.models.decide(model);
    const explain = await this.models.explain(model);
    const keys = await this.keys.candidates(decision.providerId);

    if (keys.length === 0) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        route: explain,
        error: `No available provider key for ${decision.providerSlug}`,
      };
    }

    const key = keys[0];
    const provider = this.providerRegistry.get(decision.upstreamProtocol);
    const requestStarted = Date.now();
    const requestId = `route-test-${Date.now()}`;

    try {
      await this.keys.reportAttempt(key.id);
      const result = await provider.complete(
        {
          requestId,
          sourceProtocol:
            decision.upstreamProtocol === "anthropic" ? "anthropic" : "openai",
          model,
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: "ping" }],
            },
          ],
          stream: false,
          maxTokens: 8,
          rawBody: {},
        },
        {
          requestId,
          provider: decision.provider,
          providerId: decision.providerId,
          providerSlug: decision.providerSlug,
          upstreamProtocol: decision.upstreamProtocol,
          upstreamModel: decision.upstreamModel,
          baseUrl: decision.baseUrl,
          apiKey: key.value,
        },
      );
      await this.keys.reportSuccess(key.id);
      return {
        ok: true,
        latencyMs: Date.now() - requestStarted,
        route: explain,
        providerKey: {
          id: key.id,
          name: key.name,
        },
        statusCode: result.statusCode,
        usage: result.usage,
      };
    } catch (error) {
      if (error instanceof ProviderUpstreamError) {
        await this.keys.reportFailure(key.id, error.kind, error.message);
      }
      return {
        ok: false,
        latencyMs: Date.now() - requestStarted,
        route: explain,
        providerKey: {
          id: key.id,
          name: key.name,
        },
        statusCode:
          error instanceof ProviderUpstreamError ? error.statusCode : undefined,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Delete("model-aliases/:alias")
  @AdminRoles("admin")
  deleteModelAlias(@Param("alias") alias: string) {
    return this.models.deleteAlias(alias);
  }

  @Post("providers")
  @AdminRoles("admin")
  upsertProvider(@Body() body: Record<string, unknown>) {
    return this.providers.upsertProvider(body);
  }

  @Delete("providers/:id")
  @AdminRoles("admin")
  deleteProvider(@Param("id") id: string) {
    return this.providers.deleteProvider(id);
  }

  @Post("provider-keys")
  @AdminRoles("operator")
  createProviderKey(@Body() body: Record<string, unknown>) {
    return this.providers.createProviderKey(body);
  }

  @Patch("provider-keys/:id")
  @AdminRoles("operator")
  updateProviderKey(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.providers.updateProviderKey(id, body);
  }

  @Post("provider-keys/:id/reset")
  @AdminRoles("operator")
  resetProviderKey(@Param("id") id: string) {
    return this.providers.resetProviderKey(id);
  }

  @Post("providers/:id/reset-keys")
  @AdminRoles("operator")
  resetProviderKeys(@Param("id") id: string) {
    return this.providers.resetProviderKeys(id);
  }

  @Delete("provider-keys/:id")
  @AdminRoles("admin")
  deleteProviderKey(@Param("id") id: string) {
    return this.providers.deleteProviderKey(id);
  }

  @Get("api-keys")
  apiKeysList(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.apiKeys.listPage({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post("api-keys")
  @AdminRoles("admin")
  createApiKey(@Body() body: Record<string, unknown>) {
    return this.apiKeys.create({ ...body, tenantId: "default" });
  }

  @Patch("api-keys/:id")
  @AdminRoles("admin")
  updateApiKey(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.apiKeys.update(id, body);
  }

  @Delete("api-keys/:id")
  @AdminRoles("admin")
  deleteApiKey(@Param("id") id: string) {
    return this.apiKeys.delete(id);
  }
}
