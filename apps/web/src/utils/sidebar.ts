export const SIDEBAR_COLLAPSED_STORAGE_KEY = "sidebar-collapsed";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function getInitialSidebarCollapsed(
  storage: Pick<StorageLike, "getItem"> | null | undefined,
) {
  try {
    return storage?.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function persistSidebarCollapsed(
  collapsed: boolean,
  storage: Pick<StorageLike, "setItem"> | null | undefined,
) {
  try {
    storage?.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Storage can be unavailable in private browsing or locked-down embeds.
  }
}
