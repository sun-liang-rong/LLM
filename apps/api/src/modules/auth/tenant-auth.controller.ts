import { Body, Controller, Get, Headers, Post, Query } from "@nestjs/common";
import { TenantAuthService } from "./tenant-auth.service";

@Controller("auth")
export class TenantAuthController {
  constructor(private readonly auth: TenantAuthService) {}

  @Post("register")
  register(@Body() body: Record<string, unknown>) {
    return this.auth.register(body);
  }

  @Post("send-registration-code")
  sendRegistrationCode(@Body() body: Record<string, unknown>) {
    return this.auth.sendRegistrationCode(body);
  }

  @Post("send-password-reset-code")
  sendPasswordResetCode(@Body() body: Record<string, unknown>) {
    return this.auth.sendPasswordResetCode(body);
  }

  @Get("verify-email")
  verifyEmail(@Query("token") token?: string) {
    return this.auth.confirmEmailToken(token ?? "");
  }

  @Post("login")
  login(
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, unknown>,
  ) {
    return this.auth.login(body, headers);
  }

  @Post("reset-password")
  resetPassword(@Body() body: Record<string, unknown>) {
    return this.auth.resetPassword(body);
  }

  @Get("verification-settings")
  verificationSettings() {
    return this.auth.verificationSettings();
  }

  @Get("me")
  me(@Headers() headers: Record<string, unknown>) {
    return this.auth.me(this.auth.extractAuthorization(headers));
  }

  @Post("logout")
  logout() {
    return { ok: true };
  }
}
