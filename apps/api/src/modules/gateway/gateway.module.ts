import { Module } from "@nestjs/common";
import { KeyPoolModule } from "../key-pool/key-pool.module";
import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
import { ModelRouterModule } from "../model-router/model-router.module";
import { ObservabilityModule } from "../observability/observability.module";
import { ProvidersModule } from "../providers/providers.module";
import { UsageModule } from "../usage/usage.module";
import { GatewayController } from "./gateway.controller";
import { GatewayService } from "./gateway.service";
import { ProtocolAdapterService } from "./protocol-adapter.service";

@Module({
  imports: [
    KeyPoolModule,
    AuthModule,
    BillingModule,
    ModelRouterModule,
    ProvidersModule,
    ObservabilityModule,
    UsageModule,
  ],
  controllers: [GatewayController],
  providers: [GatewayService, ProtocolAdapterService],
})
export class GatewayModule {}
