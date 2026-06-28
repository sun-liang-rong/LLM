import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "./prisma.service";

const DEFAULT_PROVIDERS = [
  {
    provider: "openai",
    name: "OpenAI",
    protocol: "openai-compatible",
    baseUrl: "https://api.openai.com",
  },
  {
    provider: "anthropic",
    name: "Anthropic",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com",
  },
];

const DEFAULT_MODELS = [
  {
    publicId: "openai/gpt-4.1",
    provider: "openai",
    modelGroupSlug: "reasoning",
    upstreamModel: "gpt-4.1",
    displayName: "GPT-4.1",
    description: "Flagship OpenAI model for complex tasks.",
    contextWindow: 1047576,
    inputUsdPerMillionTokens: 2,
    outputUsdPerMillionTokens: 8,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
  },
  {
    publicId: "openai/gpt-4.1-mini",
    provider: "openai",
    modelGroupSlug: "coding",
    upstreamModel: "gpt-4.1-mini",
    displayName: "GPT-4.1 Mini",
    description: "Fast, cost-effective model for coding and general work.",
    contextWindow: 1047576,
    inputUsdPerMillionTokens: 0.4,
    outputUsdPerMillionTokens: 1.6,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
  },
  {
    publicId: "anthropic/claude-sonnet-4-5",
    provider: "anthropic",
    modelGroupSlug: "coding",
    upstreamModel: "claude-sonnet-4-5",
    displayName: "Claude Sonnet 4.5",
    description: "Anthropic model optimized for coding and agentic workflows.",
    contextWindow: 200000,
    inputUsdPerMillionTokens: 3,
    outputUsdPerMillionTokens: 15,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
  },
];

const DEFAULT_MODEL_GROUPS = [
  {
    slug: "free",
    name: "免费模型",
    description: "适合低成本体验和日常轻量使用。",
    multiplier: 1,
    sortOrder: 10,
  },
  {
    slug: "coding",
    name: "编程模型",
    description: "适合代码生成、代码审查和开发工具接入。",
    multiplier: 1,
    sortOrder: 20,
  },
  {
    slug: "reasoning",
    name: "推理模型",
    description: "适合复杂分析、规划和长链路任务。",
    multiplier: 1,
    sortOrder: 30,
  },
  {
    slug: "vision",
    name: "视觉模型",
    description: "支持图片理解、多模态输入的模型。",
    multiplier: 1,
    sortOrder: 40,
  },
];

const DEFAULT_ALIASES = [
  {
    alias: "coder-fast",
    mode: "latency",
    targets: [
      {
        providerSlug: "openai",
        upstreamProtocol: "openai-compatible",
        upstreamModel: "gpt-4.1-mini",
        weight: 1,
        priority: 1,
        enabled: true,
      },
    ],
  },
  {
    alias: "coder-best",
    mode: "quality",
    targets: [
      {
        providerSlug: "anthropic",
        upstreamProtocol: "anthropic",
        upstreamModel: "claude-sonnet-4-5",
        weight: 1,
        priority: 1,
        enabled: true,
      },
    ],
  },
  {
    alias: "claude-sonnet",
    mode: "balanced",
    targets: [
      {
        providerSlug: "anthropic",
        upstreamProtocol: "anthropic",
        upstreamModel: "claude-sonnet-4-5",
        weight: 1,
        priority: 1,
        enabled: true,
      },
    ],
  },
];

@Injectable()
export class DatabaseBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensureSchemaCompatibility();
    await this.seedTenant();
    await this.seedPlatformSettings();
    await this.seedDefaultAnnouncement();
    await this.seedModelGroups();
    if (this.config.get<string>("SEED_DEMO_DATA") === "true") {
      await this.seedProviders();
      await this.seedModels();
      await this.seedAliases();
    }
  }

  private async ensureSchemaCompatibility() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PlatformSettings" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
        "siteName" TEXT NOT NULL DEFAULT 'AI Gateway',
        "logoText" TEXT NOT NULL DEFAULT 'AG',
        "homeNotice" TEXT NOT NULL DEFAULT '欢迎使用 AI Gateway，请合理安排 API 调用额度。',
        "registrationEnabled" BOOLEAN NOT NULL DEFAULT true,
        "checkInEnabled" BOOLEAN NOT NULL DEFAULT true,
        "signupBonusUsd" REAL NOT NULL DEFAULT 3,
        "dailyCheckInMinUsd" REAL NOT NULL DEFAULT 0.01,
        "dailyCheckInMaxUsd" REAL NOT NULL DEFAULT 0.1,
        "defaultModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
        "smtpHost" TEXT,
        "smtpPort" INTEGER NOT NULL DEFAULT 587,
        "smtpUser" TEXT,
        "smtpFrom" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Announcement" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "title" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "type" TEXT NOT NULL DEFAULT 'notice',
        "pinned" BOOLEAN NOT NULL DEFAULT false,
        "status" TEXT NOT NULL DEFAULT 'draft',
        "publishAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ModelGroup" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "description" TEXT,
        "multiplier" REAL NOT NULL DEFAULT 1,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "enabled" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      )
    `);
    await this.prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "ModelGroup_slug_key" ON "ModelGroup"("slug")',
    );

    const platformColumns = await this.prisma.$queryRaw<Array<{ name: string }>>`
      PRAGMA table_info("PlatformSettings")
    `;
    await this.ensureColumn(platformColumns, "PlatformSettings", "signupBonusUsd", "REAL NOT NULL DEFAULT 3");
    await this.ensureColumn(platformColumns, "PlatformSettings", "dailyCheckInMinUsd", "REAL NOT NULL DEFAULT 0.01");
    await this.ensureColumn(platformColumns, "PlatformSettings", "dailyCheckInMaxUsd", "REAL NOT NULL DEFAULT 0.1");

    const userColumns = await this.prisma.$queryRaw<Array<{ name: string }>>`
      PRAGMA table_info("User")
    `;
    await this.ensureColumn(userColumns, "User", "disabled", "BOOLEAN NOT NULL DEFAULT false");

    const billingGroupColumns = await this.prisma.$queryRaw<Array<{ name: string }>>`
      PRAGMA table_info("BillingGroup")
    `;
    if (!billingGroupColumns.some((column) => column.name === "allowedModels")) {
      await this.prisma.$executeRawUnsafe(
        'ALTER TABLE "BillingGroup" ADD COLUMN "allowedModels" TEXT',
      );
    }

    const apiKeyColumns = await this.prisma.$queryRaw<Array<{ name: string }>>`
      PRAGMA table_info("ApiKey")
    `;
    await this.ensureColumn(apiKeyColumns, "ApiKey", "billingGroupId", "TEXT");
    await this.ensureColumn(apiKeyColumns, "ApiKey", "modelGroupId", "TEXT");
    await this.ensureColumn(apiKeyColumns, "ApiKey", "customKey", "BOOLEAN NOT NULL DEFAULT false");
    await this.ensureColumn(apiKeyColumns, "ApiKey", "ipAllowlist", "TEXT");
    await this.ensureColumn(apiKeyColumns, "ApiKey", "rateLimitRpm", "INTEGER");
    await this.ensureColumn(apiKeyColumns, "ApiKey", "rateLimitTpm", "INTEGER");
    await this.ensureColumn(apiKeyColumns, "ApiKey", "expiresAt", "DATETIME");

    const modelColumns = await this.prisma.$queryRaw<Array<{ name: string }>>`
      PRAGMA table_info("Model")
    `;
    await this.ensureColumn(modelColumns, "Model", "modelGroupId", "TEXT");
    await this.ensureColumn(modelColumns, "Model", "description", "TEXT");
    await this.ensureColumn(modelColumns, "Model", "contextWindow", "INTEGER");
    await this.ensureColumn(modelColumns, "Model", "priceMultiplier", "REAL NOT NULL DEFAULT 1");

    const modelGroupColumns = await this.prisma.$queryRaw<Array<{ name: string }>>`
      PRAGMA table_info("ModelGroup")
    `;
    await this.ensureColumn(modelGroupColumns, "ModelGroup", "multiplier", "REAL NOT NULL DEFAULT 1");
    await this.migrateCreditPrecision();
    await this.prisma.$executeRawUnsafe(`
      UPDATE "ApiKey"
      SET "billingGroupId" = (
        SELECT "billingGroupId" FROM "User" WHERE "User"."id" = "ApiKey"."userId"
      )
      WHERE "billingGroupId" IS NULL
        AND "userId" IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM "User"
          WHERE "User"."id" = "ApiKey"."userId"
            AND "User"."billingGroupId" IS NOT NULL
        )
    `);
  }

  private async ensureColumn(
    columns: Array<{ name: string }>,
    table: string,
    column: string,
    definition: string,
  ) {
    if (columns.some((item) => item.name === column)) {
      return;
    }
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`,
    );
  }

  private async migrateCreditPrecision() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SchemaMigration" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const [migration] = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "SchemaMigration" WHERE "id" = 'credit-precision-v2' LIMIT 1
    `;
    if (migration) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`
        UPDATE "UserCreditAccount"
        SET
          "balanceCredits" = "balanceCredits" * 1000000,
          "totalGrantedCredits" = "totalGrantedCredits" * 1000000,
          "totalUsedCredits" = "totalUsedCredits" * 1000000
      `);
      await tx.$executeRawUnsafe(`
        UPDATE "CreditLedger"
        SET
          "amountCredits" = "amountCredits" * 1000000,
          "balanceAfterCredits" = "balanceAfterCredits" * 1000000
      `);
      await tx.$executeRawUnsafe(`
        UPDATE "CheckInRecord"
        SET "rewardCredits" = "rewardCredits" * 1000000
      `);
      await tx.$executeRawUnsafe(`
        INSERT INTO "SchemaMigration" ("id") VALUES ('credit-precision-v2')
      `);
    });
  }

  private async seedTenant() {
    const tenant = await this.prisma.tenant.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        name: "Default",
      },
    });

    await this.prisma.project.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        tenantId: tenant.id,
        name: "Default Project",
      },
    });

    const billingGroup = await this.prisma.billingGroup.upsert({
      where: { id: "default-billing-group" },
      update: {
        tenantId: tenant.id,
        name: "Default",
        multiplier: 1,
        isDefault: true,
      },
      create: {
        id: "default-billing-group",
        tenantId: tenant.id,
        name: "Default",
        multiplier: 1,
        description: "Default billing group",
        isDefault: true,
      },
    });

    await this.prisma.user.upsert({
      where: { email: "admin@example.com" },
      update: {
        tenantId: tenant.id,
        billingGroupId: billingGroup.id,
        role: "owner",
      },
      create: {
        tenantId: tenant.id,
        billingGroupId: billingGroup.id,
        email: "admin@example.com",
        name: "Default Owner",
        role: "owner",
      },
    });
  }

  private async seedPlatformSettings() {
    await this.prisma.platformSettings.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        siteName: "AI Gateway",
        logoText: "AG",
        homeNotice: "欢迎使用 AI Gateway，请合理安排 API 调用额度。",
        registrationEnabled: true,
        checkInEnabled: true,
        signupBonusUsd: 3,
        dailyCheckInMinUsd: 0.01,
        dailyCheckInMaxUsd: 0.1,
        defaultModel: "gpt-4o-mini",
      },
    });
  }

  private async seedDefaultAnnouncement() {
    await this.prisma.announcement.upsert({
      where: { id: "welcome" },
      update: {},
      create: {
        id: "welcome",
        title: "平台公告",
        content: "模型广场、API Key、余额中心和每日签到已开放使用。",
        type: "notice",
        pinned: true,
        status: "published",
        publishAt: new Date(),
      },
    });
  }

  private async seedModelGroups() {
    for (const item of DEFAULT_MODEL_GROUPS) {
      await this.prisma.modelGroup.upsert({
        where: { slug: item.slug },
        update: {
          name: item.name,
          description: item.description,
          multiplier: item.multiplier,
          sortOrder: item.sortOrder,
        },
        create: {
          ...item,
        },
      });
    }
  }

  private async seedProviders() {
    for (const item of DEFAULT_PROVIDERS) {
      const baseUrl =
        item.provider === "openai"
          ? this.config.get<string>("OPENAI_BASE_URL", item.baseUrl)
          : this.config.get<string>("ANTHROPIC_BASE_URL", item.baseUrl);

      await this.prisma.provider.upsert({
        where: { provider: item.provider },
        update: { name: item.name, protocol: item.protocol, baseUrl },
        create: { ...item, baseUrl },
      });
    }
  }

  private async seedModels() {
    for (const item of DEFAULT_MODELS) {
      const provider = await this.prisma.provider.findUnique({
        where: { provider: item.provider },
      });
      if (!provider) {
        this.logger.warn(`Provider not found while seeding model: ${item.provider}`);
        continue;
      }

      await this.prisma.model.upsert({
        where: { publicId: item.publicId },
        update: {
          modelGroupId: await this.modelGroupId(item.modelGroupSlug),
          upstreamModel: item.upstreamModel,
          displayName: item.displayName,
          description: item.description,
          contextWindow: item.contextWindow,
          inputUsdPerMillionTokens: item.inputUsdPerMillionTokens,
          outputUsdPerMillionTokens: item.outputUsdPerMillionTokens,
          supportsTools: item.supportsTools,
          supportsVision: item.supportsVision,
          supportsStreaming: item.supportsStreaming,
        },
        create: {
          providerId: provider.id,
          modelGroupId: await this.modelGroupId(item.modelGroupSlug),
          publicId: item.publicId,
          upstreamModel: item.upstreamModel,
          displayName: item.displayName,
          description: item.description,
          contextWindow: item.contextWindow,
          inputUsdPerMillionTokens: item.inputUsdPerMillionTokens,
          outputUsdPerMillionTokens: item.outputUsdPerMillionTokens,
          supportsTools: item.supportsTools,
          supportsVision: item.supportsVision,
          supportsStreaming: item.supportsStreaming,
        },
      });
    }
  }

  private async modelGroupId(slug: string) {
    const group = await this.prisma.modelGroup.findUnique({
      where: { slug },
      select: { id: true },
    });
    return group?.id;
  }

  private async seedAliases() {
    for (const item of DEFAULT_ALIASES) {
      await this.prisma.modelAlias.upsert({
        where: { alias: item.alias },
        update: {
          mode: item.mode,
          targets: JSON.stringify(await this.resolveTargets(item.targets)),
        },
        create: {
          alias: item.alias,
          mode: item.mode,
          targets: JSON.stringify(await this.resolveTargets(item.targets)),
        },
      });
    }
  }

  private async resolveTargets(
    targets: Array<{
      providerSlug: string;
      upstreamProtocol: string;
      upstreamModel: string;
      weight: number;
      priority: number;
      enabled: boolean;
    }>,
  ) {
    return Promise.all(
      targets.map(async (target) => {
        const provider = await this.prisma.provider.findUnique({
          where: { provider: target.providerSlug },
        });
        return {
          providerId: provider?.id ?? target.providerSlug,
          providerSlug: target.providerSlug,
          upstreamProtocol: target.upstreamProtocol,
          upstreamModel: target.upstreamModel,
          weight: target.weight,
          priority: target.priority,
          enabled: target.enabled,
        };
      }),
    );
  }
}
