import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
import { DatabaseModule } from "../database/database.module";
import { KeyPoolModule } from "../key-pool/key-pool.module";
import { ModelRouterModule } from "../model-router/model-router.module";
import { ObservabilityModule } from "../observability/observability.module";
import { ProvidersModule } from "../providers/providers.module";
import { SecurityModule } from "../security/security.module";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminAuthGuard } from "./admin-auth.guard";
import { AdminAuthService } from "./admin-auth.service";
import { AdminController } from "./admin.controller";
import { AdminProviderService } from "./admin-provider.service";
import { AdminTenantService } from "./admin-tenant.service";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    BillingModule,
    KeyPoolModule,
    ModelRouterModule,
    ObservabilityModule,
    ProvidersModule,
    SecurityModule,
  ],
  controllers: [AdminController, AdminAuthController],
  providers: [
    AdminProviderService,
    AdminTenantService,
    AdminAuthService,
    AdminAuthGuard,
  ],
})
export class AdminModule {}
