export const THEME_STORAGE_KEY = "app-theme";

export type ThemePreference = "light" | "dark";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

type ThemeRoot = {
  setAttribute(name: string, value: string): void;
  classList: {
    add(name: string): void;
    remove(name: string): void;
  };
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark";
}

export function getInitialThemePreference(
  storage: Pick<StorageLike, "getItem"> | null | undefined,
): ThemePreference {
  try {
    const saved = storage?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(saved) ? saved : "light";
  } catch {
    return "light";
  }
}

export function persistThemePreference(
  preference: ThemePreference,
  storage: Pick<StorageLike, "setItem"> | null | undefined,
) {
  try {
    storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage can be unavailable in private browsing or locked-down embeds.
  }
}

export function applyThemePreference(
  preference: ThemePreference,
  root: ThemeRoot | null | undefined,
) {
  if (!root) return;
  root.setAttribute("data-theme", preference);
  if (preference === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}
