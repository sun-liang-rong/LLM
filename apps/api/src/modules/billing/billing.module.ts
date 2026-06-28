import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AlertService } from "./alert.service";
import { BudgetService } from "./budget.service";
import { CreditService } from "./credit.service";
import { PlatformConfigService } from "./platform-config.service";
import { PricingService } from "./pricing.service";

@Module({
  imports: [DatabaseModule],
  providers: [
    BudgetService,
    AlertService,
    CreditService,
    PlatformConfigService,
    PricingService,
  ],
  exports: [
    BudgetService,
    AlertService,
    CreditService,
    PlatformConfigService,
    PricingService,
  ],
})
export class BillingModule {}
