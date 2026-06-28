import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { DatabaseModule } from "../database/database.module";
import { UsageModule } from "../usage/usage.module";
import { RequestLogService } from "./request-log.service";
import { StreamObserverService } from "./stream-observer.service";

@Module({
  imports: [DatabaseModule, UsageModule, BillingModule],
  providers: [RequestLogService, StreamObserverService],
  exports: [RequestLogService, StreamObserverService],
})
export class ObservabilityModule {}
