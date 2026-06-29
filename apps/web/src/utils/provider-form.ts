export interface ProviderFormInput {
  id?: string;
  name: string;
  slug: string;
  protocol: string;
  baseUrl: string;
  enabled: boolean;
}

export type ProviderPayloadResult =
  | {
      ok: true;
      payload: {
        id?: string;
        name: string;
        slug: string;
        protocol: string;
        baseUrl: string;
        enabled: boolean;
      };
    }
  | { ok: false; message: string };

export function normalizeProviderPayload(
  input: ProviderFormInput,
): ProviderPayloadResult {
  const id = input.id?.trim();
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  const protocol = input.protocol.trim();
  const baseUrl = input.baseUrl.trim();

  if (!name) {
    return { ok: false, message: "Missing required field: name" };
  }
  if (!slug) {
    return { ok: false, message: "Missing required field: slug" };
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(slug)) {
    return {
      ok: false,
      message:
        "Slug can only contain lowercase letters, numbers, dots, underscores, and hyphens",
    };
  }
  if (protocol !== "openai-compatible" && protocol !== "anthropic") {
    return { ok: false, message: "Unsupported provider protocol" };
  }
  if (!isHttpUrl(baseUrl)) {
    return { ok: false, message: "Base URL must be a valid http or https URL" };
  }

  return {
    ok: true,
    payload: {
      ...(id ? { id } : {}),
      name,
      slug,
      protocol,
      baseUrl,
      enabled: input.enabled,
    },
  };
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
