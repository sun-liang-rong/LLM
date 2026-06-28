import { defineStore } from "pinia";
import type {
  DashboardOverview,
  GatewayModel,
  ModelAlias,
  ProviderKeySummary,
  UsageSummary,
} from "@gateway/shared";
import { getJson } from "../api/client";
import { useAuthStore } from "./auth";

interface RecentRequest {
  requestId: string;
  protocol: "openai" | "anthropic";
  provider?: string;
  model: string;
  status: "started" | "completed" | "failed";
  latencyMs?: number;
  error?: string;
}

interface OverviewResponse {
  usage: UsageSummary;
  dashboard: DashboardOverview;
  providers: ProviderKeySummary[];
  models: GatewayModel[];
  aliases: ModelAlias[];
  recentRequests: RecentRequest[];
}

export interface OverviewQuery {
  range?: string;
  granularity?: string;
}

export const useOverviewStore = defineStore("overview", {
  state: () => ({
    loading: false,
    error: "",
    data: null as OverviewResponse | null,
  }),
  actions: {
    async refresh(query: OverviewQuery = {}) {
      this.loading = true;
      this.error = "";
      try {
        const auth = useAuthStore();
        const params = new URLSearchParams();
        if (query.range) {
          params.set("range", query.range);
        }
        if (query.granularity) {
          params.set("granularity", query.granularity);
        }
        const suffix = params.toString() ? `?${params.toString()}` : "";
        this.data = await getJson<OverviewResponse>(
          `${auth.isPortalUser ? "/console/overview" : "/admin/overview"}${suffix}`,
        );
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
  },
});
