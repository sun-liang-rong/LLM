import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ConsoleRole } from "@gateway/shared";
import type { FastifyRequest } from "fastify";
import { AdminAuthService } from "./admin-auth.service";
import { ADMIN_ROLES_KEY } from "./admin-roles.decorator";

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const payload = this.auth.verify(
      this.auth.extractAuthorization(request.headers as Record<string, unknown>),
    );
    const requiredRoles = this.reflector.getAllAndOverride<ConsoleRole[]>(
      ADMIN_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredRoles && requiredRoles.length > 0) {
      const currentLevel = this.roleLevel(payload.role);
      const allowed = requiredRoles.some(
        (role) => currentLevel >= this.roleLevel(role),
      );
      if (!allowed) {
        throw new ForbiddenException("Insufficient admin role");
      }
    }

    Object.assign(request, {
      adminUser: payload,
    });
    return true;
  }

  private roleLevel(role: ConsoleRole) {
    if (role === "owner") return 4;
    if (role === "admin") return 3;
    if (role === "operator") return 2;
    return 1;
  }
}
