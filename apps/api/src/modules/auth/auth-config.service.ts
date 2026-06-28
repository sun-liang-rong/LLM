import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface VerificationConfig {
  enabled: boolean;
  channel: "email" | "sms";
  codeLength: number;
  ttlSeconds: number;
  resendCooldownSeconds: number;
  maxAttempts: number;
  dailyLimit: number;
  devCode?: string;
}

export interface EmailSenderConfig {
  fromName: string;
  fromAddress: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}

@Injectable()
export class AuthConfigService {
  constructor(private readonly config: ConfigService) {}

  tenantSessionTtl() {
    return this.numberValue("TENANT_SESSION_TTL", 86_400);
  }

  tenantJwtSecret() {
    return this.config.get<string>(
      "TENANT_JWT_SECRET",
      "development-tenant-secret",
    );
  }

  verification(): VerificationConfig {
    return {
      enabled: this.config.get<string>("AUTH_VERIFICATION_ENABLED", "false") === "true",
      channel:
        this.config.get<string>("AUTH_VERIFICATION_CHANNEL", "email") === "sms"
          ? "sms"
          : "email",
      codeLength: this.numberValue("AUTH_VERIFICATION_CODE_LENGTH", 6),
      ttlSeconds: this.numberValue("AUTH_VERIFICATION_TTL", 300),
      resendCooldownSeconds: this.numberValue(
        "AUTH_VERIFICATION_RESEND_COOLDOWN",
        60,
      ),
      maxAttempts: this.numberValue("AUTH_VERIFICATION_MAX_ATTEMPTS", 5),
      dailyLimit: this.numberValue("AUTH_VERIFICATION_DAILY_LIMIT", 10),
      devCode: this.config.get<string>("AUTH_VERIFICATION_DEV_CODE", ""),
    };
  }

  emailSender(): EmailSenderConfig {
    return {
      fromName: this.config.get<string>("AUTH_EMAIL_FROM_NAME", "AI Gateway"),
      fromAddress: this.config.get<string>(
        "AUTH_EMAIL_FROM_ADDRESS",
        "no-reply@example.com",
      ),
    };
  }

  smtp(): SmtpConfig {
    return {
      host: this.config.get<string>("SMTP_HOST", ""),
      port: this.numberValue("SMTP_PORT", 587),
      secure: this.config.get<string>("SMTP_SECURE", "false") === "true",
      user: this.config.get<string>("SMTP_USER", ""),
      password: this.config.get<string>("SMTP_PASSWORD", ""),
    };
  }

  webAppUrl() {
    return this.config.get<string>("WEB_APP_URL", "http://localhost:5173");
  }

  apiBaseUrl() {
    return this.config.get<string>("API_BASE_URL", "http://localhost:3000");
  }

  private numberValue(key: string, fallback: number) {
    const value = this.config.get<unknown>(key);
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
