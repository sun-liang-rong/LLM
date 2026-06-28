import { defineStore } from "pinia";
import type { PortalUser } from "@gateway/shared";
import { apiFetch, getJson, responseErrorMessage } from "../api/client";
import {
  clearAdminToken,
  clearAllTokens,
  clearPortalToken,
  getAdminToken,
  getPortalOnboardingPending,
  hasAdminToken,
  hasPortalToken,
  setAdminToken,
  setPortalOnboardingPending,
  setPortalToken,
} from "../utils/auth-session";

interface AdminUser {
  email: string;
  role: string;
  tenantId: string;
}

interface VerificationSettings {
  enabled: boolean;
  channel: "email" | "sms";
  codeLength: number;
  ttlSeconds: number;
  resendCooldownSeconds: number;
}

function roleLevel(role?: string) {
  if (role === "owner") return 4;
  if (role === "admin") return 3;
  if (role === "operator") return 2;
  return 1;
}

export const useAuthStore = defineStore("auth", {
  state: () => ({
    adminUser: null as AdminUser | null,
    portalUser: null as PortalUser | null,
    verificationSettings: null as VerificationSettings | null,
    loading: false,
    error: "",
    portalOnboardingPending: getPortalOnboardingPending(),
    mode: (hasPortalToken()
      ? "portal"
      : hasAdminToken()
        ? "admin"
        : "guest") as "guest" | "admin" | "portal",
  }),
  getters: {
    user(state) {
      return state.mode === "portal" ? state.portalUser : state.adminUser;
    },
    isAuthenticated: (state) =>
      state.mode === "portal" ? hasPortalToken() : hasAdminToken(),
    isPortalUser: (state) => state.mode === "portal",
    isAdminConsole: (state) => state.mode === "admin",
    canManageTenancy: (state) =>
      state.mode === "admin" && roleLevel(state.adminUser?.role) >= 4,
    canManageBudgets: (state) => {
      if (state.mode === "portal") return true;
      return roleLevel(state.adminUser?.role) >= 3;
    },
    canManageApiKeys: (state) => {
      if (state.mode === "portal") return true;
      return roleLevel(state.adminUser?.role) >= 3;
    },
    canOperateRoutes: (state) =>
      state.mode === "admin" && roleLevel(state.adminUser?.role) >= 2,
    isReadOnly: (state) =>
      state.mode === "admin" ? roleLevel(state.adminUser?.role) <= 1 : false,
    tenantId(state) {
      return state.mode === "portal"
        ? state.portalUser?.tenantId
        : state.adminUser?.tenantId;
    },
    tenantName(state) {
      return state.portalUser?.tenantName ?? state.adminUser?.tenantId ?? "";
    },
  },
  actions: {
    async loginWithMode(
      email: string,
      password: string,
      mode: "portal" | "admin",
    ) {
      const endpoint = mode === "admin" ? "/admin/auth/login" : "/auth/login";
      const response = await apiFetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(response, "Invalid email or password"),
        );
      }
      const data = (await response.json()) as {
        token: string;
        user: AdminUser | PortalUser;
      };
      clearAllTokens();
      if (mode === "admin") {
        setAdminToken(data.token);
        setPortalOnboardingPending(false);
        this.portalOnboardingPending = false;
        this.adminUser = data.user as AdminUser;
        this.portalUser = null;
        this.mode = "admin";
        return;
      }
      setPortalToken(data.token);
      this.portalOnboardingPending = false;
      this.portalUser = data.user as PortalUser;
      this.adminUser = null;
      this.mode = "portal";
    },
    async login(email: string, password: string, mode: "portal" | "admin" = "portal") {
      this.loading = true;
      this.error = "";
      try {
        await this.loginWithMode(email, password, mode);
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async loginUnified(email: string, password: string) {
      this.loading = true;
      this.error = "";
      try {
        const response = await apiFetch("/admin/auth/unified-login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!response.ok) {
          throw new Error(
            await responseErrorMessage(response, "Invalid email or password"),
          );
        }
        const data = (await response.json()) as {
          token: string;
          user: AdminUser | PortalUser;
          mode: "portal" | "admin";
        };
        clearAllTokens();
        if (data.mode === "admin") {
          setAdminToken(data.token);
          setPortalOnboardingPending(false);
          this.portalOnboardingPending = false;
          this.adminUser = data.user as AdminUser;
          this.portalUser = null;
          this.mode = "admin";
          return;
        }
        setPortalToken(data.token);
        this.portalOnboardingPending = false;
        this.portalUser = data.user as PortalUser;
        this.adminUser = null;
        this.mode = "portal";
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async register(payload: {
      email: string;
      password: string;
      name?: string;
      tenantName?: string;
      verificationCode?: string;
      verificationToken?: string;
    }) {
      this.loading = true;
      this.error = "";
      try {
        const response = await apiFetch("/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(await responseErrorMessage(response, "Register failed"));
        }
        const data = (await response.json()) as {
          token: string;
          user: PortalUser;
        };
        clearAllTokens();
        setPortalToken(data.token);
        setPortalOnboardingPending(false);
        this.portalOnboardingPending = false;
        this.portalUser = data.user;
        this.adminUser = null;
        this.mode = "portal";
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async loadMe() {
      try {
        if (hasPortalToken()) {
          this.portalUser = await getJson<PortalUser>("/auth/me");
          this.adminUser = null;
          this.mode = "portal";
          this.portalOnboardingPending = getPortalOnboardingPending();
          return;
        }
        if (hasAdminToken()) {
          this.adminUser = await getJson<AdminUser>("/admin/auth/me");
          this.portalUser = null;
          this.mode = "admin";
          this.portalOnboardingPending = false;
          return;
        }
      } catch (error) {
        clearAllTokens();
      }
      this.adminUser = null;
      this.portalUser = null;
      this.portalOnboardingPending = false;
      this.mode = "guest";
    },
    async loadVerificationSettings() {
      this.verificationSettings =
        await getJson<VerificationSettings>("/auth/verification-settings");
    },
    async sendRegistrationCode(email: string) {
      return this.sendCode("/auth/send-registration-code", email);
    },
    async sendPasswordResetCode(email: string) {
      return this.sendCode("/auth/send-password-reset-code", email);
    },
    async resetPassword(payload: {
      email: string;
      password: string;
      verificationCode: string;
    }) {
      const response = await apiFetch("/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(response, "Reset password failed"),
        );
      }
    },
    async sendCode(path: string, email: string) {
      const response = await apiFetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(response, "Send verification code failed"),
        );
      }
      return response.json() as Promise<{
        ok: boolean;
        enabled: boolean;
        expiresAt?: string;
        resendCooldownSeconds?: number;
        devCode?: string;
      }>;
    },
    switchToAdminMode() {
      clearPortalToken();
      setPortalOnboardingPending(false);
      this.portalOnboardingPending = false;
      this.portalUser = null;
      if (getAdminToken()) {
        this.mode = "admin";
      }
    },
    completePortalOnboarding() {
      setPortalOnboardingPending(false);
      this.portalOnboardingPending = false;
    },
    logout() {
      clearAdminToken();
      clearPortalToken();
      setPortalOnboardingPending(false);
      this.adminUser = null;
      this.portalUser = null;
      this.portalOnboardingPending = false;
      this.mode = "guest";
    },
  },
});
