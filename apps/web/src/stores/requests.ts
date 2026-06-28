import { defineStore } from "pinia";
import { getJson } from "../api/client";
import { useAuthStore } from "./auth";

export interface RequestRow {
  id: string;
  requestId: string;
  protocol: string;
  provider?: string;
  providerKeyId?: string;
  model: string;
  upstreamModel?: string;
  status: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  reasoningTokens?: number;
  estimatedTokens?: boolean;
  costUsd?: number;
  latencyMs?: number;
  retryCount: number;
  error?: string;
  createdAt: string;
}

export const useRequestsStore = defineStore("requests", {
  state: () => ({
    loading: false,
    error: "",
    rows: [] as RequestRow[],
    total: 0,
    filters: {
      status: "",
      provider: "",
      model: "",
      page: 1,
      pageSize: 20,
    },
  }),
  actions: {
    async refresh() {
      this.loading = true;
      this.error = "";
      const auth = useAuthStore();
      const params = new URLSearchParams();
      if (this.filters.status) params.set("status", this.filters.status);
      if (this.filters.provider) params.set("provider", this.filters.provider);
      if (this.filters.model) params.set("model", this.filters.model);
      params.set("page", String(this.filters.page));
      params.set("pageSize", String(this.filters.pageSize));

      try {
        const result = await getJson<{
          rows: RequestRow[];
          total: number;
          page: number;
          pageSize: number;
        }>(
          `${auth.isPortalUser ? "/console/requests" : "/admin/requests"}?${params.toString()}`,
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
    async refreshFromFirstPage() {
      this.filters.page = 1;
      await this.refresh();
    },
  },
});
