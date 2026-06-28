import { defineStore } from "pinia";
import type { ConsoleUser, ProjectSummary, TenantSummary } from "@gateway/shared";
import { apiFetch, getJson } from "../api/client";

export const useTenancyStore = defineStore("tenancy", {
  state: () => ({
    loading: false,
    error: "",
    tenants: [] as TenantSummary[],
    projects: [] as ProjectSummary[],
    users: [] as ConsoleUser[],
    selectedTenantId: "default",
  }),
  actions: {
    async refresh(tenantId?: string) {
      this.loading = true;
      this.error = "";
      const targetTenantId = tenantId ?? this.selectedTenantId;
      const params = targetTenantId
        ? `?tenantId=${encodeURIComponent(targetTenantId)}`
        : "";
      try {
        const [tenants, projects, users] = await Promise.all([
          getJson<TenantSummary[]>("/admin/tenants"),
          getJson<ProjectSummary[]>(`/admin/projects${params}`),
          getJson<ConsoleUser[]>(`/admin/users${params}`),
        ]);
        this.tenants = tenants;
        this.projects = projects;
        this.users = users;
        this.selectedTenantId = targetTenantId || "default";
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
    async saveTenant(payload: { id?: string; name: string }) {
      const response = await apiFetch("/admin/tenants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Save tenant failed: ${response.status}`);
      }
      await this.refresh(this.selectedTenantId);
    },
    async saveProject(payload: { id?: string; tenantId: string; name: string }) {
      const response = await apiFetch("/admin/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Save project failed: ${response.status}`);
      }
      await this.refresh(payload.tenantId);
    },
    async saveUser(payload: {
      id?: string;
      tenantId: string;
      email: string;
      name?: string;
      role?: string;
      disabled?: boolean;
    }) {
      const response = await apiFetch("/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Save user failed: ${response.status}`);
      }
      await this.refresh(payload.tenantId);
    },
  },
});
