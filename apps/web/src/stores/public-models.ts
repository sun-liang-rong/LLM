import { defineStore } from "pinia";
import type { GatewayModel, ModelGroup } from "@gateway/shared";
import { getJson } from "../api/client";

export interface PublicModel extends GatewayModel {
  providerName: string;
  protocol: string;
  publicId: string;
}

export const usePublicModelsStore = defineStore("public-models", {
  state: () => ({
    loading: false,
    error: "",
    rows: [] as PublicModel[],
    groups: [] as ModelGroup[],
  }),
  actions: {
    async refresh() {
      this.loading = true;
      this.error = "";
      try {
        const [rows, groups] = await Promise.all([
          getJson<PublicModel[]>("/public/models"),
          getJson<ModelGroup[]>("/public/model-groups"),
        ]);
        this.rows = rows;
        this.groups = groups;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
  },
});
