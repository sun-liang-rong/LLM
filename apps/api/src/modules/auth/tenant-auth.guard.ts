import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { TenantAuthService } from "./tenant-auth.service";

@Injectable()
export class TenantAuthGuard implements CanActivate {
  constructor(private readonly auth: TenantAuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const payload = this.auth.verify(
      this.auth.extractAuthorization(request.headers as Record<string, unknown>),
    );
    await this.auth.currentPortalUser(payload);
    Object.assign(request, { tenantUser: payload });
    return true;
  }
}
