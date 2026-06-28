import { Injectable } from "@nestjs/common";
import type { ProviderId, UpstreamProtocol } from "@gateway/shared";
import { AnthropicProvider } from "./providers/anthropic.provider";
import { OpenAiProvider } from "./providers/openai.provider";
import type { ProviderAdapter } from "./providers/provider-adapter";

@Injectable()
export class ProviderRegistry {
  constructor(
    private readonly openAi: OpenAiProvider,
    private readonly anthropic: AnthropicProvider,
  ) {}

  get(provider: ProviderId | UpstreamProtocol): ProviderAdapter {
    if (provider === "anthropic") {
      return this.anthropic;
    }
    return this.openAi;
  }
}
