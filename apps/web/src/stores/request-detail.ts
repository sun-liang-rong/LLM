import { defineStore } from "pinia";
import type { RequestDetail } from "@gateway/shared";
import { getJson } from "../api/client";

export const useRequestDetailStore = defineStore("requestDetail", {
  state: () => ({
    loading: false,
    error: "",
    detail: null as RequestDetail | null,
  }),
  actions: {
    async open(requestId: string) {
      this.loading = true;
      this.error = "";
      try {
        this.detail = await getJson<RequestDetail | null>(
          `/console/requests/${encodeURIComponent(requestId)}`,
        );
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
    clear() {
      this.detail = null;
      this.error = "";
    },
  },
});
