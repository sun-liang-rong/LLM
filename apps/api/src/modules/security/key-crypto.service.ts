import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class KeyCryptoService {
  constructor(private readonly config: ConfigService) {}

  encrypt(plainText: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    const encrypted = Buffer.concat([
      cipher.update(plainText, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
      "v1",
      iv.toString("base64url"),
      tag.toString("base64url"),
      encrypted.toString("base64url"),
    ].join(".");
  }

  decrypt(payload: string) {
    const [version, iv, tag, encrypted] = payload.split(".");
    if (version !== "v1" || !iv || !tag || !encrypted) {
      throw new Error("Unsupported encrypted key payload");
    }

    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key(),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }

  fingerprint(secret: string) {
    if (secret.length <= 8) {
      return "****";
    }
    return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
  }

  private key() {
    const secret = this.config.get<string>(
      "KEY_ENCRYPTION_SECRET",
      "development-only-change-me",
    );
    return createHash("sha256").update(secret).digest();
  }
}
