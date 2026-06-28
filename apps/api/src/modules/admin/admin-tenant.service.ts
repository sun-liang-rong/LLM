import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  ConsoleRole,
  ConsoleUser,
  ProjectSummary,
  TenantSummary,
} from "@gateway/shared";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class AdminTenantService {
  constructor(private readonly prisma: PrismaService) {}

  async listTenants(): Promise<TenantSummary[]> {
    const tenants = await this.prisma.tenant.findMany({
      include: {
        users: true,
        projects: {
          include: {
            apiKeys: true,
          },
        },
        apiKeys: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      createdAt: tenant.createdAt.toISOString(),
      updatedAt: tenant.updatedAt.toISOString(),
      projectCount: tenant.projects.length,
      userCount: tenant.users.length,
      apiKeyCount: tenant.apiKeys.length,
    }));
  }

  async saveTenant(body: { id?: string; name: string }) {
    const name = this.requiredString(body.name, "name");
    const saved = body.id
      ? await this.prisma.tenant.update({
          where: { id: body.id },
          data: { name },
        })
      : await this.prisma.tenant.create({
          data: { name },
        });

    return {
      id: saved.id,
      name: saved.name,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
      projectCount: 0,
      userCount: 0,
      apiKeyCount: 0,
    } satisfies TenantSummary;
  }

  async listProjects(tenantId?: string): Promise<ProjectSummary[]> {
    const rows = await this.prisma.project.findMany({
      where: tenantId ? { tenantId } : undefined,
      include: {
        apiKeys: true,
      },
      orderBy: [{ tenantId: "asc" }, { createdAt: "asc" }],
    });

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      apiKeyCount: row.apiKeys.length,
    }));
  }

  async saveProject(body: { id?: string; tenantId: string; name: string }) {
    const tenantId = this.requiredString(body.tenantId, "tenantId");
    const name = this.requiredString(body.name, "name");
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    const saved = body.id
      ? await this.prisma.project.update({
          where: { id: body.id },
          data: { tenantId, name },
        })
      : await this.prisma.project.create({
          data: { tenantId, name },
        });

    return {
      id: saved.id,
      tenantId: saved.tenantId,
      name: saved.name,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
      apiKeyCount: 0,
    } satisfies ProjectSummary;
  }

  async listUsers(tenantId?: string): Promise<ConsoleUser[]> {
    const rows = await this.prisma.user.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: [{ tenantId: "asc" }, { createdAt: "asc" }],
    });

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      email: row.email,
      name: row.name ?? undefined,
      role: this.normalizeRole(row.role),
      disabled: row.disabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async saveUser(body: {
    id?: string;
    tenantId: string;
    email: string;
    name?: string;
    role?: ConsoleRole;
    disabled?: boolean;
  }) {
    const tenantId = this.requiredString(body.tenantId, "tenantId");
    const email = this.requiredString(body.email, "email").toLowerCase();
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    const saved = body.id
      ? await this.prisma.user.update({
          where: { id: body.id },
          data: {
            tenantId,
            email,
            name: this.optionalString(body.name),
            role: body.role ?? "viewer",
            disabled: body.disabled ?? false,
          },
        })
      : await this.prisma.user.create({
          data: {
            tenantId,
            email,
            name: this.optionalString(body.name),
            role: body.role ?? "viewer",
            disabled: body.disabled ?? false,
          },
        });

    return {
      id: saved.id,
      tenantId: saved.tenantId,
      email: saved.email,
      name: saved.name ?? undefined,
      role: this.normalizeRole(saved.role),
      disabled: saved.disabled,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    } satisfies ConsoleUser;
  }

  async setUserDisabled(userId: string, disabled: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const saved = await this.prisma.user.update({
      where: { id: userId },
      data: { disabled },
    });

    return {
      id: saved.id,
      tenantId: saved.tenantId,
      email: saved.email,
      name: saved.name ?? undefined,
      role: this.normalizeRole(saved.role),
      disabled: saved.disabled,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    } satisfies ConsoleUser;
  }

  private requiredString(value: unknown, field: string) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new BadRequestException(`Missing required field: ${field}`);
    }
    return value.trim();
  }

  private optionalString(value: unknown) {
    if (typeof value !== "string" || value.trim().length === 0) {
      return undefined;
    }
    return value.trim();
  }

  private normalizeRole(role: string): ConsoleRole {
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
