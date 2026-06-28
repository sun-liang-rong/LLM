import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { UsageService } from "./usage.service";

@Module({
  imports: [BillingModule],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
