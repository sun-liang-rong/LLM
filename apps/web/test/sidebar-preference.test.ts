import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getInitialSidebarCollapsed,
  persistSidebarCollapsed,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
} from "../src/utils/sidebar.ts";

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

test("uses persisted collapsed sidebar preference when it is valid", () => {
  const storage = createStorage({ [SIDEBAR_COLLAPSED_STORAGE_KEY]: "true" });

  assert.equal(getInitialSidebarCollapsed(storage), true);
});

test("falls back to expanded sidebar when preference is missing or invalid", () => {
  assert.equal(getInitialSidebarCollapsed(createStorage()), false);
  assert.equal(
    getInitialSidebarCollapsed(
      createStorage({ [SIDEBAR_COLLAPSED_STORAGE_KEY]: "narrow" }),
    ),
    false,
  );
});

test("persists collapsed sidebar preference", () => {
  const storage = createStorage();

  persistSidebarCollapsed(true, storage);

  assert.equal(storage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY), "true");
});
