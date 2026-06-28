import { defineStore } from "pinia";
import type { Announcement, SiteSettings } from "@gateway/shared";
import { apiFetch, getJson, responseErrorMessage } from "../api/client";

const defaultSettings: SiteSettings = {
  siteName: "AI Gateway",
  logoText: "AG",
  homeNotice: "欢迎使用 AI Gateway，请合理安排 API 调用额度。",
  registrationEnabled: true,
  checkInEnabled: true,
  signupBonusUsd: 3,
  dailyCheckInMinUsd: 0.01,
  dailyCheckInMaxUsd: 0.1,
  defaultModel: "gpt-4o-mini",
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpFrom: "",
};

const defaultAnnouncements: Announcement[] = [
  {
    id: "welcome",
    title: "平台公告",
    content: "模型广场、API Key、余额中心和每日签到已开放使用。",
    type: "notice",
    pinned: true,
    status: "published",
    publishAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const useSiteConfigStore = defineStore("siteConfig", {
  state: () => ({
    loading: false,
    saving: false,
    error: "",
    announcements: defaultAnnouncements,
    settings: defaultSettings,
  }),
  getters: {
    publishedAnnouncements(state) {
      const now = Date.now();
      return state.announcements
        .filter(
          (item) =>
            item.status === "published" &&
            new Date(item.publishAt).getTime() <= now,
        )
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return (
            new Date(b.publishAt).getTime() - new Date(a.publishAt).getTime()
          );
        });
    },
  },
  actions: {
    async refreshPublic() {
      this.loading = true;
      this.error = "";
      try {
        const [settings, announcements] = await Promise.all([
          getJson<SiteSettings>("/public/settings"),
          getJson<Announcement[]>("/public/announcements"),
        ]);
        this.settings = settings;
        this.announcements = announcements;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
    async refreshAdmin() {
      this.loading = true;
      this.error = "";
      try {
        const [settings, announcements] = await Promise.all([
          getJson<SiteSettings>("/admin/settings"),
          getJson<Announcement[]>("/admin/announcements"),
        ]);
        this.settings = settings;
        this.announcements = announcements;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
    async saveAnnouncement(payload: Partial<Announcement>) {
      this.saving = true;
      try {
        const response = await apiFetch("/admin/announcements", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(
            await responseErrorMessage(response, "Save announcement failed"),
          );
        }
        await this.refreshAdmin();
      } finally {
        this.saving = false;
      }
    },
    async deleteAnnouncement(id: string) {
      const response = await apiFetch(`/admin/announcements/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(response, "Delete announcement failed"),
        );
      }
      await this.refreshAdmin();
    },
    async saveSettings(payload: SiteSettings) {
      this.saving = true;
      try {
        const response = await apiFetch("/admin/settings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(
            await responseErrorMessage(response, "Save settings failed"),
          );
        }
        this.settings = (await response.json()) as SiteSettings;
      } finally {
        this.saving = false;
      }
    },
  },
});

export type { Announcement, SiteSettings };
