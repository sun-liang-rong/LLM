import { defineStore } from "pinia";
import type { BillingGroup } from "@gateway/shared";
import { apiFetch, getJson, responseErrorMessage } from "../api/client";
import { useAuthStore } from "./auth";

export interface ApiKeyRow {
  id: string;
  tenantId?: string;
  projectId?: string;
  billingGroupId?: string;
  billingGroupName?: string;
  billingMultiplier?: number;
  modelGroupId?: string;
  modelGroupName?: string;
  name: string;
  key?: string;
  keyPrefix?: string;
  enabled: boolean;
  customKey?: boolean;
  ipAllowlist?: string;
  rateLimitRpm?: number;
  rateLimitTpm?: number;
  expiresAt?: string;
  lastUsedAt?: string;
  dailyBudgetUsd?: number;
  monthlyBudgetUsd?: number;
  usage?: {
    dailySpentUsd: number;
    monthlySpentUsd: number;
    dailyRemainingUsd?: number;
    monthlyRemainingUsd?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreatedApiKey extends ApiKeyRow {
  key: string;
}

interface PaginatedApiKeysResponse {
  rows: ApiKeyRow[];
  total: number;
  page: number;
  pageSize: number;
}

export const useApiKeysStore = defineStore("apiKeys", {
  state: () => ({
    loading: false,
    error: "",
    rows: [] as ApiKeyRow[],
    billingGroups: [] as BillingGroup[],
    total: 0,
    filters: {
      page: 1,
      pageSize: 10,
    },
  }),
  getters: {
    billingGroupNameById: (state) => (billingGroupId?: string) =>
      state.billingGroups.find((group) => group.id === billingGroupId)?.name ??
      billingGroupId ??
      "-",
  },
  actions: {
    async refresh() {
      this.loading = true;
      this.error = "";
      const auth = useAuthStore();
      const params = new URLSearchParams();
      params.set("page", String(this.filters.page));
      params.set("pageSize", String(this.filters.pageSize));
      try {
        const result = await getJson<PaginatedApiKeysResponse>(
          `${auth.isPortalUser ? "/console/api-keys" : "/admin/api-keys"}?${params.toString()}`,
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
    async refreshBillingGroups() {
      const auth = useAuthStore();
      this.billingGroups = await getJson<BillingGroup[]>(
        auth.isPortalUser ? "/console/billing-groups" : "/admin/billing-groups",
      );
    },
    async create(payload: {
      name: string;
      tenantId?: string;
      billingGroupId?: string;
      customKey?: string;
      ipAllowlist?: string;
      rateLimitRpm?: number;
      rateLimitTpm?: number;
      expiresAt?: string;
      dailyBudgetUsd?: number;
      monthlyBudgetUsd?: number;
    }) {
      const auth = useAuthStore();
      const response = await apiFetch(
        auth.isPortalUser ? "/console/api-keys" : "/admin/api-keys",
        {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(response, "Create API key failed"),
        );
      }
      const created = (await response.json()) as CreatedApiKey;
      await this.refresh();
      return created;
    },
    async update(id: string, payload: Record<string, unknown>) {
      const auth = useAuthStore();
      const response = await apiFetch(
        `${auth.isPortalUser ? "/console/api-keys" : "/admin/api-keys"}/${id}`,
        {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(response, "Update API key failed"),
        );
      }
      await this.refresh();
    },
    async delete(id: string) {
      const auth = useAuthStore();
      const response = await apiFetch(
        `${auth.isPortalUser ? "/console/api-keys" : "/admin/api-keys"}/${id}`,
        {
        method: "DELETE",
        },
      );
      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(response, "Delete API key failed"),
        );
      }
      await this.refresh();
    },
  },
});
