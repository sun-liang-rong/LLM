import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  AdminCreditUser,
  CheckInResult,
  CheckInStatus,
  CreditAccountSummary,
  CreditLedgerEntry,
  CreditLedgerType,
} from "@gateway/shared";
import { PrismaService } from "../database/prisma.service";
import { PlatformConfigService } from "./platform-config.service";

type CreditValue = bigint | number;

const CREDIT_SCALE = 8;
const CREDITS_PER_USD = BigInt(100_000_000);
const CREDITS_PER_CENT = CREDITS_PER_USD / BigInt(100);
const CREDIT_EXPIRY_DAYS = 30;

@Injectable()
export class CreditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformConfig: PlatformConfigService,
  ) {}

  async grantSignupBonus(userId: string, tenantId: string) {
    const existing = await this.prisma.userCreditAccount.findUnique({
      where: { userId },
    });
    if (existing) {
      return this.summary(userId, tenantId);
    }

    const signupBonusCredits = this.centsToCredits(
      await this.platformConfig.signupBonusCents(),
    );
    const status = await this.checkInStatus(userId, tenantId);
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.userCreditAccount.create({
        data: {
          userId,
          tenantId,
          balanceCredits: signupBonusCredits,
          totalGrantedCredits: signupBonusCredits,
        },
      });
      if (signupBonusCredits > 0) {
        await tx.creditLedger.create({
          data: {
            userId,
            tenantId,
            type: "signup_bonus",
            amountCredits: signupBonusCredits,
            balanceAfterCredits: account.balanceCredits,
            expiresAt: this.expiryDate(),
            description: "Signup bonus",
          },
        });
      }
      return this.toSummary(account, status);
    });
  }

  async summary(userId: string, tenantId: string): Promise<CreditAccountSummary> {
    await this.expireCredits(userId, tenantId);
    const account = await this.ensureAccount(userId, tenantId);
    return this.toSummary(account, await this.checkInStatus(userId, tenantId));
  }

  async checkInStatus(
    userId: string,
    tenantId: string,
  ): Promise<CheckInStatus> {
    const today = this.todayShanghai();
    const record = await this.prisma.checkInRecord.findUnique({
      where: {
        userId_checkInDate: {
          userId,
          checkInDate: today,
        },
      },
    });
    return {
      checkedIn: Boolean(record),
      checkInDate: today,
      rewardUsd: record
        ? this.creditsToUsd(record.rewardCredits)
        : this.creditsToUsd(
            this.centsToCredits(
              await this.platformConfig.randomDailyCheckInCents(),
            ),
          ),
      nextCheckInDate: this.nextShanghaiDate(),
    };
  }

  async checkIn(userId: string, tenantId: string): Promise<CheckInResult> {
    if (!(await this.platformConfig.checkInEnabled())) {
      throw new ForbiddenException("Daily check-in is disabled");
    }
    await this.expireCredits(userId, tenantId);
    const status = await this.checkInStatus(userId, tenantId);
    if (status.checkedIn) {
      return {
        ...status,
        account: await this.summary(userId, tenantId),
      };
    }

    return this.prisma.$transaction(async (tx) => {
      const current = await this.ensureAccountTx(tx, userId, tenantId);
      const rewardCredits = this.usdToCredits(status.rewardUsd);
      const balanceAfter = this.toCredits(current.balanceCredits) + rewardCredits;
      const account = await tx.userCreditAccount.update({
        where: { userId },
        data: {
          balanceCredits: balanceAfter,
          totalGrantedCredits: {
            increment: rewardCredits,
          },
        },
      });
      await tx.checkInRecord.create({
        data: {
          userId,
          tenantId,
          checkInDate: status.checkInDate,
          rewardCredits,
        },
      });
      const ledger = await tx.creditLedger.create({
        data: {
          userId,
          tenantId,
          type: "checkin",
          amountCredits: rewardCredits,
          balanceAfterCredits: balanceAfter,
          expiresAt: this.expiryDate(),
          description: "Daily check-in reward",
        },
      });
      const nextStatus = { ...status, checkedIn: true };
      return {
        ...nextStatus,
        account: this.toSummary(account, nextStatus),
        ledger: this.toLedgerEntry(ledger),
      };
    });
  }

  async ledger(
    input: {
      userId?: string;
      tenantId?: string;
      type?: CreditLedgerType;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const pageSize = Math.min(Math.max(input.pageSize ?? 20, 1), 100);
    const page = Math.max(input.page ?? 1, 1);
    const where = {
      userId: input.userId,
      tenantId: input.tenantId,
      type: input.type,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.creditLedger.findMany({
        where,
        include: {
          user: {
            select: {
              email: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.creditLedger.count({ where }),
    ]);
    return {
      rows: rows.map((row) =>
        this.toLedgerEntry({
          ...row,
          userEmail: row.user.email,
          userName: row.user.name ?? undefined,
        }),
      ),
      total,
      page,
      pageSize,
    };
  }

  async adminUsers(query: {
    page?: number;
    pageSize?: number;
    email?: string;
  }) {
    const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100);
    const page = Math.max(query.page ?? 1, 1);
    const where = query.email
      ? { email: { contains: query.email } }
      : undefined;
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: {
          tenant: { select: { name: true } },
        billingGroup: { select: { id: true, name: true, multiplier: true } },
        creditAccount: true,
      },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      rows: await Promise.all(users.map((user) => this.toAdminUser(user))),
      total,
      page,
      pageSize,
    };
  }

  async resetTodayCheckIn(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tenantId: true },
    });
    if (!user) {
      throw new BadRequestException("User not found");
    }

    const checkInDate = this.todayShanghai();
    const deleted = await this.prisma.checkInRecord.deleteMany({
      where: {
        userId: user.id,
        checkInDate,
      },
    });

    return {
      ok: true,
      userId: user.id,
      tenantId: user.tenantId,
      checkInDate,
      deletedCount: deleted.count,
      reset: deleted.count > 0,
      status: await this.checkInStatus(user.id, user.tenantId),
    };
  }

  async adjust(input: {
    userId: string;
    amountUsd: number;
    description?: string;
  }) {
    const amountCredits = this.usdToCredits(input.amountUsd);
    if (amountCredits === 0n) {
      throw new BadRequestException("amountUsd must be a non-zero amount");
    }
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { tenantId: true },
    });
    if (!user) {
      throw new BadRequestException("User not found");
    }
    return this.addLedgerAndBalance({
      userId: input.userId,
      tenantId: user.tenantId,
      type: "admin_adjust",
      amountCredits,
      description: input.description || "Admin adjustment",
    });
  }

  async assertHasCredits(userId?: string, tenantId?: string) {
    if (!userId || !tenantId) {
      return;
    }
    await this.expireCredits(userId, tenantId);
    const account = await this.ensureAccount(userId, tenantId);
    if (this.toCredits(account.balanceCredits) <= 0n) {
      throw new ForbiddenException("Insufficient credits");
    }
  }

  async chargeUsage(input: {
    userId?: string;
    tenantId?: string;
    requestId: string;
    costUsd?: number;
  }) {
    if (!input.userId || !input.tenantId) {
      return undefined;
    }
    const usageCredits = this.usageCredits(input.costUsd);
    if (usageCredits === 0n) {
      return undefined;
    }
    const amountCredits = -usageCredits;
    return this.addLedgerAndBalance({
      userId: input.userId,
      tenantId: input.tenantId,
      type: "usage",
      amountCredits,
      requestId: input.requestId,
      description: `Usage charge ${this.formatUsd(input.costUsd)} for ${input.requestId}`,
    });
  }

  private async addLedgerAndBalance(input: {
    userId: string;
    tenantId: string;
    type: CreditLedgerType;
    amountCredits: bigint;
    requestId?: string;
    description?: string;
    expiresAt?: Date;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.ensureAccountTx(tx, input.userId, input.tenantId);
      const balanceAfter = this.toCredits(current.balanceCredits) + input.amountCredits;
      if (balanceAfter < 0n) {
        throw new ForbiddenException("Insufficient credits");
      }
      const account = await tx.userCreditAccount.update({
        where: { userId: input.userId },
        data: {
          balanceCredits: balanceAfter,
          totalGrantedCredits:
            input.amountCredits > 0n
              ? { increment: input.amountCredits }
              : undefined,
          totalUsedCredits:
            input.amountCredits < 0n
              ? { increment: -input.amountCredits }
              : undefined,
        },
      });
      const ledger = await tx.creditLedger.create({
        data: {
          userId: input.userId,
          tenantId: input.tenantId,
          type: input.type,
          amountCredits: input.amountCredits,
          balanceAfterCredits: balanceAfter,
          requestId: input.requestId,
          expiresAt: input.expiresAt,
          description: input.description,
        },
      });
      return {
        ledger: this.toLedgerEntry(ledger),
      };
    });
  }

  private async expireCredits(userId: string, tenantId: string) {
    const expired = await this.prisma.creditLedger.findMany({
      where: {
        userId,
        tenantId,
        type: { in: ["signup_bonus", "checkin"] },
        amountCredits: { gt: 0n },
        expiresAt: { lte: new Date() },
      },
    });
    if (expired.length === 0) {
      return;
    }
    const alreadyExpired = await this.prisma.creditLedger.findMany({
      where: {
        userId,
        tenantId,
        type: "expired",
        requestId: { in: expired.map((item) => item.id) },
      },
      select: { requestId: true },
    });
    const seen = new Set(alreadyExpired.map((item) => item.requestId));
    const pending = expired.filter((item) => !seen.has(item.id));
    if (pending.length === 0) {
      return;
    }
    const total = pending.reduce(
      (sum, item) => sum + this.toCredits(item.amountCredits),
      0n,
    );
    const account = await this.ensureAccount(userId, tenantId);
    const balanceCredits = this.toCredits(account.balanceCredits);
    const amount = -(balanceCredits < total ? balanceCredits : total);
    if (amount === 0n) {
      return;
    }
    await this.addLedgerAndBalance({
      userId,
      tenantId,
      type: "expired",
      amountCredits: amount,
      requestId: pending[0].id,
      description: "Expired free credits",
    });
  }

  private async ensureAccount(userId: string, tenantId: string) {
    const existing = await this.prisma.userCreditAccount.findUnique({
      where: { userId },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.userCreditAccount.create({
      data: { userId, tenantId },
    });
  }

  private async ensureAccountTx(
    tx: Prisma.TransactionClient,
    userId: string,
    tenantId: string,
  ) {
    const existing = await tx.userCreditAccount.findUnique({
      where: { userId },
    });
    if (existing) {
      return existing;
    }
    return tx.userCreditAccount.create({
      data: { userId, tenantId },
    });
  }

  private toSummary(
    account: {
      userId: string;
      tenantId: string;
      balanceCredits: CreditValue;
      totalGrantedCredits: CreditValue;
      totalUsedCredits: CreditValue;
    },
    status: CheckInStatus,
  ): CreditAccountSummary {
    return {
      userId: account.userId,
      tenantId: account.tenantId,
      balanceUsd: this.creditsToUsd(account.balanceCredits),
      totalGrantedUsd: this.creditsToUsd(account.totalGrantedCredits),
      totalUsedUsd: this.creditsToUsd(account.totalUsedCredits),
      todayCheckedIn: status.checkedIn,
      dailyRewardUsd: status.rewardUsd,
      nextCheckInDate: status.nextCheckInDate,
    };
  }

  private toLedgerEntry(row: {
    id: string;
    userId: string;
    tenantId: string;
    type: string;
    amountCredits: CreditValue;
    balanceAfterCredits: CreditValue;
    requestId?: string | null;
    expiresAt?: Date | null;
    description?: string | null;
    createdAt: Date;
    userEmail?: string;
    userName?: string;
  }): CreditLedgerEntry {
    return {
      id: row.id,
      userId: row.userId,
      tenantId: row.tenantId,
      type: row.type as CreditLedgerType,
      amountUsd: this.creditsToUsd(row.amountCredits),
      balanceAfterUsd: this.creditsToUsd(row.balanceAfterCredits),
      requestId: row.requestId ?? undefined,
      expiresAt: row.expiresAt?.toISOString(),
      description: row.description ?? undefined,
      createdAt: row.createdAt.toISOString(),
      userEmail: row.userEmail,
      userName: row.userName,
    };
  }

  private async toAdminUser(user: {
    id: string;
    tenantId: string;
    email: string;
    name: string | null;
    disabled: boolean;
    tenant: { name: string };
    billingGroup: {
      id: string;
      name: string;
      multiplier: number;
    } | null;
    creditAccount: {
      balanceCredits: CreditValue;
      totalGrantedCredits: CreditValue;
      totalUsedCredits: CreditValue;
      updatedAt: Date;
    } | null;
  }): Promise<AdminCreditUser> {
    const account =
      user.creditAccount ?? (await this.ensureAccount(user.id, user.tenantId));
    const checkInStatus = await this.checkInStatus(user.id, user.tenantId);
    return {
      userId: user.id,
      tenantId: user.tenantId,
      tenantName: user.tenant.name,
      email: user.email,
      name: user.name ?? undefined,
      disabled: user.disabled,
      billingGroupId: user.billingGroup?.id,
      billingGroupName: user.billingGroup?.name,
      billingMultiplier: user.billingGroup?.multiplier ?? 1,
      balanceUsd: this.creditsToUsd(account.balanceCredits),
      totalGrantedUsd: this.creditsToUsd(account.totalGrantedCredits),
      totalUsedUsd: this.creditsToUsd(account.totalUsedCredits),
      todayCheckedIn: checkInStatus.checkedIn,
      todayCheckInDate: checkInStatus.checkInDate,
      updatedAt: account.updatedAt?.toISOString(),
    };
  }

  private usageCredits(costUsd?: number) {
    if (!Number.isFinite(costUsd) || !costUsd || costUsd <= 0) {
      return 0n;
    }
    const credits = this.usdToCredits(costUsd);
    return credits > 0n ? credits : 1n;
  }

  private formatUsd(value?: number) {
    return `$${Number(value ?? 0).toFixed(6)}`;
  }

  private creditsToUsd(value: CreditValue) {
    const credits = this.toCredits(value);
    const sign = credits < 0n ? "-" : "";
    const absolute = credits < 0n ? -credits : credits;
    const whole = absolute / CREDITS_PER_USD;
    const fraction = (absolute % CREDITS_PER_USD)
      .toString()
      .padStart(CREDIT_SCALE, "0");
    return Number(`${sign}${whole}.${fraction}`);
  }

  private usdToCredits(value: number) {
    if (!Number.isFinite(value)) {
      throw new BadRequestException("Expected dollar amount");
    }
    return this.decimalToCredits(value, CREDIT_SCALE);
  }

  private centsToCredits(value: number) {
    if (!Number.isFinite(value)) {
      throw new BadRequestException("Expected cent amount");
    }
    return this.decimalToInteger(value, 0) * CREDITS_PER_CENT;
  }

  private decimalToCredits(value: number, scale: number) {
    const decimal = this.decimalToInteger(value, scale);
    return decimal * (CREDITS_PER_USD / 10n ** BigInt(scale));
  }

  private decimalToInteger(value: number, scale: number) {
    const sign = value < 0 ? -1n : 1n;
    const normalized = Math.abs(value).toFixed(scale);
    const [whole, fraction = ""] = normalized.split(".");
    const decimal = BigInt(whole + fraction.padEnd(scale, "0"));
    return sign * decimal;
  }

  private toCredits(value: CreditValue) {
    return typeof value === "bigint" ? value : BigInt(value);
  }

  private expiryDate() {
    return new Date(Date.now() + CREDIT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  }

  private todayShanghai() {
    return this.shanghaiDate(new Date());
  }

  private nextShanghaiDate() {
    return this.shanghaiDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
  }

  private shanghaiDate(date: Date) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(date);
  }
}
