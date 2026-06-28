import { defineStore } from "pinia";
import type { AlertItem, BudgetRule, BudgetUsageEntry } from "@gateway/shared";
import { apiFetch, getJson, responseErrorMessage } from "../api/client";
import { useAuthStore } from "./auth";

export const useBudgetsStore = defineStore("budgets", {
  state: () => ({
    loading: false,
    error: "",
    rules: [] as BudgetRule[],
    usage: [] as BudgetUsageEntry[],
    alerts: [] as AlertItem[],
  }),
  actions: {
    async refresh(tenantId?: string) {
      this.loading = true;
      this.error = "";
      const auth = useAuthStore();
      const params =
        tenantId && !auth.isPortalUser
          ? `?tenantId=${encodeURIComponent(tenantId)}`
          : "";
      const base = auth.isPortalUser ? "/console" : "/admin";
      try {
        const [rules, usage, alerts] = await Promise.all([
          getJson<BudgetRule[]>(`${base}/budgets${params}`),
          getJson<BudgetUsageEntry[]>(`${base}/budgets/usage${params}`),
          getJson<AlertItem[]>(`${base}/alerts${params}`),
        ]);
        this.rules = rules;
        this.usage = usage;
        this.alerts = alerts;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
    async save(payload: {
      id?: string;
      tenantId: string;
      scope: string;
      scopeId: string;
      dailyUsd?: number;
      monthlyUsd?: number;
      action?: string;
      downgradeModelAlias?: string;
    }) {
      const auth = useAuthStore();
      const response = await apiFetch(
        auth.isPortalUser ? "/console/budgets" : "/admin/budgets",
        {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(response, "Save budget failed"),
        );
      }
      await this.refresh(payload.tenantId);
    },
    async delete(id: string, tenantId?: string) {
      const auth = useAuthStore();
      const response = await apiFetch(
        `${auth.isPortalUser ? "/console/budgets" : "/admin/budgets"}/${id}`,
        {
        method: "DELETE",
        },
      );
      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(response, "Delete budget failed"),
        );
      }
      await this.refresh(tenantId);
    },
  },
});
