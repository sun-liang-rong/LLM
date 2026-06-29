import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyThemePreference,
  getInitialThemePreference,
  isThemePreference,
  persistThemePreference,
  THEME_STORAGE_KEY,
} from "../src/utils/theme.ts";

function createStorage(seed: Record<string, string | null> = {}) {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(seed)) {
    if (value !== null) entries.set(key, value);
  }

  return {
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    },
  };
}

function createRoot() {
  const attributes = new Map<string, string>();
  const classes = new Set<string>();

  return {
    getAttribute(name: string) {
      return attributes.get(name) ?? null;
    },
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
    classList: {
      add(name: string) {
        classes.add(name);
      },
      remove(name: string) {
        classes.delete(name);
      },
      contains(name: string) {
        return classes.has(name);
      },
    },
  };
}

test("recognizes only supported theme preferences", () => {
  assert.equal(isThemePreference("light"), true);
  assert.equal(isThemePreference("dark"), true);
  assert.equal(isThemePreference("system"), false);
  assert.equal(isThemePreference(null), false);
});

test("uses persisted theme preference when it is valid", () => {
  const storage = createStorage({ [THEME_STORAGE_KEY]: "dark" });

  assert.equal(getInitialThemePreference(storage), "dark");
});

test("falls back to light when persisted theme is missing or invalid", () => {
  assert.equal(getInitialThemePreference(createStorage()), "light");
  assert.equal(
    getInitialThemePreference(createStorage({ [THEME_STORAGE_KEY]: "blue" })),
    "light",
  );
});

test("persists theme preference", () => {
  const storage = createStorage();

  persistThemePreference("dark", storage);

  assert.equal(storage.getItem(THEME_STORAGE_KEY), "dark");
});

test("applies theme preference to the document root", () => {
  const root = createRoot();

  applyThemePreference("dark", root);
  assert.equal(root.getAttribute("data-theme"), "dark");
  assert.equal(root.classList.contains("dark"), true);

  applyThemePreference("light", root);
  assert.equal(root.getAttribute("data-theme"), "light");
  assert.equal(root.classList.contains("dark"), false);
});
