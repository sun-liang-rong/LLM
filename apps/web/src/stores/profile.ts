import { defineStore } from "pinia";
import type { PortalProfile } from "@gateway/shared";
import { getJson } from "../api/client";

export const useProfileStore = defineStore("profile", {
  state: () => ({
    loading: false,
    error: "",
    data: null as PortalProfile | null,
  }),
  actions: {
    async refresh() {
      this.loading = true;
      this.error = "";
      try {
        this.data = await getJson<PortalProfile>("/console/profile");
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
  },
});
