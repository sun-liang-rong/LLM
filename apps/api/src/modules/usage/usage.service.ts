import { Injectable } from "@nestjs/common";
import { PricingService } from "../billing/pricing.service";
import type { ProviderUsage } from "../providers/providers/provider-adapter";

@Injectable()
export class UsageService {
  constructor(private readonly pricing: PricingService) {}

  async calculateCost(
    upstreamModel: string,
    usage?: ProviderUsage,
    options: {
      publicModel?: string;
      providerId?: string;
      userId?: string;
      billingGroupId?: string;
      modelGroupId?: string;
    } = {},
  ) {
    return this.pricing.calculateUsageCost({
      upstreamModel,
      publicModel: options.publicModel,
      usage,
      providerId: options.providerId,
      userId: options.userId,
      billingGroupId: options.billingGroupId,
      modelGroupId: options.modelGroupId,
    });
  }
}
