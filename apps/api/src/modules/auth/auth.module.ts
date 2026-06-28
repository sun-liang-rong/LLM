import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BillingModule } from "../billing/billing.module";
import { DatabaseModule } from "../database/database.module";
import { SecurityModule } from "../security/security.module";
import { ApiKeyService } from "./api-key.service";
import { AuthAuditService } from "./auth-audit.service";
import { AuthConfigService } from "./auth-config.service";
import { AuthSecurityService } from "./auth-security.service";
import { PasswordService } from "./password.service";
import { TenantAuthController } from "./tenant-auth.controller";
import { TenantAuthGuard } from "./tenant-auth.guard";
import { TenantConsoleController } from "./tenant-console.controller";
import { TenantAuthService } from "./tenant-auth.service";
import { VerificationService } from "./verification.service";
import { ModelRouterModule } from "../model-router/model-router.module";
import { ObservabilityModule } from "../observability/observability.module";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    BillingModule,
    SecurityModule,
    ObservabilityModule,
    ModelRouterModule,
  ],
  controllers: [TenantAuthController, TenantConsoleController],
  providers: [
    ApiKeyService,
    AuthAuditService,
    AuthConfigService,
    AuthSecurityService,
    PasswordService,
    TenantAuthService,
    TenantAuthGuard,
    VerificationService,
  ],
  exports: [
    ApiKeyService,
    AuthAuditService,
    AuthConfigService,
    AuthSecurityService,
    PasswordService,
    TenantAuthService,
    TenantAuthGuard,
    VerificationService,
  ],
})
export class AuthModule {}
