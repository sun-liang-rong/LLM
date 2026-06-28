import { defineStore } from "pinia";
import type { BillingGroup, GatewayModel, ModelGroup } from "@gateway/shared";
import { apiFetch, getJson, responseErrorMessage } from "../api/client";

export interface ModelPrice extends GatewayModel {
  id: string;
  providerId: string;
  providerName: string;
  protocol: string;
  publicId: string;
}

export const usePricingStore = defineStore("pricing", {
  state: () => ({
    loading: false,
    error: "",
    modelPrices: [] as ModelPrice[],
    modelGroups: [] as ModelGroup[],
    billingGroups: [] as BillingGroup[],
  }),
  actions: {
    async refresh() {
      this.loading = true;
      this.error = "";
      try {
        const [modelPrices, modelGroups, billingGroups] = await Promise.all([
          getJson<ModelPrice[]>("/admin/model-prices"),
          getJson<ModelGroup[]>("/admin/model-groups"),
          getJson<BillingGroup[]>("/admin/billing-groups"),
        ]);
        this.modelPrices = modelPrices;
        this.modelGroups = modelGroups;
        this.billingGroups = billingGroups;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
    async saveModel(payload: Partial<ModelPrice>) {
      const response = await apiFetch("/admin/model-prices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await responseErrorMessage(response, "Save model failed"));
      }
      await this.refresh();
    },
    async saveModelGroup(payload: Partial<ModelGroup>) {
      const response = await apiFetch("/admin/model-groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(response, "Save model group failed"),
        );
      }
      await this.refresh();
    },
    async deleteModelGroup(id: string) {
      const response = await apiFetch(`/admin/model-groups/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(response, "Delete model group failed"),
        );
      }
      await this.refresh();
    },
    async deleteModel(id: string) {
      const response = await apiFetch(`/admin/model-prices/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await responseErrorMessage(response, "Delete model failed"));
      }
      await this.refresh();
    },
    async saveBillingGroup(payload: Partial<BillingGroup>) {
      const response = await apiFetch("/admin/billing-groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(response, "Save billing group failed"),
        );
      }
      await this.refresh();
    },
    async deleteBillingGroup(id: string) {
      const response = await apiFetch(`/admin/billing-groups/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(response, "Delete billing group failed"),
        );
      }
      await this.refresh();
    },
  },
});
