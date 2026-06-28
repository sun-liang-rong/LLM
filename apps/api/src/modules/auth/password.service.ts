import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";

@Injectable()
export class PasswordService {
  hash(password: string) {
    const salt = randomBytes(16).toString("hex");
    const derived = scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${derived}`;
  }

  verify(password: string, storedHash: string | null | undefined) {
    if (!storedHash) {
      return false;
    }
    const [salt, expectedHex] = storedHash.split(":");
    if (!salt || !expectedHex) {
      return false;
    }

    const derived = scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, "hex");
    return (
      expected.length === derived.length &&
      timingSafeEqual(derived, expected)
    );
  }
}
