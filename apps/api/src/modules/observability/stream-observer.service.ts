import { PassThrough, Transform, TransformCallback, pipeline } from "node:stream";
import { Injectable } from "@nestjs/common";
import type { GatewayProtocol, ProviderId } from "@gateway/shared";
import { CreditService } from "../billing/credit.service";
import { UsageService } from "../usage/usage.service";
import { RequestLogService } from "./request-log.service";
import type { ProviderUsage } from "../providers/providers/provider-adapter";
import {
  extractProviderUsage,
  mergeProviderUsage,
} from "../providers/providers/provider-usage.util";

export interface StreamObserverOptions {
  requestId: string;
  protocol: GatewayProtocol;
  apiKeyId?: string;
  userId?: string;
  billingGroupId?: string;
  modelGroupId?: string;
  tenantId?: string;
  projectId?: string;
  provider: ProviderId;
  providerId: string;
  providerKeyId: string;
  model: string;
  upstreamModel: string;
  retryCount: number;
  started: number;
  estimatedInputTokens?: number;
  abort: () => void;
}

@Injectable()
export class StreamObserverService {
  constructor(
    private readonly logs: RequestLogService,
    private readonly usage: UsageService,
    private readonly credits: CreditService,
  ) {}

  wrap(stream: NodeJS.ReadableStream, options: StreamObserverOptions) {
    let aborting = false;
    const observer = new SseUsageTransform(
      {
        protocol: options.protocol,
        estimatedInputTokens: options.estimatedInputTokens,
      },
      async (usage, error) => {
        const latencyMs = Date.now() - options.started;
        const cost = await this.usage.calculateCost(
          options.upstreamModel,
          usage,
          {
            publicModel: options.model,
            providerId: options.providerId,
            userId: options.userId,
            billingGroupId: options.billingGroupId,
          },
        );
        if (!error) {
          await this.credits.chargeUsage({
            userId: options.userId,
            tenantId: options.tenantId,
            requestId: options.requestId,
            costUsd: cost?.costUsd,
          });
        }

        this.logs.record({
          requestId: options.requestId,
          protocol: options.protocol,
          apiKeyId: options.apiKeyId,
          tenantId: options.tenantId,
          projectId: options.projectId,
          provider: options.provider,
          providerKeyId: options.providerKeyId,
          model: options.model,
          upstreamModel: options.upstreamModel,
          status: error ? "failed" : "completed",
          latencyMs,
          retryCount: options.retryCount,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          totalTokens: usage?.totalTokens,
          cacheReadTokens: usage?.cacheReadTokens,
          cacheCreationTokens: usage?.cacheCreationTokens,
          reasoningTokens: usage?.reasoningTokens,
          estimatedTokens: usage?.estimatedTokens,
          costUsd: cost?.costUsd,
          error,
        });
      },
    );
    const output = new PassThrough();

    observer.on("close", () => {
      if (!observer.readableEnded && !aborting) {
        aborting = true;
        options.abort();
      }
    });

    stream.on("error", (error) => {
      const message = this.errorMessage(error);
      if (!this.isAbortError(error)) {
        observer.markFailed(message);
      }
    });

    output.on("close", () => {
      if (!output.readableEnded && !aborting) {
        aborting = true;
        options.abort();
      }
    });

    pipeline(stream, observer, output, (error) => {
      if (!error || this.isAbortError(error)) {
        return;
      }
      observer.markFailed(this.errorMessage(error));
      output.destroy(error);
    });

    return output;
  }

  private isAbortError(error: unknown) {
    if (!(error instanceof Error)) {
      return false;
    }
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    return error.name === "AbortError" || code === "UND_ERR_ABORTED";
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}

class SseUsageTransform extends Transform {
  private buffer = "";
  private usage: ProviderUsage | undefined;
  private failedError: string | undefined;
  private finalized = false;
  private outputText = "";

  constructor(
    private readonly options: {
      protocol: GatewayProtocol;
      estimatedInputTokens?: number;
    },
    private readonly onFinal: (
      usage: ProviderUsage | undefined,
      error?: string,
    ) => Promise<void>,
  ) {
    super();
  }

  markFailed(error: string) {
    this.failedError = error;
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ) {
    const text = chunk.toString("utf8");
    this.buffer += text;
    this.consumeEvents();
    callback(null, chunk);
  }

  override _flush(callback: TransformCallback) {
    this.consumeEvents(true);
    this.finalize().finally(() => callback());
  }

  override _destroy(
    error: Error | null,
    callback: (error?: Error | null) => void,
  ) {
    if (error) {
      this.failedError = error.message;
    }
    this.finalize().finally(() => callback(error));
  }

  private consumeEvents(flush = false) {
    let separatorIndex = this.buffer.indexOf("\n\n");
    while (separatorIndex >= 0) {
      const event = this.buffer.slice(0, separatorIndex);
      this.buffer = this.buffer.slice(separatorIndex + 2);
      this.consumeEvent(event);
      separatorIndex = this.buffer.indexOf("\n\n");
    }

    if (flush && this.buffer.trim().length > 0) {
      this.consumeEvent(this.buffer);
      this.buffer = "";
    }
  }

  private consumeEvent(event: string) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");

    if (!data || data === "[DONE]") {
      return;
    }

    try {
      const parsed = JSON.parse(data);
      this.outputText += this.extractOutputText(parsed);
      this.usage = mergeProviderUsage(this.usage, this.extractUsage(parsed));
    } catch {
      // Some providers emit non-JSON SSE data; keep forwarding untouched.
    }
  }

  private extractUsage(data: unknown): ProviderUsage | undefined {
    return extractProviderUsage(data);
  }

  private extractOutputText(data: unknown) {
    if (typeof data !== "object" || data === null) {
      return "";
    }
    const record = data as Record<string, unknown>;

    if (this.options.protocol === "anthropic") {
      const delta =
        typeof record.delta === "object" && record.delta !== null
          ? (record.delta as Record<string, unknown>)
          : undefined;
      return typeof delta?.text === "string" ? delta.text : "";
    }

    const choices = Array.isArray(record.choices) ? record.choices : [];
    return choices
      .map((choice) => {
        if (typeof choice !== "object" || choice === null) {
          return "";
        }
        const delta = (choice as Record<string, unknown>).delta;
        if (typeof delta !== "object" || delta === null) {
          return "";
        }
        const content = (delta as Record<string, unknown>).content;
        return typeof content === "string" ? content : "";
      })
      .join("");
  }

  private async finalize() {
    if (this.finalized) {
      return;
    }
    this.finalized = true;
    this.usage ??= this.estimatedUsage();
    await this.onFinal(this.usage, this.failedError);
  }

  private estimatedUsage(): ProviderUsage | undefined {
    const inputTokens = this.options.estimatedInputTokens ?? 0;
    const outputTokens = estimateTokens(this.outputText);
    const totalTokens = inputTokens + outputTokens;

    if (totalTokens <= 0) {
      return undefined;
    }

    return { inputTokens, outputTokens, totalTokens, estimatedTokens: true };
  }
}

function estimateTokens(text: string) {
  const trimmed = text.trim();
  return trimmed.length > 0 ? Math.ceil(trimmed.length / 4) : 0;
}
