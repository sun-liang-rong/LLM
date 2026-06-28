import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHmac, randomBytes } from "node:crypto";
import type { ConsoleRole } from "@gateway/shared";
import { PrismaService } from "../database/prisma.service";
import { CreditService } from "../billing/credit.service";
import { PlatformConfigService } from "../billing/platform-config.service";
import { PricingService } from "../billing/pricing.service";
import { AuthAuditService } from "./auth-audit.service";
import { AuthConfigService } from "./auth-config.service";
import { AuthSecurityService } from "./auth-security.service";
import { PasswordService } from "./password.service";
import { VerificationService } from "./verification.service";

interface TenantTokenPayload {
  sub: string;
  email: string;
  name?: string;
  role: ConsoleRole;
  tenantId: string;
  projectId?: string;
  verifiedAt?: string;
  exp: number;
  nonce: string;
}

@Injectable()
export class TenantAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authConfig: AuthConfigService,
    private readonly security: AuthSecurityService,
    private readonly audit: AuthAuditService,
    private readonly passwords: PasswordService,
    private readonly verification: VerificationService,
    private readonly credits: CreditService,
    private readonly platformConfig: PlatformConfigService,
    private readonly pricing: PricingService,
  ) {}

  async register(body: Record<string, unknown>) {
    if (!(await this.platformConfig.registrationEnabled())) {
      throw new BadRequestException("Registration is disabled");
    }
    const email = this.requiredEmail(body.email);
    const password = this.requiredPassword(body.password);
    const verificationCode =
      this.optionalString(body.verificationCode) ?? "";
    const verificationToken =
      this.optionalString(body.verificationToken) ?? "";
    const name = this.optionalString(body.name) ?? email.split("@")[0];

    await this.verification.verifyRegistrationProof({
      email,
      code: verificationCode,
      token: verificationToken,
    });

    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException("Email already registered");
    }

    const tenant = await this.prisma.tenant.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default", name: "Default" },
    });

    const project = await this.prisma.project.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        tenantId: tenant.id,
        name: "Default Project",
      },
    });

    const billingGroup = await this.pricing.ensureDefaultGroup(tenant.id);

    const user = await this.prisma.user.create({
      data: {
        tenantId: tenant.id,
        billingGroupId: billingGroup.id,
        email,
        name,
        role: "admin",
        passwordHash: this.passwords.hash(password),
        verifiedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
        verifiedAt: true,
      },
    });

    await this.credits.grantSignupBonus(user.id, user.tenantId);

    return this.createSession({
      id: user.id,
      email: user.email,
      name: user.name ?? undefined,
      role: this.normalizeRole(user.role),
      tenantId: user.tenantId,
      projectId: project.id,
      verifiedAt: user.verifiedAt?.toISOString(),
    });
  }

  async login(body: Record<string, unknown>, headers?: Record<string, unknown>) {
    const email = this.requiredEmail(body.email);
    const password = this.requiredPassword(body.password);
    const ip = headers ? this.security.extractClientIp(headers) : undefined;

    try {
      await this.security.assertLoginAllowed({
        email,
        ip,
        scope: "portal",
      });
    } catch (error) {
      if (
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.TOO_MANY_REQUESTS
      ) {
        await this.audit.log({
          action: "portal_login_rate_limited",
          target: email,
          metadata: { ip },
        });
      }
      throw error;
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
        passwordHash: true,
        verifiedAt: true,
        disabled: true,
      },
    });

    if (!user || !this.passwords.verify(password, user.passwordHash)) {
      const failure = await this.security.recordLoginFailure({
        email,
        ip,
        scope: "portal",
      });
      await this.audit.log({
        actorId: failure.actorId,
        action: "portal_login_failed",
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
          action: "portal_login_locked",
          target: email,
          metadata: {
            ip,
            lockedUntil: failure.lockedUntil.toISOString(),
          },
        });
      }
      throw new UnauthorizedException("Invalid email or password");
    }
    if (user.disabled) {
      throw new UnauthorizedException("Account disabled");
    }

    const project = await this.prisma.project.findFirst({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    const success = await this.security.recordLoginSuccess({
      email,
      ip,
      scope: "portal",
    });
    await this.audit.log({
      actorId: user.id,
      action: "portal_login_succeeded",
      target: email,
      metadata: { ip, tenantId: user.tenantId, verifiedAt: user.verifiedAt?.toISOString() },
    });
    if (success.newIpDetected) {
      await this.audit.log({
        actorId: user.id,
        action: "portal_login_new_ip",
        target: email,
        metadata: {
          ip,
          previousIp: success.previousIp,
          tenantId: user.tenantId,
        },
      });
    }

    return this.createSession({
      id: user.id,
      email: user.email,
      name: user.name ?? undefined,
      role: this.normalizeRole(user.role),
      tenantId: user.tenantId,
      projectId: project?.id,
      verifiedAt: user.verifiedAt?.toISOString(),
    });
  }

  async sendRegistrationCode(body: Record<string, unknown>) {
    if (!(await this.platformConfig.registrationEnabled())) {
      throw new BadRequestException("Registration is disabled");
    }
    const email = this.requiredEmail(body.email);
    return this.verification.sendRegistrationCode(email);
  }

  async sendPasswordResetCode(body: Record<string, unknown>) {
    const email = this.requiredEmail(body.email);
    return this.verification.sendPasswordResetCode(email);
  }

  async resetPassword(body: Record<string, unknown>) {
    const email = this.requiredEmail(body.email);
    const password = this.requiredPassword(body.password);
    const verificationCode =
      this.optionalString(body.verificationCode) ?? "";

    await this.verification.verifyPasswordResetCode(email, verificationCode);

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException("Email not found");
    }

    await this.prisma.user.update({
      where: { email },
      data: {
        passwordHash: this.passwords.hash(password),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    await this.security.clearUserLock(email);

    return { ok: true };
  }

  async verificationSettings() {
    return {
      ...(await this.verification.verificationSettings()),
      registrationEnabled: await this.platformConfig.registrationEnabled(),
    };
  }

  async confirmEmailToken(token: string) {
    return this.verification.confirmEmailByToken(token);
  }

  async me(token: string | undefined) {
    const payload = this.verify(token);
    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        tenantId: payload.tenantId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
        verifiedAt: true,
        disabled: true,
        tenant: {
          select: { name: true },
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException("User not found");
    }
    if (user.disabled) {
      throw new UnauthorizedException("Account disabled");
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name ?? undefined,
      role: this.normalizeRole(user.role),
      tenantId: user.tenantId,
      tenantName: user.tenant.name ?? "Workspace",
      projectId: payload.projectId,
      verifiedAt: user.verifiedAt?.toISOString(),
    };
  }

  async currentPortalUser(payload: {
    sub: string;
    tenantId: string;
    projectId?: string;
  }) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        tenantId: payload.tenantId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
        verifiedAt: true,
        disabled: true,
        tenant: {
          select: { name: true },
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException("User not found");
    }
    if (user.disabled) {
      throw new UnauthorizedException("Account disabled");
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name ?? undefined,
      role: this.normalizeRole(user.role),
      tenantId: user.tenantId,
      tenantName: user.tenant.name ?? "Workspace",
      projectId: payload.projectId,
      verifiedAt: user.verifiedAt?.toISOString(),
    };
  }

  async requireVerifiedPortalUser(payload: {
    sub: string;
    tenantId: string;
    projectId?: string;
  }) {
    const user = await this.currentPortalUser(payload);
    if (!user.verifiedAt) {
      throw new BadRequestException("Please verify your email before continuing");
    }
    return user;
  }

  verify(token: string | undefined) {
    if (!token) {
      throw new UnauthorizedException("Missing user token");
    }

    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) {
      throw new UnauthorizedException("Invalid user token");
    }

    const expected = this.signature(encodedPayload);
    if (signature !== expected) {
      throw new UnauthorizedException("Invalid user token");
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as TenantTokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException("User token expired");
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

  private createSession(input: {
    id: string;
    email: string;
    name?: string;
    role: ConsoleRole;
    tenantId: string;
    projectId?: string;
    verifiedAt?: string;
  }) {
    const ttl = this.authConfig.tenantSessionTtl();
    const payload: TenantTokenPayload = {
      sub: input.id,
      email: input.email,
      name: input.name,
      role: input.role,
      tenantId: input.tenantId,
      projectId: input.projectId,
      verifiedAt: input.verifiedAt,
      exp: Math.floor(Date.now() / 1000) + ttl,
      nonce: randomBytes(12).toString("base64url"),
    };

    return {
      token: this.sign(payload),
      user: {
        id: input.id,
        email: input.email,
        name: input.name,
        role: input.role,
        tenantId: input.tenantId,
        projectId: input.projectId,
        verifiedAt: input.verifiedAt,
      },
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
  }

  private sign(payload: TenantTokenPayload) {
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
    return this.authConfig.tenantJwtSecret();
  }

  private requiredEmail(value: unknown) {
    const email = this.optionalString(value)?.toLowerCase();
    if (!email || !email.includes("@")) {
      throw new BadRequestException("Invalid email");
    }
    return email;
  }

  private requiredPassword(value: unknown) {
    const password = this.optionalString(value);
    if (!password || password.length < 6) {
      throw new BadRequestException("Password must be at least 6 characters");
    }
    return password;
  }

  private optionalString(value: unknown) {
    if (typeof value !== "string" || value.trim().length === 0) {
      return undefined;
    }
    return value.trim();
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
    return "viewer";
  }
}
