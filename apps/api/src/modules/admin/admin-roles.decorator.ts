import { SetMetadata } from "@nestjs/common";
import type { ConsoleRole } from "@gateway/shared";

export const ADMIN_ROLES_KEY = "admin_roles";

export const AdminRoles = (...roles: ConsoleRole[]) =>
  SetMetadata(ADMIN_ROLES_KEY, roles);
