<template>
  <router-view v-if="$route.meta.layout === 'plain'" />
  <el-container v-else class="app-shell">
    <el-drawer
      v-model="mobileNavOpen"
      direction="ltr"
      size="292px"
      :with-header="false"
      class="mobile-nav-drawer"
    >
      <div class="brand mobile-brand">
        <div class="brand-mark">✳</div>
        <div class="brand-copy">
          <strong>{{ t("app.brand") }}</strong>
          <span>{{ t("app.codingAgents") }}</span>
        </div>
      </div>

      <div class="sidebar-scroll">
        <el-menu
          :default-active="activeMenu"
          class="sidebar-menu mobile-menu"
          @select="handleMenuSelect"
        >
          <el-menu-item
            v-for="item in primaryNavItems"
            :key="item.index"
            :index="item.index"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </el-menu-item>
        </el-menu>

        <div class="sidebar-footer mobile-footer">
          <div class="sidebar-footer-row sidebar-toggle-row">
            <div class="sidebar-toggle-label">
              <el-icon><component :is="themeIcon" /></el-icon>
              <span>{{ t("app.themeLabel") }}</span>
            </div>
            <el-switch
              v-model="isDarkTheme"
              :aria-label="themeSwitchLabel"
              @change="setThemeFromSwitch"
            />
          </div>
          <div class="sidebar-footer-row">
            <el-icon><Fold /></el-icon>
            <span>{{ t("app.collapseLabel") }}</span>
          </div>
        </div>
      </div>
    </el-drawer>

    <el-aside
      :width="sidebarWidth"
      class="sidebar"
      :class="{ 'is-collapsed': sidebarCollapsed }"
    >
      <div class="brand">
        <div class="brand-mark">✳</div>
        <div v-if="!sidebarCollapsed" class="brand-copy">
          <strong>{{ t("app.brand") }}</strong>
          <span>{{ t("app.codingAgents") }}</span>
        </div>
      </div>

      <div class="sidebar-scroll">
        <el-menu
          :default-active="activeMenu"
          :collapse="sidebarCollapsed"
          router
          class="sidebar-menu"
        >
          <el-tooltip
            v-for="item in primaryNavItems"
            :key="item.index"
            :content="item.label"
            :disabled="!sidebarCollapsed"
            placement="right"
          >
            <el-menu-item :index="item.index">
              <el-icon><component :is="item.icon" /></el-icon>
              <template v-if="!sidebarCollapsed" #title>
                <span>{{ item.label }}</span>
              </template>
            </el-menu-item>
          </el-tooltip>
        </el-menu>

        <div class="sidebar-footer">
          <div class="sidebar-footer-row sidebar-toggle-row">
            <div class="sidebar-toggle-label">
              <el-icon><component :is="themeIcon" /></el-icon>
              <span v-if="!sidebarCollapsed">{{ t("app.themeLabel") }}</span>
            </div>
            <el-switch
              v-if="!sidebarCollapsed"
              v-model="isDarkTheme"
              :aria-label="themeSwitchLabel"
              @change="setThemeFromSwitch"
            />
          </div>
          <el-tooltip
            :content="collapseToggleLabel"
            :disabled="!sidebarCollapsed"
            placement="right"
          >
            <button
              type="button"
              class="sidebar-footer-row sidebar-action-row"
              :aria-label="collapseToggleLabel"
              :aria-pressed="sidebarCollapsed"
              @click="toggleSidebarCollapsed"
            >
              <el-icon><component :is="collapseIcon" /></el-icon>
              <span v-if="!sidebarCollapsed">{{ t("app.collapseLabel") }}</span>
            </button>
          </el-tooltip>
          <div v-if="!sidebarCollapsed" class="sidebar-support">
            <small>{{ t("app.supportLabel") }}</small>
            <strong>{{ auth.user?.email ?? t("app.supportFallback") }}</strong>
          </div>
        </div>
      </div>
    </el-aside>

    <el-container class="app-stage">
      <el-header class="topbar">
        <div class="topbar-leading">
          <el-button
            class="mobile-nav-trigger"
            circle
            :icon="Menu"
            :aria-label="t('nav.openMenu')"
            @click="mobileNavOpen = true"
          />
          <div class="topbar-titles">
            <h1>{{ currentPage.title }}</h1>
            <p>{{ currentPage.subtitle }}</p>
          </div>
        </div>

        <div class="topbar-trailing">
          <el-badge
            :value="announcementRows.length"
            :hidden="announcementRows.length === 0"
            class="topbar-badge"
          >
            <el-button
              class="topbar-link topbar-icon-button"
              :icon="Bell"
              :aria-label="t('announcements.title')"
              @click="announcementsDialogVisible = true"
            />
          </el-badge>
          <el-button
            class="topbar-link topbar-docs topbar-docs-button"
            @click="docsDialogVisible = true"
          >
            <el-icon><Document /></el-icon>
            <span>{{ t("app.docsLabel") }}</span>
          </el-button>
          <div class="locale-chip">
            <span>{{ localeLabel }}</span>
            <el-select
              v-model="locale"
              class="language-select"
              @change="setLocale"
            >
              <el-option label="中文" value="zh-CN" />
              <el-option label="English" value="en-US" />
            </el-select>
          </div>
          <div class="account-pill">
            <strong>{{ accountName }}</strong>
          </div>
          <el-button class="logout-button" @click="logout">
            {{ t("common.logout") }}
          </el-button>
        </div>
      </el-header>

      <el-main class="page-main">
        <router-view />
      </el-main>
    </el-container>

    <el-dialog
      v-model="docsDialogVisible"
      :title="t('docs.title')"
      width="720px"
      class="header-dialog docs-dialog"
      align-center
    >
      <p class="dialog-subtitle">{{ t("docs.subtitle") }}</p>
      <div class="dialog-section-list">
        <section class="dialog-panel">
          <div class="panel-title">
            <h3>{{ t("docs.openaiTitle") }}</h3>
          </div>
          <pre class="docs-code"><code>OPENAI_BASE_URL={{ baseUrl }}
OPENAI_API_KEY=&lt;your_gateway_key&gt;</code></pre>
        </section>

        <section class="dialog-panel">
          <div class="panel-title">
            <h3>{{ t("docs.anthropicTitle") }}</h3>
          </div>
          <pre class="docs-code"><code>ANTHROPIC_BASE_URL={{ apiHost }}
ANTHROPIC_API_KEY=&lt;your_gateway_key&gt;</code></pre>
        </section>

        <section class="dialog-panel">
          <div class="panel-title">
            <h3>{{ t("docs.claudeCodeTitle") }}</h3>
          </div>
          <pre class="docs-code"><code>export ANTHROPIC_BASE_URL={{ apiHost }}
export ANTHROPIC_API_KEY=&lt;your_gateway_key&gt;</code></pre>
        </section>

        <section class="dialog-panel">
          <div class="panel-title">
            <h3>{{ t("docs.codexCliTitle") }}</h3>
          </div>
          <pre class="docs-code"><code>export OPENAI_BASE_URL={{ baseUrl }}
export OPENAI_API_KEY=&lt;your_gateway_key&gt;</code></pre>
        </section>
      </div>
    </el-dialog>

    <el-dialog
      v-model="announcementsDialogVisible"
      :title="t('announcements.title')"
      width="720px"
      class="header-dialog announcements-dialog"
      align-center
      @open="refreshAnnouncements"
    >
      <p class="dialog-subtitle">{{ t("announcements.subtitle") }}</p>
      <div
        v-if="announcementRows.length > 0"
        v-loading="announcementsLoading"
        class="announcement-list dialog-announcement-list"
      >
        <article
          v-for="item in announcementRows"
          :key="item.id"
          class="announcement-item"
        >
          <div class="announcement-head">
            <div>
              <h3>{{ item.title }}</h3>
              <span>{{ new Date(item.publishAt).toLocaleString() }}</span>
            </div>
            <div class="tag-row">
              <el-tag v-if="item.pinned" type="warning" size="small">
                {{ t("announcements.pinned") }}
              </el-tag>
              <el-tag size="small">{{ announcementTypeLabel(item.type) }}</el-tag>
            </div>
          </div>
          <p>{{ item.content }}</p>
        </article>
      </div>
      <el-empty
        v-else
        class="dashboard-empty"
        :description="t('announcements.empty')"
      />
    </el-dialog>
  </el-container>
</template>

<script setup lang="ts">
import {
  Bell,
  Calendar,
  Connection,
  CreditCard,
  Document,
  Expand,
  Fold,
  Key,
  Menu,
  Monitor,
  Moon,
  OfficeBuilding,
  PriceTag,
  Setting,
  Sunny,
  User,
  Tickets,
} from "@element-plus/icons-vue";
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getJson } from "./api/client";
import { useI18n } from "./i18n";
import { useAuthStore } from "./stores/auth";
import type { Announcement } from "./stores/site-config";
import {
  getInitialSidebarCollapsed,
  persistSidebarCollapsed,
} from "./utils/sidebar";
import {
  applyThemePreference,
  getInitialThemePreference,
  persistThemePreference,
  type ThemePreference,
} from "./utils/theme";

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const { locale, setLocale, t } = useI18n();
const activeMenu = computed(() => route.path);
const mobileNavOpen = ref(false);
const docsDialogVisible = ref(false);
const announcementsDialogVisible = ref(false);
const announcementsLoading = ref(false);
const announcements = ref<Announcement[]>([]);
const themePreference = ref<ThemePreference>(
  getInitialThemePreference(window.localStorage),
);
const sidebarCollapsed = ref(getInitialSidebarCollapsed(window.localStorage));
const origin = window.location.origin.replace(/:\d+$/, ":3000");
const apiHost = computed(() => origin);
const baseUrl = computed(() => `${origin}/v1`);
const announcementRows = computed(() => {
  const now = Date.now();
  return announcements.value
    .filter(
      (item) =>
        item.status === "published" &&
        new Date(item.publishAt).getTime() <= now,
    )
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.publishAt).getTime() - new Date(a.publishAt).getTime();
    });
});

const primaryNavItems = computed(() => {
  if (auth.isPortalUser) {
    return [
      { index: "/console", icon: Monitor, label: t("nav.dashboard") },
      { index: "/check-in", icon: Calendar, label: t("nav.checkIn") },
      { index: "/api-keys", icon: Key, label: t("nav.apiKeys") },
      { index: "/model-market", icon: PriceTag, label: t("nav.modelMarket") },
      { index: "/requests", icon: Tickets, label: t("nav.requests") },
      { index: "/credits", icon: CreditCard, label: t("nav.creditsCenter") },
      { index: "/profile", icon: User, label: t("nav.profile") },
    ];
  }

  return [
    { index: "/console", icon: Monitor, label: t("nav.dashboard") },
    { index: "/admin/users", icon: User, label: t("nav.userManagement") },
    { index: "/api-keys", icon: Key, label: t("nav.apiKeyManagement") },
    { index: "/admin/models", icon: PriceTag, label: t("nav.modelManagement") },
    { index: "/providers", icon: Connection, label: t("nav.providerManagement") },
    { index: "/credits", icon: CreditCard, label: t("nav.balanceManagement") },
    { index: "/requests", icon: Tickets, label: t("nav.requestLogs") },
    { index: "/admin/announcements", icon: Bell, label: t("nav.announcementManagement") },
    { index: "/system-settings", icon: Setting, label: t("nav.systemSettings") },
  ].filter((item) => {
    if (item.index === "/api-keys") return auth.canManageApiKeys;
    if (item.index === "/providers") {
      return auth.canOperateRoutes;
    }
    return true;
  });
});

const pageMeta = computed<{ title: string; subtitle: string }>(() => {
  const current = route.name as string | undefined;
  const metaByRoute: Record<string, { title: string; subtitle: string }> = {
    dashboard: {
      title: t("dashboard.title"),
      subtitle: t("dashboard.subtitle"),
    },
    onboarding: {
      title: t("onboarding.title"),
      subtitle: t("onboarding.subtitle"),
    },
    profile: {
      title: t("profile.title"),
      subtitle: t("profile.subtitle"),
    },
    "admin-users": {
      title: t("adminUsers.title"),
      subtitle: t("adminUsers.subtitle"),
    },
    "api-keys": {
      title: t("apiKeys.title"),
      subtitle: t("apiKeys.subtitle"),
    },
    "check-in": {
      title: t("checkIn.title"),
      subtitle: t("checkIn.subtitle"),
    },
    "admin-models": {
      title: t("modelsAdmin.title"),
      subtitle: t("modelsAdmin.subtitle"),
    },
    "user-model-market": {
      title: t("market.title"),
      subtitle: t("market.subtitle"),
    },
    credits: {
      title: t("credits.title"),
      subtitle: t("credits.subtitle"),
    },
    announcements: {
      title: t("announcements.title"),
      subtitle: t("announcements.subtitle"),
    },
    "admin-announcements": {
      title: t("announcementAdmin.title"),
      subtitle: t("announcementAdmin.subtitle"),
    },
    "system-settings": {
      title: t("systemSettings.title"),
      subtitle: t("systemSettings.subtitle"),
    },
    requests: {
      title: t("requests.title"),
      subtitle: t("requests.subtitle"),
    },
    docs: {
      title: t("docs.title"),
      subtitle: t("docs.subtitle"),
    },
    providers: {
      title: t("providers.title"),
      subtitle: t("providers.subtitle"),
    },
    "model-routes": {
      title: t("modelRoutes.title"),
      subtitle: t("modelRoutes.subtitle"),
    },
    pricing: {
      title: t("pricing.title"),
      subtitle: t("pricing.subtitle"),
    },
    budgets: {
      title: t("nav.budgets"),
      subtitle: t("budgets.subtitle"),
    },
    tenancy: {
      title: t("tenancy.title"),
      subtitle: t("tenancy.subtitle"),
    },
  };

  return metaByRoute[current ?? ""] ?? {
    title: t("app.brand"),
    subtitle: t("app.subtitle"),
  };
});

const currentPage = computed(() => pageMeta.value);
const localeLabel = computed(() => (locale.value === "zh-CN" ? "ZH" : "EN"));
const isDarkTheme = computed({
  get: () => themePreference.value === "dark",
  set: (enabled: boolean) => {
    setThemePreference(enabled ? "dark" : "light");
  },
});
const themeIcon = computed(() => (isDarkTheme.value ? Moon : Sunny));
const themeSwitchLabel = computed(() =>
  isDarkTheme.value ? t("common.enabled") : t("common.disabled"),
);
const sidebarWidth = computed(() => (sidebarCollapsed.value ? "76px" : "252px"));
const collapseIcon = computed(() => (sidebarCollapsed.value ? Expand : Fold));
const collapseToggleLabel = computed(() =>
  sidebarCollapsed.value ? t("app.expandLabel") : t("app.collapseLabel"),
);
const accountName = computed(
  () =>
    ("email" in (auth.user ?? {}) ? auth.user?.email : undefined) ??
    "admin@example.com",
);

function handleMenuSelect(path: string) {
  mobileNavOpen.value = false;
  void router.push(path);
}

function announcementTypeLabel(type: Announcement["type"]) {
  const mapping: Record<Announcement["type"], string> = {
    notice: t("announcements.type.notice"),
    model: t("announcements.type.model"),
    maintenance: t("announcements.type.maintenance"),
    activity: t("announcements.type.activity"),
  };
  return mapping[type];
}

function refreshAnnouncements() {
  announcementsLoading.value = true;
  void getJson<Announcement[]>("/public/announcements")
    .then((rows) => {
      announcements.value = rows;
    })
    .catch(() => undefined)
    .finally(() => {
      announcementsLoading.value = false;
    });
}

function setThemePreference(preference: ThemePreference) {
  themePreference.value = preference;
  applyThemePreference(preference, document.documentElement);
  persistThemePreference(preference, window.localStorage);
}

function setThemeFromSwitch(value: string | number | boolean) {
  setThemePreference(value === true ? "dark" : "light");
}

function toggleSidebarCollapsed() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
  persistSidebarCollapsed(sidebarCollapsed.value, window.localStorage);
}

function logout() {
  auth.logout();
  void router.push("/login");
}

onMounted(() => {
  if (auth.isAuthenticated && !auth.user) {
    void auth.loadMe().catch(() => undefined);
  }
  if (auth.isAuthenticated) {
    refreshAnnouncements();
  }
});
</script>
