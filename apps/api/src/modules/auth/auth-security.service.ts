import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../database/prisma.service";

type LoginScope = "portal" | "admin";

@Injectable()
export class AuthSecurityService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  loginLockThreshold() {
    return this.config.get<number>("AUTH_LOGIN_LOCK_THRESHOLD", 5);
  }

  loginLockMinutes() {
    return this.config.get<number>("AUTH_LOGIN_LOCK_MINUTES", 15);
  }

  ipWindowSeconds() {
    return this.config.get<number>("AUTH_LOGIN_IP_WINDOW_SECONDS", 600);
  }

  ipMaxAttempts() {
    return this.config.get<number>("AUTH_LOGIN_IP_MAX_ATTEMPTS", 10);
  }

  async assertLoginAllowed(input: {
    email: string;
    ip?: string;
    scope: LoginScope;
  }) {
    if (input.ip) {
      const recentAttempts = await this.prisma.loginAttempt.count({
        where: {
          ip: input.ip,
          scope: input.scope,
          createdAt: {
            gte: new Date(Date.now() - this.ipWindowSeconds() * 1000),
          },
          status: {
            in: ["failed", "locked", "rate_limited"],
          },
        },
      });

      if (recentAttempts >= this.ipMaxAttempts()) {
        await this.prisma.loginAttempt.create({
          data: {
            email: input.email,
            ip: input.ip,
            scope: input.scope,
            status: "rate_limited",
            reason: "ip_window_limit",
          },
        });
        throw new HttpException(
          "Too many login attempts from this IP",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    await this.assertUserLoginAllowed(input.email);
  }

  async assertUserLoginAllowed(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        lockedUntil: true,
      },
    });

    if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException("Account temporarily locked");
    }
  }

  async recordLoginFailure(input: {
    email: string;
    ip?: string;
    scope: LoginScope;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        failedLoginCount: true,
      },
    });

    const nextCount = (user?.failedLoginCount ?? 0) + 1;
    const shouldLock = Boolean(user) && nextCount >= this.loginLockThreshold();
    const lockedUntil = shouldLock
      ? new Date(Date.now() + this.loginLockMinutes() * 60 * 1000)
      : undefined;

    if (user) {
      await this.prisma.user.update({
        where: { email: input.email },
        data: {
          failedLoginCount: nextCount,
          lockedUntil,
        },
      });
    }

    await this.prisma.loginAttempt.create({
      data: {
        email: input.email,
        ip: input.ip,
        scope: input.scope,
        status: shouldLock ? "locked" : "failed",
        reason: shouldLock ? "account_locked" : "invalid_credentials",
      },
    });

    return {
      actorId: user?.id,
      failedLoginCount: nextCount,
      lockedUntil,
    };
  }

  async recordLoginSuccess(input: {
    email: string;
    ip?: string;
    scope: LoginScope;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        lastLoginIp: true,
      },
    });

    await this.prisma.user.updateMany({
      where: { email: input.email },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: input.ip,
      },
    });

    await this.prisma.loginAttempt.create({
      data: {
        email: input.email,
        ip: input.ip,
        scope: input.scope,
        status: "success",
        reason:
          user?.lastLoginIp && input.ip && user.lastLoginIp !== input.ip
            ? "new_ip"
            : "authenticated",
      },
    });

    return {
      actorId: user?.id,
      previousIp: user?.lastLoginIp ?? undefined,
      newIpDetected:
        Boolean(user?.lastLoginIp) &&
        Boolean(input.ip) &&
        user?.lastLoginIp !== input.ip,
    };
  }

  async clearUserLock(email: string) {
    await this.prisma.user.updateMany({
      where: { email },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
  }

  extractClientIp(headers: Record<string, unknown>) {
    const forwarded = this.header(headers["x-forwarded-for"]);
    if (forwarded) {
      return forwarded.split(",")[0]?.trim() || undefined;
    }
    return (
      this.header(headers["x-real-ip"]) ??
      this.header(headers["cf-connecting-ip"]) ??
      this.header(headers["fastly-client-ip"])
    );
  }

  private header(value: unknown) {
    if (Array.isArray(value)) {
      return typeof value[0] === "string" ? value[0] : undefined;
    }
    return typeof value === "string" ? value : undefined;
  }
}
