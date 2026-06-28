import { Injectable } from "@nestjs/common";
import type { AlertItem, BudgetScope } from "@gateway/shared";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class AlertService {
  constructor(private readonly prisma: PrismaService) {}

  async listCurrentAlerts(tenantId?: string): Promise<AlertItem[]> {
    const scopeWhere = tenantId ? { tenantId } : undefined;
    const tenantUsers = tenantId
      ? await this.prisma.user.findMany({
          where: { tenantId },
          select: { email: true },
        })
      : [];
    const tenantEmails = tenantUsers.map((user) => user.email);
    const [budgets, unhealthyKeys, failedSummary, lockedAttempts, throttledIps, suspiciousLogins] =
      await Promise.all([
      this.prisma.budget.findMany({
        where: scopeWhere,
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.providerKey.findMany({
        where: {
          OR: [
            { status: "rate_limited" },
            { status: "cooldown" },
            { status: "disabled" },
          ],
        },
        include: { provider: true },
        orderBy: { updatedAt: "desc" },
        take: 12,
      }),
      this.prisma.requestLog.groupBy({
        by: ["provider"],
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        _count: { _all: true },
        _sum: {
          costUsd: true,
        },
      }),
      this.prisma.loginAttempt.findMany({
        where: {
          ...(tenantId
            ? tenantEmails.length > 0
              ? { email: { in: tenantEmails } }
              : { email: "__no_user__" }
            : undefined),
          status: "locked",
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      this.prisma.loginAttempt.groupBy({
        by: ["ip", "scope"],
        where: {
          ...(tenantId
            ? tenantEmails.length > 0
              ? { email: { in: tenantEmails } }
              : { email: "__no_user__" }
            : undefined),
          ip: { not: null },
          status: "rate_limited",
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        },
        _count: { _all: true },
      }),
      this.prisma.auditLog.findMany({
        where: {
          ...(tenantId
            ? tenantEmails.length > 0
              ? { target: { in: tenantEmails } }
              : { target: "__no_user__" }
            : undefined),
          action: { in: ["portal_login_new_ip", "admin_login_new_ip"] },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    const alerts: AlertItem[] = [];

    for (const budget of budgets) {
      const usage = await this.computeBudgetUsage(
        budget.scope as BudgetScope,
        budget.scopeId,
        budget.tenantId,
      );
      if (!usage) {
        continue;
      }

      const dailyExceeded =
        budget.dailyUsd != null && usage.dailySpentUsd >= budget.dailyUsd;
      const monthlyExceeded =
        budget.monthlyUsd != null && usage.monthlySpentUsd >= budget.monthlyUsd;
      const dailyNear =
        budget.dailyUsd != null && usage.dailySpentUsd >= budget.dailyUsd * 0.8;
      const monthlyNear =
        budget.monthlyUsd != null &&
        usage.monthlySpentUsd >= budget.monthlyUsd * 0.8;

      if (!dailyExceeded && !monthlyExceeded && !dailyNear && !monthlyNear) {
        continue;
      }

      alerts.push({
        id: `budget-${budget.id}`,
        level: dailyExceeded || monthlyExceeded ? "critical" : "warning",
        type: dailyExceeded || monthlyExceeded ? "budget_exceeded" : "budget_near_limit",
        title:
          dailyExceeded || monthlyExceeded
            ? "Budget exceeded"
            : "Budget nearing limit",
        description: `${budget.scope}:${budget.scopeId} daily $${usage.dailySpentUsd.toFixed(4)} / monthly $${usage.monthlySpentUsd.toFixed(4)}`,
        scope: budget.scope as BudgetScope,
        scopeId: budget.scopeId,
        createdAt: budget.updatedAt.toISOString(),
      });
    }

    alerts.push(
      ...unhealthyKeys.map((key) => ({
        id: `provider-key-${key.id}`,
        level: (key.status === "disabled" ? "critical" : "warning") as
          | "critical"
          | "warning",
        type: "provider_key_unhealthy" as const,
        title: `Provider key ${key.name} is ${key.status}`,
        description: `${key.provider.name} · ${key.lastError ?? "Waiting for recovery"}`,
        createdAt: key.updatedAt.toISOString(),
      })),
    );

    const totalFailedSignals = failedSummary.reduce(
      (sum, row) => sum + row._count._all,
      0,
    );
    if (totalFailedSignals >= 50) {
      alerts.push({
        id: "traffic-high-variation",
        level: "warning",
        type: "high_error_rate",
        title: "Traffic variation detected",
        description: `Recent provider traffic volume reached ${totalFailedSignals} requests in the last 24h. Review request logs and upstream health.`,
        createdAt: new Date().toISOString(),
      });
    }

    alerts.push(
      ...lockedAttempts.map((attempt) => ({
        id: `login-lock-${attempt.id}`,
        level: "critical" as const,
        type: "auth_account_locked" as const,
        title: "Account temporarily locked",
        description: `${attempt.email} exceeded the allowed login retries${attempt.ip ? ` from ${attempt.ip}` : ""}.`,
        createdAt: attempt.createdAt.toISOString(),
      })),
    );

    alerts.push(
      ...throttledIps.map((entry) => ({
        id: `login-throttle-${entry.scope}-${entry.ip}`,
        level: "warning" as const,
        type: "auth_login_throttled" as const,
        title: "Login IP rate limited",
        description: `${entry.ip ?? "Unknown IP"} hit the login rate limit ${entry._count._all} times in the last hour.`,
        createdAt: new Date().toISOString(),
      })),
    );

    alerts.push(
      ...suspiciousLogins.map((audit) => {
        const metadata = this.parseMetadata(audit.metadata);
        const currentIp =
          typeof metadata.ip === "string" ? metadata.ip : "unknown";
        const previousIp =
          typeof metadata.previousIp === "string"
            ? metadata.previousIp
            : "unknown";
        return {
          id: `login-new-ip-${audit.id}`,
          level: "warning" as const,
          type: "auth_suspicious_login" as const,
          title: "New login IP detected",
          description: `${audit.target} logged in from ${currentIp}, previous IP was ${previousIp}.`,
          createdAt: audit.createdAt.toISOString(),
        };
      }),
    );

    return alerts.slice(0, 20);
  }

  async listTenantAlerts(tenantId: string) {
    return this.listCurrentAlerts(tenantId);
  }

  private async computeBudgetUsage(
    scope: BudgetScope,
    scopeId: string,
    tenantId: string,
  ) {
    const buildWhere = (since: Date) => {
      if (scope === "apiKey") {
        return {
          apiKeyId: scopeId,
          status: "completed",
          createdAt: { gte: since },
        };
      }
      if (scope === "project") {
        return {
          projectId: scopeId,
          status: "completed",
          createdAt: { gte: since },
        };
      }
      if (scope === "tenant") {
        return {
          tenantId: scopeId || tenantId,
          status: "completed",
          createdAt: { gte: since },
        };
      }
      if (scope === "provider") {
        return {
          provider: scopeId,
          status: "completed",
          createdAt: { gte: since },
        };
      }
      return {
        model: scopeId,
        status: "completed",
        createdAt: { gte: since },
      };
    };

    const [daily, monthly] = await Promise.all([
      this.prisma.requestLog.aggregate({
        where: buildWhere(this.startOfToday()),
        _sum: { costUsd: true },
      }),
      this.prisma.requestLog.aggregate({
        where: buildWhere(this.startOfMonth()),
        _sum: { costUsd: true },
      }),
    ]);

    return {
      dailySpentUsd: Number((daily._sum.costUsd ?? 0).toFixed(8)),
      monthlySpentUsd: Number((monthly._sum.costUsd ?? 0).toFixed(8)),
    };
  }

  private startOfToday() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private startOfMonth() {
    const date = new Date();
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private parseMetadata(metadata?: string | null) {
    if (!metadata) {
      return {};
    }
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
}
