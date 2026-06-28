import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import { AdminAuthService } from "./admin-auth.service";

@Controller("admin/auth")
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post("login")
  login(
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, unknown>,
  ) {
    return this.auth.login(body, headers);
  }

  @Post("unified-login")
  unifiedLogin(
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, unknown>,
  ) {
    return this.auth.unifiedLogin(body, headers);
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
