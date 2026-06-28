import { Module } from "@nestjs/common";
import { KeyPoolModule } from "../key-pool/key-pool.module";
import { AnthropicProvider } from "./providers/anthropic.provider";
import { OpenAiProvider } from "./providers/openai.provider";
import { ProviderRegistry } from "./provider-registry.service";

@Module({
  imports: [KeyPoolModule],
  providers: [ProviderRegistry, OpenAiProvider, AnthropicProvider],
  exports: [ProviderRegistry],
})
export class ProvidersModule {}
