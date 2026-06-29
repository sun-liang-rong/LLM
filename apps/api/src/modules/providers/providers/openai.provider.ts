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
import { extractProviderUsage } from "./provider-usage.util";

@Injectable()
export class OpenAiProvider implements ProviderAdapter {
  constructor(private readonly config: ConfigService) {}

  async complete(
    normalized: NormalizedRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult> {
    if (!context.apiKey) {
      throw new ServiceUnavailableException("No OpenAI provider key configured");
    }

    const baseUrl = context.baseUrl || this.config.get<string>("OPENAI_BASE_URL", "");
    const endpoint =
      normalized.sourceProtocol === "openai" &&
      typeof normalized.rawBody === "object" &&
      normalized.rawBody !== null &&
      "input" in normalized.rawBody
        ? "/v1/responses"
        : "/v1/chat/completions";

    const body =
      endpoint === "/v1/responses"
        ? {
            ...(normalized.rawBody as Record<string, unknown>),
            model: context.upstreamModel,
          }
        : {
            model: context.upstreamModel,
            messages: normalized.messages.map((message) => ({
              role: message.role,
              content: this.blocksToText(message.content),
            })),
            tools: normalized.tools?.map((tool) => ({
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema,
              },
            })),
            stream: normalized.stream,
            stream_options: normalized.stream ? { include_usage: true } : undefined,
            max_tokens: normalized.maxTokens,
            temperature: normalized.temperature,
            top_p: normalized.topP,
          };

    const url = this.joinUrl(baseUrl, endpoint);
    const response = await this.send(url, {
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
          normalized.sourceProtocol === "anthropic"
            ? response.body.pipe(this.openAiStreamToAnthropic(normalized.model))
            : response.body,
      };
    }

    const text = await response.body.text();
    if (response.statusCode >= 400) {
      throw new ProviderUpstreamError(
        `OpenAI upstream error ${response.statusCode} at ${url}: ${this.errorPreview(text)}`,
        "openai",
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
        normalized.sourceProtocol === "anthropic"
          ? this.openAiResponseToAnthropic(data, normalized.model)
          : data,
      usage: this.extractUsage(data),
    };
  }

  private openAiResponseToAnthropic(data: unknown, model: string) {
    const record =
      typeof data === "object" && data !== null
        ? (data as Record<string, unknown>)
        : {};
    const choices = Array.isArray(record.choices) ? record.choices : [];
    const first = choices[0] as Record<string, unknown> | undefined;
    const message =
      typeof first?.message === "object" && first.message !== null
        ? (first.message as Record<string, unknown>)
        : {};
    const usage = this.extractUsage(data);

    return {
      id: typeof record.id === "string" ? record.id.replace(/^chatcmpl/, "msg") : `msg_${Date.now()}`,
      type: "message",
      role: "assistant",
      model,
      content: [
        {
          type: "text",
          text: typeof message.content === "string" ? message.content : "",
        },
      ],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: usage?.inputTokens ?? 0,
        output_tokens: usage?.outputTokens ?? 0,
      },
    };
  }

  private openAiStreamToAnthropic(model: string) {
    const { Transform } = require("node:stream") as typeof import("node:stream");
    let started = false;
    let blockStarted = false;
    let buffer = "";
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
            `event: message_start\ndata: ${JSON.stringify({
              type: "message_start",
              message: {
                id: `msg_${Date.now()}`,
                type: "message",
                role: "assistant",
                content: [],
                model,
                stop_reason: null,
                stop_sequence: null,
                usage: { input_tokens: 0, output_tokens: 0 },
              },
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
          if (data === "[DONE]") {
            if (blockStarted) {
              output.push(
                `event: content_block_stop\ndata: ${JSON.stringify({
                  type: "content_block_stop",
                  index: 0,
                })}\n\n`,
              );
            }
            output.push(
              `event: message_delta\ndata: ${JSON.stringify({
                type: "message_delta",
                delta: { stop_reason: "end_turn", stop_sequence: null },
                usage: {
                  input_tokens: inputTokens,
                  output_tokens: outputTokens,
                },
              })}\n\n`,
            );
            output.push(
              `event: message_stop\ndata: ${JSON.stringify({
                type: "message_stop",
              })}\n\n`,
            );
            continue;
          }

          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
              usage?: {
                prompt_tokens?: number;
                input_tokens?: number;
                completion_tokens?: number;
                output_tokens?: number;
              };
            };
            const text = parsed.choices?.[0]?.delta?.content;
            if (typeof text === "string" && text.length > 0) {
              if (!blockStarted) {
                blockStarted = true;
                output.push(
                  `event: content_block_start\ndata: ${JSON.stringify({
                    type: "content_block_start",
                    index: 0,
                    content_block: { type: "text", text: "" },
                  })}\n\n`,
                );
              }
              output.push(
                `event: content_block_delta\ndata: ${JSON.stringify({
                  type: "content_block_delta",
                  index: 0,
                  delta: { type: "text_delta", text },
                })}\n\n`,
              );
            }
            const promptTokens =
              parsed.usage?.prompt_tokens ?? parsed.usage?.input_tokens;
            if (typeof promptTokens === "number") {
              inputTokens = promptTokens;
            }
            const usageTokens =
              parsed.usage?.completion_tokens ?? parsed.usage?.output_tokens;
            if (typeof usageTokens === "number") {
              outputTokens = usageTokens;
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
    options: { apiKey: string; signal?: AbortSignal; body: unknown },
  ) {
    try {
      return await request(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
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
      return new ProviderUpstreamError("OpenAI request aborted", "openai", "timeout");
    }
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    const kind = code.includes("TIMEOUT") ? "timeout" : "network";
    return new ProviderUpstreamError(
      error instanceof Error ? error.message : String(error),
      "openai",
      kind,
    );
  }

  private extractUsage(data: unknown) {
    return extractProviderUsage(data);
  }

  private blocksToText(blocks: NormalizedContentBlock[]) {
    return blocks
      .map((block) => {
        if (block.type === "text") {
          return block.text;
        }
        if (block.type === "image_url") {
          return block.imageUrl;
        }
        return block.content;
      })
      .join("\n");
  }
}
