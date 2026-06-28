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
  ) {
    super(message);
    this.name = "ProviderUpstreamError";
  }
}

export interface ProviderAdapter {
  complete(
    request: NormalizedRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult>;
}
