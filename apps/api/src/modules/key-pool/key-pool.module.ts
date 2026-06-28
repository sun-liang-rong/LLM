import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { SecurityModule } from "../security/security.module";
import { KeyPoolService } from "./key-pool.service";

@Module({
  imports: [DatabaseModule, SecurityModule],
  providers: [KeyPoolService],
  exports: [KeyPoolService],
})
export class KeyPoolModule {}
