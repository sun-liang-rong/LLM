import { defineStore } from "pinia";
import type {
  AdminCreditUser,
  CheckInResult,
  CheckInStatus,
  CreditAccountSummary,
  CreditLedgerEntry,
} from "@gateway/shared";
import { apiFetch, getJson, responseErrorMessage } from "../api/client";
import { useAuthStore } from "./auth";

interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const useCreditsStore = defineStore("credits", {
  state: () => ({
    loading: false,
    saving: false,
    error: "",
    summary: null as CreditAccountSummary | null,
    checkInStatus: null as CheckInStatus | null,
    ledgerRows: [] as CreditLedgerEntry[],
    ledgerTotal: 0,
    ledgerFilters: {
      page: 1,
      pageSize: 20,
      userId: "",
    },
    userRows: [] as AdminCreditUser[],
    userTotal: 0,
    userFilters: {
      page: 1,
      pageSize: 20,
      email: "",
    },
  }),
  actions: {
    async refreshSummary() {
      const auth = useAuthStore();
      if (!auth.isPortalUser) return;
      this.summary = await getJson<CreditAccountSummary>("/console/credits");
      this.checkInStatus = await getJson<CheckInStatus>("/console/check-in/status");
    },
    async refreshLedger() {
      this.loading = true;
      this.error = "";
      try {
        const auth = useAuthStore();
        const params = new URLSearchParams();
        params.set("page", String(this.ledgerFilters.page));
        params.set("pageSize", String(this.ledgerFilters.pageSize));
        if (!auth.isPortalUser && this.ledgerFilters.userId) {
          params.set("userId", this.ledgerFilters.userId);
        }
        const page = await getJson<Page<CreditLedgerEntry>>(
          `${auth.isPortalUser ? "/console/credits/ledger" : "/admin/credits/ledger"}?${params.toString()}`,
        );
        this.ledgerRows = page.rows;
        this.ledgerTotal = page.total;
        this.ledgerFilters.page = page.page;
        this.ledgerFilters.pageSize = page.pageSize;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
    async refreshUsers() {
      this.loading = true;
      this.error = "";
      try {
        const params = new URLSearchParams();
        params.set("page", String(this.userFilters.page));
        params.set("pageSize", String(this.userFilters.pageSize));
        if (this.userFilters.email) {
          params.set("email", this.userFilters.email);
        }
        const page = await getJson<Page<AdminCreditUser>>(
          `/admin/credits/users?${params.toString()}`,
        );
        this.userRows = page.rows;
        this.userTotal = page.total;
        this.userFilters.page = page.page;
        this.userFilters.pageSize = page.pageSize;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
    async checkIn() {
      this.saving = true;
      try {
        await this.refreshSummary();
        const response = await apiFetch("/console/check-in", { method: "POST" });
        if (!response.ok) {
          throw new Error(await responseErrorMessage(response, "Check-in failed"));
        }
        const result = (await response.json()) as CheckInResult;
        this.summary = result.account;
        this.checkInStatus = {
          checkedIn: result.checkedIn,
          checkInDate: result.checkInDate,
          rewardUsd: result.rewardUsd,
          nextCheckInDate: result.nextCheckInDate,
        };
        await Promise.all([this.refreshSummary(), this.refreshLedger()]);
        return result;
      } finally {
        this.saving = false;
      }
    },
    async adjust(payload: {
      userId: string;
      amountUsd: number;
      description?: string;
    }) {
      const response = await apiFetch("/admin/credits/adjust", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await responseErrorMessage(response, "Adjust credits failed"));
      }
      await Promise.all([this.refreshUsers(), this.refreshLedger()]);
    },
    async resetCheckIn(userId: string) {
      const response = await apiFetch(
        `/admin/credits/users/${userId}/reset-check-in`,
        { method: "POST" },
      );
      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(response, "Reset check-in failed"),
        );
      }
      const result = (await response.json()) as { reset?: boolean };
      await Promise.all([this.refreshUsers(), this.refreshLedger()]);
      return result;
    },
    async setUserDisabled(userId: string, disabled: boolean) {
      const response = await apiFetch(`/admin/users/${userId}/disabled`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ disabled }),
      });
      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(response, "Update user status failed"),
        );
      }
      await this.refreshUsers();
    },
  },
});
