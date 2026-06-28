const ADMIN_TOKEN_KEY = "admin_token";
const PORTAL_TOKEN_KEY = "portal_token";
const PORTAL_ONBOARDING_KEY = "portal_onboarding_pending";

export function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function hasAdminToken() {
  return Boolean(getAdminToken());
}

export function setAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function getPortalToken() {
  return localStorage.getItem(PORTAL_TOKEN_KEY);
}

export function hasPortalToken() {
  return Boolean(getPortalToken());
}

export function setPortalToken(token: string) {
  localStorage.setItem(PORTAL_TOKEN_KEY, token);
}

export function clearPortalToken() {
  localStorage.removeItem(PORTAL_TOKEN_KEY);
}

export function clearAllTokens() {
  clearAdminToken();
  clearPortalToken();
}

export function getPortalOnboardingPending() {
  return localStorage.getItem(PORTAL_ONBOARDING_KEY) === "true";
}

export function setPortalOnboardingPending(value: boolean) {
  if (value) {
    localStorage.setItem(PORTAL_ONBOARDING_KEY, "true");
    return;
  }
  localStorage.removeItem(PORTAL_ONBOARDING_KEY);
}
