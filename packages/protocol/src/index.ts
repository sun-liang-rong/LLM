import type {
  GatewayProtocol,
  ProviderId,
  UpstreamProtocol,
} from "@gateway/shared";

export type NormalizedRole = "system" | "user" | "assistant" | "tool";

export type NormalizedContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; imageUrl: string }
  | { type: "tool_result"; toolCallId: string; content: string };

export interface NormalizedMessage {
  role: NormalizedRole;
  content: NormalizedContentBlock[];
  name?: string;
  toolCallId?: string;
}

export interface NormalizedTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface NormalizedRequest {
  requestId: string;
  sourceProtocol: GatewayProtocol;
  tenantId?: string;
  apiKeyId?: string;
  model: string;
  messages: NormalizedMessage[];
  tools?: NormalizedTool[];
  stream: boolean;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  metadata?: Record<string, string>;
  rawBody: unknown;
}

export interface RoutingDecision {
  provider: ProviderId;
  providerId: string;
  providerSlug: string;
  upstreamProtocol: UpstreamProtocol;
  upstreamModel: string;
  baseUrl: string;
  reason: string;
}

export interface ProviderRequestContext {
  requestId: string;
  provider: ProviderId;
  providerId?: string;
  providerSlug?: string;
  upstreamProtocol?: UpstreamProtocol;
  upstreamModel: string;
  apiKey: string;
  baseUrl: string;
  signal?: AbortSignal;
}

export interface GatewayUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd?: number;
}

export interface GatewayResponseEnvelope<T = unknown> {
  requestId: string;
  provider: ProviderId;
  model: string;
  data: T;
  usage?: GatewayUsage;
}
