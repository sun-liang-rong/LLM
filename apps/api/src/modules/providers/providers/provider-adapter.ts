import type {
  NormalizedRequest,
  ProviderRequestContext,
} from "@gateway/protocol";

export type ProviderResult =
  | {
      type: "json";
      statusCode: number;
      data: unknown;
      usage?: ProviderUsage;
    }
  | {
      type: "stream";
      statusCode: number;
      headers: Record<string, string>;
      body: NodeJS.ReadableStream;
      usage?: ProviderUsage;
    };

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  reasoningTokens?: number;
  estimatedTokens?: boolean;
}

export type ProviderErrorKind =
  | "auth"
  | "rate_limit"
  | "server_error"
  | "timeout"
  | "network"
  | "unknown";

export class ProviderUpstreamError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly kind: ProviderErrorKind,
    readonly statusCode?: number,
    readonly body?: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ProviderUpstreamError";
  }
}

export function parseRetryAfterMs(
  value: string | string[] | undefined,
  now = Date.now(),
) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    return undefined;
  }

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1000);
  }

  const dateMs = Date.parse(raw);
  if (Number.isNaN(dateMs)) {
    return undefined;
  }

  return Math.max(dateMs - now, 0);
}

export interface ProviderAdapter {
  complete(
    request: NormalizedRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult>;
}
