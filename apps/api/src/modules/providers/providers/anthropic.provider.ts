import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { request } from "undici";
import type {
  NormalizedContentBlock,
  NormalizedRequest,
  ProviderRequestContext,
} from "@gateway/protocol";
import {
  ProviderUpstreamError,
  parseRetryAfterMs,
  type ProviderAdapter,
  type ProviderResult,
} from "./provider-adapter";
import {
  extractProviderUsage,
} from "./provider-usage.util";

@Injectable()
export class AnthropicProvider implements ProviderAdapter {
  private readonly authModeByBaseUrl = new Map<
    string,
    "x-api-key" | "bearer" | "both"
  >();

  constructor(private readonly config: ConfigService) {}

  async complete(
    normalized: NormalizedRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult> {
    if (!context.apiKey) {
      throw new ServiceUnavailableException("No Anthropic provider key configured");
    }

    const baseUrl =
      context.baseUrl || this.config.get<string>("ANTHROPIC_BASE_URL", "");
    const body = {
      model: context.upstreamModel,
      messages: normalized.messages
        .filter((message) => message.role !== "system")
        .map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: this.blocksToAnthropicContent(message.content),
        })),
      system: normalized.messages
        .filter((message) => message.role === "system")
        .flatMap((message) => message.content)
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n"),
      tools: normalized.tools?.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      })),
      stream: normalized.stream,
      max_tokens: normalized.maxTokens ?? 4096,
      temperature: normalized.temperature,
      top_p: normalized.topP,
    };

    const url = this.joinUrl(baseUrl, "/v1/messages");
    const response = await this.sendWithCompatibleAuthRetry(url, {
      apiKey: context.apiKey,
      signal: context.signal,
      body,
    });

    if (normalized.stream && response.statusCode < 400) {
      return {
        type: "stream",
        statusCode: response.statusCode,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        },
        body:
          normalized.sourceProtocol === "openai"
            ? response.body.pipe(this.anthropicStreamToOpenAi(context.upstreamModel))
            : response.body,
      };
    }

    const text = await response.body.text();
    if (response.statusCode >= 400) {
      throw new ProviderUpstreamError(
        `Anthropic upstream error ${response.statusCode} at ${url}: ${this.errorPreview(text)}`,
        "anthropic",
        this.classifyStatus(response.statusCode),
        response.statusCode,
        text,
        parseRetryAfterMs(response.headers["retry-after"]),
      );
    }

    const data = JSON.parse(text);
    return {
      type: "json",
      statusCode: response.statusCode,
      data:
        normalized.sourceProtocol === "openai"
          ? this.anthropicResponseToOpenAi(data, context.upstreamModel)
          : this.normalizeAnthropicResponse(data, normalized.model),
      usage: this.extractUsage(data),
    };
  }

  private normalizeAnthropicResponse(data: unknown, model: string) {
    if (typeof data !== "object" || data === null) {
      return data;
    }

    const record = data as Record<string, unknown>;
    const content = Array.isArray(record.content) ? record.content : [];
    const normalizedContent = content
      .map((block) => {
        if (typeof block !== "object" || block === null) {
          return undefined;
        }
        const item = block as Record<string, unknown>;
        if (item.type === "text") {
          return {
            type: "text",
            text: typeof item.text === "string" ? item.text : "",
          };
        }
        if (item.type === "tool_use") {
          return item;
        }
        return undefined;
      })
      .filter((block): block is Record<string, unknown> => Boolean(block));

    return {
      ...record,
      model,
      content:
        normalizedContent.length > 0
          ? normalizedContent
          : [{ type: "text", text: "" }],
    };
  }

  private anthropicResponseToOpenAi(data: unknown, model: string) {
    const record =
      typeof data === "object" && data !== null
        ? (data as Record<string, unknown>)
        : {};
    const content = Array.isArray(record.content) ? record.content : [];
    const text = content
      .map((block) => {
        if (typeof block !== "object" || block === null) {
          return "";
        }
        const item = block as Record<string, unknown>;
        return item.type === "text" && typeof item.text === "string"
          ? item.text
          : "";
      })
      .join("");
    const usage = this.extractUsage(data);

    return {
      id: typeof record.id === "string" ? record.id.replace(/^msg/, "chatcmpl") : `chatcmpl_${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: text,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: usage?.inputTokens ?? 0,
        completion_tokens: usage?.outputTokens ?? 0,
        total_tokens: usage?.totalTokens ?? 0,
      },
    };
  }

  private anthropicStreamToOpenAi(model: string) {
    const { Transform } = require("node:stream") as typeof import("node:stream");
    let buffer = "";
    let started = false;
    const id = `chatcmpl_${Date.now()}`;
    let inputTokens = 0;
    let outputTokens = 0;

    return new Transform({
      transform(chunk, _encoding, callback) {
        buffer += chunk.toString("utf8");
        const output: string[] = [];
        let separatorIndex = buffer.indexOf("\n\n");

        if (!started) {
          started = true;
          output.push(
            `data: ${JSON.stringify({
              id,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [
                {
                  index: 0,
                  delta: { role: "assistant" },
                  finish_reason: null,
                },
              ],
            })}\n\n`,
          );
        }

        while (separatorIndex >= 0) {
          const event = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          separatorIndex = buffer.indexOf("\n\n");
          const data = event
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("\n");

          if (!data) continue;
          try {
            const parsed = JSON.parse(data) as {
              type?: string;
              message?: {
                usage?: {
                  input_tokens?: number;
                  output_tokens?: number;
                  prompt_tokens?: number;
                  completion_tokens?: number;
                };
              };
              usage?: {
                input_tokens?: number;
                output_tokens?: number;
                prompt_tokens?: number;
                completion_tokens?: number;
              };
              delta?: { type?: string; text?: string; stop_reason?: string | null };
            };
            const promptTokens =
              parsed.message?.usage?.input_tokens ??
              parsed.message?.usage?.prompt_tokens ??
              parsed.usage?.input_tokens ??
              parsed.usage?.prompt_tokens;
            if (typeof promptTokens === "number") {
              inputTokens = promptTokens;
            }
            const completionTokens =
              parsed.usage?.output_tokens ??
              parsed.usage?.completion_tokens ??
              parsed.message?.usage?.output_tokens ??
              parsed.message?.usage?.completion_tokens;
            if (typeof completionTokens === "number") {
              outputTokens = completionTokens;
            }
            if (
              parsed.type === "content_block_delta" &&
              parsed.delta?.type === "text_delta" &&
              typeof parsed.delta.text === "string"
            ) {
              output.push(
                `data: ${JSON.stringify({
                  id,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: { content: parsed.delta.text },
                      finish_reason: null,
                    },
                  ],
                })}\n\n`,
              );
            }
            if (parsed.type === "message_stop") {
              output.push(
                `data: ${JSON.stringify({
                  id,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: {},
                      finish_reason: "stop",
                    },
                  ],
                  usage: {
                    prompt_tokens: inputTokens,
                    completion_tokens: outputTokens,
                    total_tokens: inputTokens + outputTokens,
                  },
                })}\n\n`,
              );
              output.push("data: [DONE]\n\n");
            }
          } catch {
            // Ignore malformed upstream SSE data while preserving stream continuity.
          }
        }

        callback(null, output.join(""));
      },
    });
  }

  private async send(
    url: string,
    options: {
      apiKey: string;
      signal?: AbortSignal;
      body: unknown;
      authMode?: "x-api-key" | "bearer" | "both";
    },
  ) {
    try {
      const authHeaders =
        options.authMode === "bearer"
          ? { Authorization: `Bearer ${options.apiKey}` }
          : options.authMode === "both"
            ? {
                Authorization: `Bearer ${options.apiKey}`,
                "x-api-key": options.apiKey,
              }
          : { "x-api-key": options.apiKey };
      return await request(url, {
        method: "POST",
        headers: {
          ...authHeaders,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        signal: options.signal,
        body: JSON.stringify(options.body),
        headersTimeout: 60_000,
        bodyTimeout: 600_000,
      });
    } catch (error) {
      throw this.toProviderError(error);
    }
  }

  private async sendWithCompatibleAuthRetry(
    url: string,
    options: { apiKey: string; signal?: AbortSignal; body: unknown },
  ) {
    const cachedAuthMode = this.authModeByBaseUrl.get(this.authCacheKey(url));
    const authModes: Array<"x-api-key" | "bearer" | "both"> = cachedAuthMode
      ? [
          cachedAuthMode,
          ...(["x-api-key", "bearer", "both"] as const).filter(
            (mode) => mode !== cachedAuthMode,
          ),
        ]
      : ["x-api-key", "bearer", "both"];
    let lastStatusCode = 0;
    let lastText = "";
    let lastRetryAfterMs: number | undefined;

    for (const authMode of authModes) {
      const response = await this.send(url, {
        ...options,
        authMode,
      });

      if (response.statusCode !== 401 && response.statusCode !== 403) {
        this.authModeByBaseUrl.set(this.authCacheKey(url), authMode);
        return response;
      }

      lastStatusCode = response.statusCode;
      lastRetryAfterMs = parseRetryAfterMs(response.headers["retry-after"]);
      lastText = await response.body.text();
    }

    throw new ProviderUpstreamError(
      `Anthropic upstream error ${lastStatusCode} at ${url}: ${this.errorPreview(lastText)}`,
      "anthropic",
      this.classifyStatus(lastStatusCode),
      lastStatusCode,
      lastText,
      lastRetryAfterMs,
    );
  }

  private joinUrl(baseUrl: string, endpoint: string) {
    const normalizedBase = baseUrl.replace(/\/+$/, "");
    if (
      endpoint.startsWith("/v1/") &&
      normalizedBase.toLowerCase().endsWith("/v1")
    ) {
      return `${normalizedBase}${endpoint.slice(3)}`;
    }
    return `${normalizedBase}${endpoint}`;
  }

  private authCacheKey(url: string) {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return url;
    }
  }

  private classifyStatus(statusCode: number) {
    if (statusCode === 401 || statusCode === 403) return "auth";
    if (statusCode === 429) return "rate_limit";
    if (statusCode >= 500) return "server_error";
    return "unknown";
  }

  private errorPreview(text: string) {
    const preview = text.replace(/\s+/g, " ").trim();
    return preview.length > 300 ? `${preview.slice(0, 300)}...` : preview;
  }

  private toProviderError(error: unknown) {
    if (error instanceof ProviderUpstreamError) {
      return error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      return new ProviderUpstreamError(
        "Anthropic request aborted",
        "anthropic",
        "timeout",
      );
    }
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    const kind = code.includes("TIMEOUT") ? "timeout" : "network";
    return new ProviderUpstreamError(
      error instanceof Error ? error.message : String(error),
      "anthropic",
      kind,
    );
  }

  private extractUsage(data: unknown) {
    return extractProviderUsage(data);
  }

  private blocksToAnthropicContent(blocks: NormalizedContentBlock[]) {
    return blocks.map((block) => {
      if (block.type === "text") {
        return { type: "text", text: block.text };
      }
      if (block.type === "image_url") {
        return {
          type: "image",
          source: {
            type: "url",
            url: block.imageUrl,
          },
        };
      }
      return { type: "tool_result", tool_use_id: block.toolCallId, content: block.content };
    });
  }
}
