import { router } from "../router";
import {
  clearAdminToken,
  clearPortalToken,
  getAdminToken,
  getPortalToken,
} from "../utils/auth-session";

export async function getJson<T>(path: string): Promise<T> {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response, "Request failed"));
  }
  return response.json() as Promise<T>;
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = getAdminToken();
  const portalToken = getPortalToken();
  if (token && path.startsWith("/admin")) {
    headers.set("authorization", `Bearer ${token}`);
  } else if (portalToken && (path.startsWith("/auth") || path.startsWith("/console"))) {
    headers.set("authorization", `Bearer ${portalToken}`);
  }

  const response = await fetch(path, { ...init, headers });
  if (
    response.status === 401 &&
    path.startsWith("/admin") &&
    !path.startsWith("/admin/auth/login") &&
    !path.startsWith("/admin/auth/unified-login")
  ) {
    clearAdminToken();
    if (router.currentRoute.value.path !== "/login") {
      void router.push("/login");
    }
  }
  if (
    response.status === 401 &&
    (path.startsWith("/auth") || path.startsWith("/console")) &&
    !path.startsWith("/auth/login") &&
    !path.startsWith("/auth/register")
  ) {
    clearPortalToken();
    if (router.currentRoute.value.path !== "/login") {
      void router.push("/login");
    }
  }
  return response;
}

export async function responseErrorMessage(
  response: Response,
  fallback: string,
) {
  const text = await response.text().catch(() => "");
  if (!text) {
    return `${fallback}: ${response.status}`;
  }
  try {
    const parsed = JSON.parse(text) as { message?: unknown; error?: unknown };
    if (Array.isArray(parsed.message)) {
      return parsed.message.join(", ");
    }
    if (typeof parsed.message === "string") {
      return parsed.message;
    }
    if (typeof parsed.error === "string") {
      return parsed.error;
    }
  } catch {
    return text;
  }
  return text;
}
