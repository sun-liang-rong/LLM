import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { NormalizedRequest } from "@gateway/protocol";
import type { GatewayProtocol } from "@gateway/shared";
import type { VerifiedGatewayKey } from "../auth/api-key.service";
import { BudgetService } from "../billing/budget.service";
import { CreditService } from "../billing/credit.service";
import { PricingService } from "../billing/pricing.service";
import { KeyPoolService } from "../key-pool/key-pool.service";
import { ModelRouterService } from "../model-router/model-router.service";
import { RequestLogService } from "../observability/request-log.service";
import { StreamObserverService } from "../observability/stream-observer.service";
import { ProviderRegistry } from "../providers/provider-registry.service";
import {
  ProviderUpstreamError,
  type ProviderResult,
} from "../providers/providers/provider-adapter";
import { UsageService } from "../usage/usage.service";
import { ProtocolAdapterService } from "./protocol-adapter.service";

@Injectable()
export class GatewayService {
  constructor(
    private readonly protocol: ProtocolAdapterService,
    private readonly router: ModelRouterService,
    private readonly keyPool: KeyPoolService,
    private readonly providers: ProviderRegistry,
    private readonly logs: RequestLogService,
    private readonly usage: UsageService,
    private readonly streams: StreamObserverService,
    private readonly budgets: BudgetService,
    private readonly credits: CreditService,
    private readonly pricing: PricingService,
  ) {}

  handleOpenAiChat(body: unknown, auth: VerifiedGatewayKey) {
    return this.handle("openai", this.protocol.fromOpenAiChat(body), auth);
  }

  handleOpenAiResponse(body: unknown, auth: VerifiedGatewayKey) {
    return this.handle("openai", this.protocol.fromOpenAiResponse(body), auth);
  }

  handleAnthropicMessages(body: unknown, auth: VerifiedGatewayKey) {
    return this.handle("anthropic", this.protocol.fromAnthropicMessages(body), auth);
  }

  private async handle(
    protocol: GatewayProtocol,
    normalized: NormalizedRequest,
    auth: VerifiedGatewayKey,
  ): Promise<ProviderResult> {
    const started = Date.now();
    let routedModelAlias = normalized.model;
    let routedProvider: string | undefined;
    let routedUpstreamModel: string | undefined;
    let lastProviderKeyId: string | undefined;
    let lastRetryCount = 0;

    this.logs.record({
      requestId: normalized.requestId,
      protocol,
      model: normalized.model,
      apiKeyId: auth.id,
      tenantId: auth.tenantId,
      projectId: auth.projectId,
      status: "started",
    });

    try {
      await this.credits.assertHasCredits(auth.userId, auth.tenantId);
      await this.pricing.assertCanUseModel({
        userId: auth.userId,
        billingGroupId: auth.billingGroupId,
        modelGroupId: auth.modelGroupId,
        model: normalized.model,
      });
      await this.budgets.enforceApiKeyBudget(auth.id);
      const budgetDecision = await this.budgets.previewUsageBudgetAction({
        tenantId: auth.tenantId,
        projectId: auth.projectId,
        apiKeyId: auth.id,
        modelAlias: normalized.model,
      });
      if (
        budgetDecision.exceeded &&
        budgetDecision.action === "downgrade" &&
        budgetDecision.downgradeModelAlias &&
        budgetDecision.downgradeModelAlias !== normalized.model
      ) {
        routedModelAlias = budgetDecision.downgradeModelAlias;
        await this.pricing.assertCanUseModel({
          userId: auth.userId,
          billingGroupId: auth.billingGroupId,
          modelGroupId: auth.modelGroupId,
          model: routedModelAlias,
        });
      }
      const decision = await this.router.decideWithFallback(routedModelAlias);
      await this.budgets.enforceUsageBudgets({
        tenantId: auth.tenantId,
        projectId: auth.projectId,
        apiKeyId: auth.id,
        modelAlias: routedModelAlias,
        providerId: decision.providerId,
      });
      routedProvider = decision.provider;
      routedUpstreamModel = decision.upstreamModel;
      const keys = await this.keyPool.candidates(decision.providerId);

      if (keys.length === 0) {
        const availability = await this.keyPool.availability(decision.providerId);
        throw new ServiceUnavailableException(
          `No available provider key for ${decision.providerSlug} ` +
            `(total=${availability.total}, available=${availability.available}, ` +
            `exhausted=${availability.exhausted}, status=${this.formatStatusCounts(
              availability.byStatus,
            )})`,
        );
      }

      const provider = this.providers.get(decision.upstreamProtocol);
      let lastError: unknown;

      for (const [retryCount, key] of keys.entries()) {
        lastProviderKeyId = key.id;
        lastRetryCount = retryCount;
        const abortController = new AbortController();
        try {
          await this.keyPool.reportAttempt(key.id);
          const result = await provider.complete(normalized, {
            requestId: normalized.requestId,
            provider: decision.provider,
            providerId: decision.providerId,
            providerSlug: decision.providerSlug,
            upstreamProtocol: decision.upstreamProtocol,
            upstreamModel: decision.upstreamModel,
            apiKey: key.value,
            signal: abortController.signal,
            baseUrl: decision.baseUrl,
          });

          if (result.type === "stream") {
            await this.keyPool.reportSuccess(key.id);
            return {
              ...result,
              body: this.streams.wrap(result.body, {
                requestId: normalized.requestId,
                protocol,
                apiKeyId: auth.id,
                userId: auth.userId,
                billingGroupId: auth.billingGroupId,
                modelGroupId: auth.modelGroupId,
                tenantId: auth.tenantId,
                projectId: auth.projectId,
                provider: decision.provider,
                providerId: decision.providerId,
                providerKeyId: key.id,
                model: routedModelAlias,
                upstreamModel: decision.upstreamModel,
                retryCount,
                started,
                estimatedInputTokens: this.estimateInputTokens(normalized),
                abort: () => abortController.abort(),
              }),
            };
          }

          const cost = await this.usage.calculateCost(
            decision.upstreamModel,
            result.usage,
            {
              publicModel: routedModelAlias,
              providerId: decision.providerId,
              userId: auth.userId,
              billingGroupId: auth.billingGroupId,
            },
          );
          await this.credits.chargeUsage({
            userId: auth.userId,
            tenantId: auth.tenantId,
            requestId: normalized.requestId,
            costUsd: cost?.costUsd,
          });

          this.logs.record({
            requestId: normalized.requestId,
            protocol,
            apiKeyId: auth.id,
            tenantId: auth.tenantId,
            projectId: auth.projectId,
            provider: decision.provider,
            providerKeyId: key.id,
            model: routedModelAlias,
            upstreamModel: decision.upstreamModel,
            status: "completed",
            latencyMs: Date.now() - started,
            retryCount,
            inputTokens: result.usage?.inputTokens,
            outputTokens: result.usage?.outputTokens,
            totalTokens: result.usage?.totalTokens,
            cacheReadTokens: result.usage?.cacheReadTokens,
            cacheCreationTokens: result.usage?.cacheCreationTokens,
            reasoningTokens: result.usage?.reasoningTokens,
            estimatedTokens: result.usage?.estimatedTokens,
            costUsd: cost?.costUsd,
          });
          await this.keyPool.reportSuccess(key.id);

          return result;
        } catch (error) {
          lastError = error;
          if (error instanceof ProviderUpstreamError) {
            await this.keyPool.reportFailure(key.id, error.kind, error.message);
          }
          if (retryCount === keys.length - 1) {
            break;
          }
        }
      }

      throw lastError;
    } catch (error) {
      this.logs.record({
        requestId: normalized.requestId,
        protocol,
        model: routedModelAlias,
        apiKeyId: auth.id,
        tenantId: auth.tenantId,
        projectId: auth.projectId,
        provider: routedProvider,
        providerKeyId: lastProviderKeyId,
        upstreamModel: routedUpstreamModel,
        status: "failed",
        latencyMs: Date.now() - started,
        retryCount: lastRetryCount,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private formatStatusCounts(counts: Record<string, number>) {
    const entries = Object.entries(counts);
    if (entries.length === 0) {
      return "none";
    }
    return entries.map(([status, count]) => `${status}:${count}`).join(",");
  }

  private estimateInputTokens(normalized: NormalizedRequest) {
    const text = normalized.messages
      .flatMap((message) => message.content)
      .map((block) => {
        if (block.type === "text") {
          return block.text;
        }
        if (block.type === "image_url") {
          return block.imageUrl;
        }
        return block.content;
      })
      .join("\n");

    return text.trim().length > 0 ? Math.ceil(text.length / 4) : 0;
  }
}
