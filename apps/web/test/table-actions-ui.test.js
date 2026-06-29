import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function read(relativePath) {
  return readFileSync(join(projectRoot, relativePath), "utf8");
}

function actionColumnTemplates(source) {
  const columnPattern =
    /<el-table-column[\s\S]*?:label="t\(['"]common\.actions['"]\)"[\s\S]*?fixed="right"[\s\S]*?>[\s\S]*?<template #default="\{ row \}">([\s\S]*?)<\/template>\s*<\/el-table-column>/g;
  return Array.from(source.matchAll(columnPattern), (match) => match[1]);
}

test("right fixed table action columns use stable non-wrapping action containers", () => {
  const files = [
    "src/views/AdminUsers.vue",
    "src/views/AnnouncementAdmin.vue",
    "src/views/ApiKeys.vue",
    "src/views/Budgets.vue",
    "src/views/Credits.vue",
    "src/views/ModelAliases.vue",
    "src/views/Pricing.vue",
    "src/views/Providers.vue",
  ];

  for (const file of files) {
    const source = read(file);
    for (const template of actionColumnTemplates(source)) {
      assert.match(template, /class="[^"]*\btable-actions\b[^"]*"/, `${file} action column should use .table-actions`);
      assert.match(template, /<el-tooltip\b/, `${file} action buttons should expose hover labels`);
    }
  }
});

test("global table action styles prevent wrapping and fixed columns from showing scrolled content through", () => {
  const styles = read("src/styles.css");

  assert.match(styles, /\.table-actions\s*\{/);
  assert.match(styles, /\.table-actions[\s\S]*?flex-wrap:\s*nowrap/);
  assert.match(styles, /\.el-table__fixed-right/);
  assert.match(styles, /background:\s*var\(--surface-strong\)/);
});

test("copy actions show a success message after clipboard writes", () => {
  for (const file of ["src/views/ApiKeys.vue", "src/views/Onboarding.vue"]) {
    const source = read(file);
    assert.match(source, /navigator\.clipboard\.writeText/);
    assert.match(source, /ElMessage\.success\(t\(["']common\.copied["']\)\)/);
  }
});
