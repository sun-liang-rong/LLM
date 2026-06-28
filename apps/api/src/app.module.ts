import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AdminModule } from "./modules/admin/admin.module";
import { AuthModule } from "./modules/auth/auth.module";
import { BillingModule } from "./modules/billing/billing.module";
import { DatabaseModule } from "./modules/database/database.module";
import { GatewayModule } from "./modules/gateway/gateway.module";
import { HealthModule } from "./modules/health/health.module";
import { KeyPoolModule } from "./modules/key-pool/key-pool.module";
import { ModelRouterModule } from "./modules/model-router/model-router.module";
import { ObservabilityModule } from "./modules/observability/observability.module";
import { ProvidersModule } from "./modules/providers/providers.module";
import { PublicModule } from "./modules/public/public.module";
import { UsageModule } from "./modules/usage/usage.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
    }),
    DatabaseModule,
    AuthModule,
    BillingModule,
    HealthModule,
    ObservabilityModule,
    KeyPoolModule,
    ModelRouterModule,
    ProvidersModule,
    PublicModule,
    UsageModule,
    GatewayModule,
    AdminModule,
  ],
})
export class AppModule {}
