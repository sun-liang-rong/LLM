import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { KeyPoolModule } from "../key-pool/key-pool.module";
import { ModelRouterService } from "./model-router.service";

@Module({
  imports: [DatabaseModule, KeyPoolModule],
  providers: [ModelRouterService],
  exports: [ModelRouterService],
})
export class ModelRouterModule {}
