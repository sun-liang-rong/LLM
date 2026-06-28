import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseBootstrapService } from "./database-bootstrap.service";
import { PrismaService } from "./prisma.service";

@Module({
  imports: [ConfigModule],
  providers: [PrismaService, DatabaseBootstrapService],
  exports: [PrismaService],
})
export class DatabaseModule {}
