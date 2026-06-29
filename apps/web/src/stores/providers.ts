import { defineStore } from "pinia";
import { apiFetch, getJson, responseErrorMessage } from "../api/client";

export interface ProviderKeyRow {
  id: string;
  name: string;
  status: string;
  weight: number;
  rpmLimit?: number;
  tpmLimit?: number;
  dailyBudgetUsd?: number;
  windowSizeMinutes?: number;
  windowRequestLimit?: number;
  windowStartedAt?: string;
  windowRequestCount?: number;
  windowRemaining?: number;
  windowResetAt?: string;
  lastError?: string;
  cooldownUntil?: string;
  createdAt: string;
}

export interface ProviderRow {
  id: string;
  provider: string;
  slug?: string;
  protocol?: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  keys: ProviderKeyRow[];
}

interface PaginatedProvidersResponse {
  rows: ProviderRow[];
  total: number;
  page: number;
  pageSize: number;
}

export const useProvidersStore = defineStore("providers", {
  state: () => ({
    loading: false,
    error: "",
    rows: [] as ProviderRow[],
    total: 0,
    filters: {
      page: 1,
      pageSize: 5,
    },
    allProviders: [] as ProviderRow[],
  }),
  actions: {
    async refresh() {
      this.loading = true;
      this.error = "";
      const params = new URLSearchParams();
      params.set("page", String(this.filters.page));
      params.set("pageSize", String(this.filters.pageSize));
      try {
        const result = await getJson<PaginatedProvidersResponse>(
          `/admin/providers?${params.toString()}`,
        );
        this.rows = result.rows;
        this.total = result.total;
        this.filters.page = result.page;
        this.filters.pageSize = result.pageSize;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
    async refreshAll() {
      this.allProviders = await getJson<ProviderRow[]>("/admin/providers?all=true");
    },
    async saveProvider(payload: {
      id?: string;
      name: string;
      slug: string;
      protocol: string;
      baseUrl: string;
      enabled: boolean;
    }) {
      const response = await apiFetch("/admin/providers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await responseErrorMessage(response, "Save provider failed"));
      }
      const saved = (await response.json()) as ProviderRow;
      await this.refresh();
      void this.refreshAll();
      return saved;
    },
    async deleteProvider(id: string) {
      const response = await apiFetch(`/admin/providers/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`Delete provider failed: ${response.status}`);
      }
      await this.refresh();
      void this.refreshAll();
    },
    async createKey(payload: {
      providerId: string;
      name: string;
      secret: string;
      weight: number;
      rpmLimit?: number;
      tpmLimit?: number;
      dailyBudgetUsd?: number;
      windowSizeMinutes?: number;
      windowRequestLimit?: number;
    }) {
      await apiFetch("/admin/provider-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }).then((response) => {
        if (!response.ok) {
          throw new Error(`Create key failed: ${response.status}`);
        }
      });
      await this.refresh();
      void this.refreshAll();
    },
    async updateKey(id: string, payload: Record<string, unknown>) {
      await apiFetch(`/admin/provider-keys/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }).then((response) => {
        if (!response.ok) {
          throw new Error(`Update key failed: ${response.status}`);
        }
      });
      await this.refresh();
      void this.refreshAll();
    },
    async resetKey(id: string) {
      await apiFetch(`/admin/provider-keys/${id}/reset`, {
        method: "POST",
      }).then((response) => {
        if (!response.ok) {
          throw new Error(`Reset key failed: ${response.status}`);
        }
      });
      await this.refresh();
      void this.refreshAll();
    },
    async resetProviderKeys(id: string) {
      await apiFetch(`/admin/providers/${id}/reset-keys`, {
        method: "POST",
      }).then((response) => {
        if (!response.ok) {
          throw new Error(`Reset provider keys failed: ${response.status}`);
        }
      });
      await this.refresh();
      void this.refreshAll();
    },
    async deleteKey(id: string) {
      await apiFetch(`/admin/provider-keys/${id}`, {
        method: "DELETE",
      }).then((response) => {
        if (!response.ok) {
          throw new Error(`Delete key failed: ${response.status}`);
        }
      });
      await this.refresh();
      void this.refreshAll();
    },
  },
});
