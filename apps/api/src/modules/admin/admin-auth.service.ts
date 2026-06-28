import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ConsoleRole } from "@gateway/shared";
import { PrismaService } from "../database/prisma.service";
import { AuthAuditService } from "../auth/auth-audit.service";
import { AuthSecurityService } from "../auth/auth-security.service";
import { TenantAuthService } from "../auth/tenant-auth.service";

interface AdminTokenPayload {
  sub: string;
  email: string;
  role: ConsoleRole;
  tenantId: string;
  exp: number;
  nonce: string;
}

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly security: AuthSecurityService,
    private readonly audit: AuthAuditService,
    private readonly tenantAuth: TenantAuthService,
  ) {}

  async unifiedLogin(
    body: Record<string, unknown>,
    headers?: Record<string, unknown>,
  ) {
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const expectedEmail = this.config.get<string>(
      "ADMIN_BOOTSTRAP_EMAIL",
      "admin@example.com",
    );

    if (email.toLowerCase() === expectedEmail.toLowerCase()) {
      return {
        ...(await this.login({ ...body, email: expectedEmail }, headers)),
        mode: "admin" as const,
      };
    }

    return {
      ...(await this.tenantAuth.login(body, headers)),
      mode: "portal" as const,
    };
  }

  async login(body: Record<string, unknown>, headers?: Record<string, unknown>) {
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";
    const ip = headers ? this.security.extractClientIp(headers) : undefined;

    const expectedEmail = this.config.get<string>(
      "ADMIN_BOOTSTRAP_EMAIL",
      "admin@example.com",
    );
    const expectedPassword = this.config.get<string>(
      "ADMIN_BOOTSTRAP_PASSWORD",
      "change-me",
    );

    try {
      await this.security.assertLoginAllowed({
        email,
        ip,
        scope: "admin",
      });
    } catch (error) {
      if (
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.TOO_MANY_REQUESTS
      ) {
        await this.audit.log({
          action: "admin_login_rate_limited",
          target: email,
          metadata: { ip },
        });
      }
      throw error;
    }

    if (
      email !== expectedEmail ||
      !this.safeEqual(password, expectedPassword)
    ) {
      const failure = await this.security.recordLoginFailure({
        email,
        ip,
        scope: "admin",
      });
      await this.audit.log({
        actorId: failure.actorId,
        action: "admin_login_failed",
        target: email,
        metadata: {
          ip,
          failedLoginCount: failure.failedLoginCount,
          lockedUntil: failure.lockedUntil?.toISOString(),
        },
      });
      if (failure.lockedUntil) {
        await this.audit.log({
          actorId: failure.actorId,
          action: "admin_login_locked",
          target: email,
          metadata: {
            ip,
            lockedUntil: failure.lockedUntil.toISOString(),
          },
        });
      }
      throw new UnauthorizedException("Invalid admin credentials");
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        tenantId: true,
        role: true,
      },
    });
    const ttl = this.config.get<number>("ADMIN_SESSION_TTL", 86_400);
    const payload: AdminTokenPayload = {
      sub: "admin",
      email,
      role: this.normalizeRole(user?.role),
      tenantId: user?.tenantId ?? "default",
      exp: Math.floor(Date.now() / 1000) + ttl,
      nonce: randomBytes(12).toString("base64url"),
    };

    const success = await this.security.recordLoginSuccess({
      email,
      ip,
      scope: "admin",
    });
    await this.audit.log({
      actorId: "admin",
      action: "admin_login_succeeded",
      target: email,
      metadata: { ip, tenantId: payload.tenantId, role: payload.role },
    });
    if (success.newIpDetected) {
      await this.audit.log({
        actorId: "admin",
        action: "admin_login_new_ip",
        target: email,
        metadata: {
          ip,
          previousIp: success.previousIp,
          tenantId: payload.tenantId,
          role: payload.role,
        },
      });
    }

    return {
      token: this.sign(payload),
      user: { email, role: payload.role, tenantId: payload.tenantId },
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
  }

  me(token: string | undefined) {
    const payload = this.verify(token);
    return {
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId,
    };
  }

  verify(token: string | undefined) {
    if (!token) {
      throw new UnauthorizedException("Missing admin token");
    }

    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) {
      throw new UnauthorizedException("Invalid admin token");
    }

    const expected = this.signature(encodedPayload);
    if (!this.safeEqual(signature, expected)) {
      throw new UnauthorizedException("Invalid admin token");
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as AdminTokenPayload;

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException("Admin token expired");
    }

    return payload;
  }

  extractAuthorization(headers: Record<string, unknown>) {
    const value = headers.authorization;
    const authorization = Array.isArray(value)
      ? typeof value[0] === "string"
        ? value[0]
        : undefined
      : typeof value === "string"
        ? value
        : undefined;

    if (!authorization?.toLowerCase().startsWith("bearer ")) {
      return undefined;
    }
    return authorization.slice("bearer ".length).trim();
  }

  private sign(payload: AdminTokenPayload) {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      "base64url",
    );
    return `${encodedPayload}.${this.signature(encodedPayload)}`;
  }

  private signature(encodedPayload: string) {
    return createHmac("sha256", this.secret())
      .update(encodedPayload)
      .digest("base64url");
  }

  private secret() {
    return this.config.get<string>(
      "ADMIN_JWT_SECRET",
      "development-admin-secret",
    );
  }

  private safeEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private normalizeRole(role?: string): ConsoleRole {
    if (
      role === "owner" ||
      role === "admin" ||
      role === "operator" ||
      role === "viewer"
    ) {
      return role;
    }
    return "owner";
  }
}
