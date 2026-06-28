import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  Announcement,
  AnnouncementStatus,
  AnnouncementType,
  ModelGroup,
  SiteSettings,
} from "@gateway/shared";
import { PrismaService } from "../database/prisma.service";

const DEFAULT_SETTINGS_ID = "default";

@Injectable()
export class PlatformConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async settings(): Promise<SiteSettings> {
    const row = await this.ensureSettings();
    return this.serializeSettings(row);
  }

  async saveSettings(input: Record<string, unknown>): Promise<SiteSettings> {
    const current = await this.ensureSettings();
    const data = {
      siteName: this.stringValue(input.siteName, current.siteName),
      logoText: this.stringValue(input.logoText, current.logoText),
      homeNotice: this.stringValue(input.homeNotice, current.homeNotice),
      registrationEnabled: this.booleanValue(
        input.registrationEnabled,
        current.registrationEnabled,
      ),
      checkInEnabled: this.booleanValue(input.checkInEnabled, current.checkInEnabled),
      signupBonusUsd: this.numberValue(
        input.signupBonusUsd,
        current.signupBonusUsd,
        0,
      ),
      dailyCheckInMinUsd: this.numberValue(
        input.dailyCheckInMinUsd,
        current.dailyCheckInMinUsd,
        0,
      ),
      dailyCheckInMaxUsd: this.numberValue(
        input.dailyCheckInMaxUsd,
        current.dailyCheckInMaxUsd,
        0,
      ),
      defaultModel: this.stringValue(input.defaultModel, current.defaultModel),
      smtpHost: this.optionalString(input.smtpHost),
      smtpPort: this.integerValue(input.smtpPort, current.smtpPort, 1, 65535),
      smtpUser: this.optionalString(input.smtpUser),
      smtpFrom: this.optionalString(input.smtpFrom),
    };

    const updated = await this.prisma.platformSettings.update({
      where: { id: DEFAULT_SETTINGS_ID },
      data,
    });
    return this.serializeSettings(updated);
  }

  async signupBonusCents() {
    return this.usdToCents((await this.ensureSettings()).signupBonusUsd);
  }

  async randomDailyCheckInCents() {
    const settings = await this.ensureSettings();
    const min = Math.min(settings.dailyCheckInMinUsd, settings.dailyCheckInMaxUsd);
    const max = Math.max(settings.dailyCheckInMinUsd, settings.dailyCheckInMaxUsd);
    const centsMin = this.usdToCents(min);
    const centsMax = this.usdToCents(max);
    if (centsMax <= centsMin) {
      return centsMin;
    }
    return centsMin + Math.floor(Math.random() * (centsMax - centsMin + 1));
  }

  async checkInEnabled() {
    return (await this.ensureSettings()).checkInEnabled;
  }

  async registrationEnabled() {
    return (await this.ensureSettings()).registrationEnabled;
  }

  async listAnnouncements(options: { publicOnly?: boolean } = {}) {
    const where = options.publicOnly
      ? {
          status: "published",
          publishAt: { lte: new Date() },
        }
      : undefined;
    const rows = await this.prisma.announcement.findMany({
      where,
      orderBy: [{ pinned: "desc" }, { publishAt: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((row) => this.serializeAnnouncement(row));
  }

  async saveAnnouncement(input: Record<string, unknown>): Promise<Announcement> {
    const title = this.requiredString(input.title, "title");
    const content = this.requiredString(input.content, "content");
    const type = this.announcementType(input.type);
    const status = this.announcementStatus(input.status);
    const pinned = typeof input.pinned === "boolean" ? input.pinned : false;
    const publishAt =
      typeof input.publishAt === "string" && input.publishAt
        ? new Date(input.publishAt)
        : new Date();

    if (Number.isNaN(publishAt.getTime())) {
      throw new BadRequestException("Invalid publishAt");
    }

    if (typeof input.id === "string" && input.id.trim()) {
      const updated = await this.prisma.announcement.update({
        where: { id: input.id.trim() },
        data: { title, content, type, status, pinned, publishAt },
      });
      return this.serializeAnnouncement(updated);
    }

    const created = await this.prisma.announcement.create({
      data: { title, content, type, status, pinned, publishAt },
    });
    return this.serializeAnnouncement(created);
  }

  async deleteAnnouncement(id: string) {
    await this.prisma.announcement.delete({ where: { id } });
    return { ok: true };
  }

  async listModelGroups(options: { publicOnly?: boolean } = {}) {
    const rows = await this.prisma.modelGroup.findMany({
      where: options.publicOnly ? { enabled: true } : undefined,
      include: { _count: { select: { models: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return rows.map((row) =>
      this.serializeModelGroup({
        ...row,
        modelCount: row._count.models,
      }),
    );
  }

  async saveModelGroup(input: Record<string, unknown>): Promise<ModelGroup> {
    const name = this.requiredString(input.name, "name");
    const slug = this.slugValue(input.slug || name);
    const data = {
      name,
      slug,
      description: this.optionalString(input.description),
      multiplier: this.numberValue(input.multiplier, 1, 0),
      sortOrder: this.integerValue(input.sortOrder, 0),
      enabled: typeof input.enabled === "boolean" ? input.enabled : true,
    };

    const row =
      typeof input.id === "string" && input.id.trim()
        ? await this.prisma.modelGroup.update({
            where: { id: input.id.trim() },
            data,
            include: { _count: { select: { models: true } } },
          })
        : await this.prisma.modelGroup.create({
            data,
            include: { _count: { select: { models: true } } },
          });
    return this.serializeModelGroup({
      ...row,
      modelCount: row._count.models,
    });
  }

  async deleteModelGroup(id: string) {
    const group = await this.prisma.modelGroup.findUnique({
      where: { id },
      include: { _count: { select: { models: true } } },
    });
    if (!group) {
      throw new NotFoundException("Model group not found");
    }
    if (group._count.models > 0) {
      throw new BadRequestException("Model group still has models");
    }
    await this.prisma.modelGroup.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureSettings() {
    return this.prisma.platformSettings.upsert({
      where: { id: DEFAULT_SETTINGS_ID },
      update: {},
      create: {
        id: DEFAULT_SETTINGS_ID,
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

  private serializeSettings(row: {
    siteName: string;
    logoText: string;
    homeNotice: string;
    registrationEnabled: boolean;
    checkInEnabled: boolean;
    signupBonusUsd: number;
    dailyCheckInMinUsd: number;
    dailyCheckInMaxUsd: number;
    defaultModel: string;
    smtpHost: string | null;
    smtpPort: number;
    smtpUser: string | null;
    smtpFrom: string | null;
  }): SiteSettings {
    return {
      siteName: row.siteName,
      logoText: row.logoText,
      homeNotice: row.homeNotice,
      registrationEnabled: row.registrationEnabled,
      checkInEnabled: row.checkInEnabled,
      signupBonusUsd: row.signupBonusUsd,
      dailyCheckInMinUsd: row.dailyCheckInMinUsd,
      dailyCheckInMaxUsd: row.dailyCheckInMaxUsd,
      defaultModel: row.defaultModel,
      smtpHost: row.smtpHost ?? "",
      smtpPort: row.smtpPort,
      smtpUser: row.smtpUser ?? "",
      smtpFrom: row.smtpFrom ?? "",
    };
  }

  private serializeAnnouncement(row: {
    id: string;
    title: string;
    content: string;
    type: string;
    pinned: boolean;
    status: string;
    publishAt: Date;
    createdAt: Date;
    updatedAt: Date;
  }): Announcement {
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      type: this.announcementType(row.type),
      pinned: row.pinned,
      status: this.announcementStatus(row.status),
      publishAt: row.publishAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private serializeModelGroup(row: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    multiplier: number;
    sortOrder: number;
    enabled: boolean;
    modelCount?: number;
    createdAt: Date;
    updatedAt: Date;
  }): ModelGroup {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description ?? undefined,
      multiplier: row.multiplier,
      sortOrder: row.sortOrder,
      enabled: row.enabled,
      modelCount: row.modelCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private requiredString(value: unknown, field: string) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new BadRequestException(`${field} is required`);
    }
    return value.trim();
  }

  private stringValue(value: unknown, fallback: string) {
    return typeof value === "string" ? value.trim() : fallback;
  }

  private optionalString(value: unknown) {
    return typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private booleanValue(value: unknown, fallback: boolean) {
    return typeof value === "boolean" ? value : fallback;
  }

  private integerValue(value: unknown, fallback: number, min?: number, max?: number) {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    const integer = Math.round(parsed);
    if (min !== undefined && integer < min) return min;
    if (max !== undefined && integer > max) return max;
    return integer;
  }

  private numberValue(value: unknown, fallback: number, min?: number, max?: number) {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    if (min !== undefined && parsed < min) return min;
    if (max !== undefined && parsed > max) return max;
    return Number(parsed.toFixed(4));
  }

  private usdToCents(value: number) {
    return Math.max(Math.round(value * 100), 0);
  }

  private announcementType(value: unknown): AnnouncementType {
    return value === "model" ||
      value === "maintenance" ||
      value === "activity" ||
      value === "notice"
      ? value
      : "notice";
  }

  private announcementStatus(value: unknown): AnnouncementStatus {
    return value === "published" ? "published" : "draft";
  }

  private slugValue(value: unknown) {
    const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
    const slug = raw
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug) {
      throw new BadRequestException("slug is required");
    }
    return slug;
  }
}
