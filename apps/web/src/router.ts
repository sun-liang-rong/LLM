import { createRouter, createWebHistory } from "vue-router";
import {
  hasAdminToken,
  hasPortalToken,
} from "./utils/auth-session";

const portalAllowedPaths = new Set([
  "/console",
  "/check-in",
  "/api-keys",
  "/model-market",
  "/docs",
  "/requests",
  "/credits",
  "/announcements",
  "/profile",
]);

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      component: () => import("./views/Home.vue"),
      meta: { layout: "plain" },
    },
    {
      path: "/models",
      name: "model-market",
      component: () => import("./views/ModelMarket.vue"),
      meta: { layout: "plain" },
    },
    {
      path: "/model-market",
      name: "user-model-market",
      component: () => import("./views/ModelMarket.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/console",
      name: "dashboard",
      component: () => import("./views/Dashboard.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/profile",
      name: "profile",
      component: () => import("./views/Profile.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/admin/users",
      name: "admin-users",
      component: () => import("./views/AdminUsers.vue"),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: "/check-in",
      name: "check-in",
      component: () => import("./views/CheckIn.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/onboarding",
      name: "onboarding",
      component: () => import("./views/Onboarding.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/providers",
      name: "providers",
      component: () => import("./views/Providers.vue"),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: "/model-routes",
      name: "model-routes",
      component: () => import("./views/ModelAliases.vue"),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: "/pricing",
      name: "pricing",
      component: () => import("./views/Pricing.vue"),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: "/admin/models",
      name: "admin-models",
      component: () => import("./views/Pricing.vue"),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: "/requests",
      name: "requests",
      component: () => import("./views/Requests.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/docs",
      name: "docs",
      component: () => import("./views/Docs.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/api-keys",
      name: "api-keys",
      component: () => import("./views/ApiKeys.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/credits",
      name: "credits",
      component: () => import("./views/Credits.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/announcements",
      name: "announcements",
      component: () => import("./views/Announcements.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/admin/announcements",
      name: "admin-announcements",
      component: () => import("./views/AnnouncementAdmin.vue"),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: "/system-settings",
      name: "system-settings",
      component: () => import("./views/SystemSettings.vue"),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: "/budgets",
      name: "budgets",
      component: () => import("./views/Budgets.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/login",
      name: "login",
      component: () => import("./views/Login.vue"),
      meta: { layout: "plain" },
    },
    {
      path: "/verify-email",
      name: "verify-email",
      component: () => import("./views/VerifyEmail.vue"),
      meta: { layout: "plain" },
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: () => import("./views/NotFound.vue"),
      meta: { layout: "plain" },
    },
  ],
});

router.beforeEach((to) => {
  const hasAdmin = hasAdminToken();
  const hasPortal = hasPortalToken();
  const hasToken = hasAdmin || hasPortal;
  if (to.meta.requiresAuth && !hasToken) {
    return {
      path: "/login",
      query: to.fullPath === "/console" ? undefined : { redirect: to.fullPath },
    };
  }
  if (to.meta.requiresAdmin && !hasAdmin) {
    return "/console";
  }
  if (hasPortal && !hasAdmin && to.meta.requiresAuth && !portalAllowedPaths.has(to.path)) {
    return "/console";
  }
  if (to.path === "/login" && hasToken) {
    return "/console";
  }
  return true;
});
