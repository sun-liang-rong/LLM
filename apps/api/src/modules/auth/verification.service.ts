import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from "@nestjs/common";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import { PrismaService } from "../database/prisma.service";
import { AuthConfigService } from "./auth-config.service";

type VerificationPurpose = "register" | "reset-password";

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authConfig: AuthConfigService,
  ) {}

  async sendRegistrationCode(emailInput: string) {
    return this.sendCode(emailInput, "register");
  }

  async sendPasswordResetCode(emailInput: string) {
    return this.sendCode(emailInput, "reset-password");
  }

  async verifyRegistrationCode(emailInput: string, codeInput: string) {
    return this.verifyCode(emailInput, codeInput, "register");
  }

  async verifyPasswordResetCode(emailInput: string, codeInput: string) {
    return this.verifyCode(emailInput, codeInput, "reset-password");
  }

  async verifyRegistrationProof(input: {
    email: string;
    code?: string;
    token?: string;
  }) {
    const token = input.token?.trim();
    if (token) {
      return this.consumeRegistrationToken(input.email, token);
    }
    return this.verifyRegistrationCode(input.email, input.code ?? "");
  }

  async confirmEmailByToken(tokenInput: string) {
    const token = tokenInput.trim();
    if (!token) {
      throw new BadRequestException("Missing verification token");
    }

    const record = await this.prisma.verificationCode.findFirst({
      where: {
        tokenHash: this.hashToken(token),
        purpose: "register",
        consumedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!record) {
      throw new BadRequestException("Verification token not found");
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Verification token expired");
    }

    return {
      ok: true,
      email: record.email,
      verified: true,
    };
  }

  async verificationSettings() {
    const config = this.authConfig.verification();
    return {
      enabled: config.enabled,
      channel: config.channel,
      codeLength: config.codeLength,
      ttlSeconds: config.ttlSeconds,
      resendCooldownSeconds: config.resendCooldownSeconds,
    };
  }

  private async sendCode(
    emailInput: string,
    purpose: VerificationPurpose,
  ) {
    const email = emailInput.trim().toLowerCase();
    if (!email.includes("@")) {
      throw new BadRequestException("Invalid email");
    }

    const config = this.authConfig.verification();
    if (!config.enabled) {
      return {
        ok: true,
        enabled: false,
        message: "Verification disabled",
      };
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (purpose === "register" && existingUser) {
      throw new BadRequestException("Email already registered");
    }
    if (purpose === "reset-password" && !existingUser) {
      throw new BadRequestException("Email not found");
    }

    await this.enforceRateLimit(email, purpose);

    const code = this.generateCode(config.codeLength, config.devCode);
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + config.ttlSeconds * 1000);

    await this.prisma.verificationCode.create({
      data: {
        email,
        channel: config.channel,
        purpose,
        codeHash: this.hashCode(email, code, purpose),
        tokenHash: this.hashToken(token),
        expiresAt,
      },
    });

    if (config.channel === "email") {
      await this.sendEmailCode(email, code, token, expiresAt, purpose);
    } else {
      this.logger.warn(`SMS verification requested but not implemented for ${email}`);
    }

    return {
      ok: true,
      enabled: true,
      expiresAt: expiresAt.toISOString(),
      resendCooldownSeconds: config.resendCooldownSeconds,
      ...(config.devCode ? { devCode: code } : {}),
    };
  }

  private async verifyCode(
    emailInput: string,
    codeInput: string,
    purpose: VerificationPurpose,
  ) {
    const email = emailInput.trim().toLowerCase();
    const code = codeInput.trim();
    const config = this.authConfig.verification();
    if (!config.enabled) {
      return;
    }
    if (!code) {
      throw new BadRequestException("Missing verification code");
    }

    const record = await this.prisma.verificationCode.findFirst({
      where: {
        email,
        purpose,
        consumedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!record) {
      throw new BadRequestException("Verification code not found");
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Verification code expired");
    }
    if (record.attempts >= config.maxAttempts) {
      throw new HttpException(
        "Verification attempts exceeded",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const expected = Buffer.from(record.codeHash, "hex");
    const actual = Buffer.from(this.hashCode(email, code, purpose), "hex");
    const matched =
      expected.length === actual.length && timingSafeEqual(expected, actual);

    if (!matched) {
      await this.prisma.verificationCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException("Invalid verification code");
    }

    await this.prisma.verificationCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
  }

  private async consumeRegistrationToken(email: string, token: string) {
    const record = await this.prisma.verificationCode.findFirst({
      where: {
        email,
        tokenHash: this.hashToken(token),
        purpose: "register",
        consumedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!record) {
      throw new BadRequestException("Verification token not found");
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Verification token expired");
    }

    await this.prisma.verificationCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
  }

  private async enforceRateLimit(email: string, purpose: VerificationPurpose) {
    const config = this.authConfig.verification();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCount = await this.prisma.verificationCode.count({
      where: {
        email,
        purpose,
        createdAt: { gte: since },
      },
    });
    if (recentCount >= config.dailyLimit) {
      throw new HttpException(
        "Daily verification limit exceeded",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const latest = await this.prisma.verificationCode.findFirst({
      where: {
        email,
        purpose,
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (
      latest &&
      Date.now() - latest.createdAt.getTime() <
        config.resendCooldownSeconds * 1000
    ) {
      throw new HttpException(
        "Please wait before requesting again",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private hashCode(email: string, code: string, purpose: VerificationPurpose) {
    return createHash("sha256")
      .update(`${email}:${purpose}:${code}`)
      .digest("hex");
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private generateCode(length: number, devCode?: string) {
    if (devCode && devCode.trim().length > 0) {
      return devCode.trim();
    }
    const max = 10 ** length;
    return `${randomInt(0, max)}`.padStart(length, "0");
  }

  private async sendEmailCode(
    email: string,
    code: string,
    token: string,
    expiresAt: Date,
    purpose: VerificationPurpose,
  ) {
    const smtp = this.authConfig.smtp();
    const sender = this.authConfig.emailSender();
    const verifyUrl = `${this.authConfig.webAppUrl()}/verify-email?token=${encodeURIComponent(token)}`;
    const subject =
      purpose === "reset-password"
        ? "AI Gateway password reset code"
        : "AI Gateway verification code";
    const text =
      purpose === "reset-password"
        ? `Your password reset code is ${code}. It expires at ${expiresAt.toISOString()}.`
        : `Your verification code is ${code}. It expires at ${expiresAt.toISOString()}. You can also open ${verifyUrl} to verify directly.`;

    if (!smtp.host || !smtp.user || !smtp.password) {
      this.logger.warn(
        `SMTP not configured. ${purpose} code for ${email}: ${code}`,
      );
      return;
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.password,
      },
    });

    await transporter.sendMail({
      from: `${sender.fromName} <${sender.fromAddress}>`,
      to: email,
      subject,
      text,
      html:
        purpose === "reset-password"
          ? `<p>Your password reset code is <strong>${code}</strong>.</p><p>It expires at ${expiresAt.toISOString()}.</p>`
          : `<p>Your verification code is <strong>${code}</strong>.</p><p>It expires at ${expiresAt.toISOString()}.</p><p><a href="${verifyUrl}">Click here to verify your email directly</a></p>`,
    });
  }
}
