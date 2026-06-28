import { defineStore } from "pinia";
import type {
  ModelAlias,
  RouteCandidateScore,
  RouteTarget,
  UpstreamProtocol,
} from "@gateway/shared";
import { apiFetch, getJson } from "../api/client";

export interface SaveModelAliasPayload {
  alias: string;
  mode: ModelAlias["mode"];
  providerId?: string;
  upstreamModel?: string;
  enabled?: boolean;
  targets?: RouteTarget[];
}

export interface ModelRouteExplain {
  requestedModel: string;
  providerId: string;
  providerSlug: string;
  upstreamProtocol: UpstreamProtocol;
  upstreamModel: string;
  baseUrl: string;
  endpoint: string;
  reason: string;
  availableKeys: number;
  keyStats: Record<string, number>;
  mode: ModelAlias["mode"];
  candidateCount: number;
  targets: RouteTarget[];
  candidates?: RouteCandidateScore[];
}

export interface ModelRouteTestResult {
  ok: boolean;
  latencyMs: number;
  route: ModelRouteExplain;
  providerKey?: {
    id: string;
    name: string;
  };
  statusCode?: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  error?: string;
}

interface PaginatedAliasesResponse {
  rows: ModelAlias[];
  total: number;
  page: number;
  pageSize: number;
}

export const useModelAliasesStore = defineStore("model-aliases", {
  state: () => ({
    loading: false,
    error: "",
    rows: [] as ModelAlias[],
    total: 0,
    filters: {
      page: 1,
      pageSize: 10,
    },
  }),
  actions: {
    async refresh() {
      this.loading = true;
      this.error = "";
      const params = new URLSearchParams();
      params.set("page", String(this.filters.page));
      params.set("pageSize", String(this.filters.pageSize));
      try {
        const result = await getJson<PaginatedAliasesResponse>(
          `/admin/model-aliases?${params.toString()}`,
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
    async save(payload: SaveModelAliasPayload) {
      const response = await apiFetch("/admin/model-aliases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Save model route failed: ${response.status}`);
      }
      await this.refresh();
    },
    async delete(alias: string) {
      const response = await apiFetch(
        `/admin/model-aliases/${encodeURIComponent(alias)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error(`Delete model route failed: ${response.status}`);
      }
      await this.refresh();
    },
    async explain(model: string) {
      return getJson<ModelRouteExplain>(
        `/admin/model-aliases/${encodeURIComponent(model)}/explain`,
      );
    },
    async test(model: string) {
      const response = await apiFetch(
        `/admin/model-aliases/${encodeURIComponent(model)}/test`,
        { method: "POST" },
      );
      if (!response.ok) {
        throw new Error(`Test model route failed: ${response.status}`);
      }
      return response.json() as Promise<ModelRouteTestResult>;
    },
  },
});
