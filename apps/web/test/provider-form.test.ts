import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeProviderPayload } from "../src/utils/provider-form.ts";

test("normalizes provider payload before saving", () => {
  const result = normalizeProviderPayload({
    name: "  My Upstream  ",
    slug: "  my-upstream  ",
    protocol: "openai-compatible",
    baseUrl: "  https://api.example.com/v1  ",
    enabled: true,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.payload, {
      name: "My Upstream",
      slug: "my-upstream",
      protocol: "openai-compatible",
      baseUrl: "https://api.example.com/v1",
      enabled: true,
    });
  }
});

test("rejects invalid provider slug before calling API", () => {
  const result = normalizeProviderPayload({
    name: "My Upstream",
    slug: "中文 渠道",
    protocol: "openai-compatible",
    baseUrl: "https://api.example.com/v1",
    enabled: true,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(
      result.message,
      "Slug can only contain lowercase letters, numbers, dots, underscores, and hyphens",
    );
  }
});

test("rejects invalid provider base URL before calling API", () => {
  const result = normalizeProviderPayload({
    name: "My Upstream",
    slug: "my-upstream",
    protocol: "openai-compatible",
    baseUrl: "not a url",
    enabled: true,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.message, "Base URL must be a valid http or https URL");
  }
});
