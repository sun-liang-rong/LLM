import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  NormalizedContentBlock,
  NormalizedMessage,
  NormalizedRequest,
  NormalizedTool,
} from "@gateway/protocol";

@Injectable()
export class ProtocolAdapterService {
  fromOpenAiChat(body: unknown): NormalizedRequest {
    const payload = this.requireRecord(body);
    const messages = Array.isArray(payload.messages) ? payload.messages : [];

    return {
      requestId: randomUUID(),
      sourceProtocol: "openai",
      model: this.requireString(payload.model, "model"),
      messages: messages.map((message) => this.openAiMessageToNormalized(message)),
      tools: this.openAiToolsToNormalized(payload.tools),
      stream: Boolean(payload.stream),
      maxTokens: this.optionalNumber(payload.max_tokens),
      temperature: this.optionalNumber(payload.temperature),
      topP: this.optionalNumber(payload.top_p),
      metadata: this.optionalMetadata(payload.metadata),
      rawBody: body,
    };
  }

  fromOpenAiResponse(body: unknown): NormalizedRequest {
    const payload = this.requireRecord(body);
    const input = payload.input;
    const messages = Array.isArray(input)
      ? input.map((item) => this.openAiMessageToNormalized(item))
      : [
          {
            role: "user" as const,
            content: [{ type: "text" as const, text: String(input ?? "") }],
          },
        ];

    return {
      requestId: randomUUID(),
      sourceProtocol: "openai",
      model: this.requireString(payload.model, "model"),
      messages,
      tools: this.openAiToolsToNormalized(payload.tools),
      stream: Boolean(payload.stream),
      maxTokens: this.optionalNumber(payload.max_output_tokens),
      temperature: this.optionalNumber(payload.temperature),
      topP: this.optionalNumber(payload.top_p),
      metadata: this.optionalMetadata(payload.metadata),
      rawBody: body,
    };
  }

  fromAnthropicMessages(body: unknown): NormalizedRequest {
    const payload = this.requireRecord(body);
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const system = payload.system
      ? [
          {
            role: "system" as const,
            content: this.contentToBlocks(payload.system),
          },
        ]
      : [];

    return {
      requestId: randomUUID(),
      sourceProtocol: "anthropic",
      model: this.requireString(payload.model, "model"),
      messages: [
        ...system,
        ...messages.map((message) => this.anthropicMessageToNormalized(message)),
      ],
      tools: this.anthropicToolsToNormalized(payload.tools),
      stream: Boolean(payload.stream),
      maxTokens: this.optionalNumber(payload.max_tokens),
      temperature: this.optionalNumber(payload.temperature),
      topP: this.optionalNumber(payload.top_p),
      metadata: this.optionalMetadata(payload.metadata),
      rawBody: body,
    };
  }

  private openAiMessageToNormalized(input: unknown): NormalizedMessage {
    const message = this.requireRecord(input);
    return {
      role: this.normalizeRole(message.role),
      content: this.contentToBlocks(message.content),
      name: typeof message.name === "string" ? message.name : undefined,
      toolCallId:
        typeof message.tool_call_id === "string" ? message.tool_call_id : undefined,
    };
  }

  private anthropicMessageToNormalized(input: unknown): NormalizedMessage {
    const message = this.requireRecord(input);
    return {
      role: this.normalizeRole(message.role),
      content: this.contentToBlocks(message.content),
    };
  }

  private contentToBlocks(content: unknown): NormalizedContentBlock[] {
    if (typeof content === "string") {
      return [{ type: "text", text: content }];
    }

    if (!Array.isArray(content)) {
      return [{ type: "text", text: String(content ?? "") }];
    }

    return content.map((block) => {
      const item = this.requireRecord(block);
      if (item.type === "image_url") {
        const imageUrl =
          typeof item.image_url === "string"
            ? item.image_url
            : this.requireRecord(item.image_url).url;
        return { type: "image_url", imageUrl: String(imageUrl) };
      }
      if (item.type === "image" && typeof item.source === "object") {
        const source = this.requireRecord(item.source);
        return { type: "image_url", imageUrl: String(source.url ?? "") };
      }
      if (item.type === "tool_result") {
        return {
          type: "tool_result",
          toolCallId: String(item.tool_use_id ?? item.tool_call_id ?? ""),
          content: String(item.content ?? ""),
        };
      }
      return { type: "text", text: String(item.text ?? "") };
    });
  }

  private openAiToolsToNormalized(tools: unknown): NormalizedTool[] | undefined {
    if (!Array.isArray(tools)) {
      return undefined;
    }
    return tools.map((tool) => {
      const item = this.requireRecord(tool);
      const fn = this.requireRecord(item.function ?? {});
      return {
        name: this.requireString(fn.name, "tool.function.name"),
        description: typeof fn.description === "string" ? fn.description : undefined,
        inputSchema: this.requireRecord(fn.parameters ?? {}),
      };
    });
  }

  private anthropicToolsToNormalized(tools: unknown): NormalizedTool[] | undefined {
    if (!Array.isArray(tools)) {
      return undefined;
    }
    return tools.map((tool) => {
      const item = this.requireRecord(tool);
      return {
        name: this.requireString(item.name, "tool.name"),
        description:
          typeof item.description === "string" ? item.description : undefined,
        inputSchema: this.requireRecord(item.input_schema ?? {}),
      };
    });
  }

  private normalizeRole(role: unknown): NormalizedMessage["role"] {
    if (
      role === "system" ||
      role === "user" ||
      role === "assistant" ||
      role === "tool"
    ) {
      return role;
    }
    return "user";
  }

  private requireRecord(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new BadRequestException("Expected JSON object");
    }
    return value as Record<string, unknown>;
  }

  private requireString(value: unknown, field: string): string {
    if (typeof value !== "string" || value.length === 0) {
      throw new BadRequestException(`Missing required field: ${field}`);
    }
    return value;
  }

  private optionalNumber(value: unknown): number | undefined {
    return typeof value === "number" ? value : undefined;
  }

  private optionalMetadata(value: unknown): Record<string, string> | undefined {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return undefined;
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, String(item)]),
    );
  }
}
