import { Body, Controller, Get, Headers, Post, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import type { Readable } from "node:stream";
import { ApiKeyService } from "../auth/api-key.service";
import { ModelRouterService } from "../model-router/model-router.service";
import { GatewayService } from "./gateway.service";

@Controller("v1")
export class GatewayController {
  constructor(
    private readonly gateway: GatewayService,
    private readonly models: ModelRouterService,
    private readonly apiKeys: ApiKeyService,
  ) {}

  @Get("models")
  async modelsList(@Headers() headers: Record<string, unknown>) {
    await this.apiKeys.verify(this.apiKeys.extract(headers));
    return {
      object: "list",
      data: (await this.models.listAliases()).map((alias) => ({
        id: alias.alias,
        object: "model",
        owned_by: alias.targets[0]?.providerSlug ?? "gateway",
        display_name: alias.alias,
      })),
    };
  }

  @Post("chat/completions")
  async openAiChat(
    @Body() body: unknown,
    @Headers() headers: Record<string, unknown>,
    @Res() reply: FastifyReply,
  ) {
    const auth = await this.apiKeys.verify(this.apiKeys.extract(headers));
    const result = await this.gateway.handleOpenAiChat(body, auth);
    return this.sendProviderResult(reply, result);
  }

  @Post("responses")
  async openAiResponses(
    @Body() body: unknown,
    @Headers() headers: Record<string, unknown>,
    @Res() reply: FastifyReply,
  ) {
    const auth = await this.apiKeys.verify(this.apiKeys.extract(headers));
    const result = await this.gateway.handleOpenAiResponse(body, auth);
    return this.sendProviderResult(reply, result);
  }

  @Post("messages")
  async anthropicMessages(
    @Body() body: unknown,
    @Headers() headers: Record<string, unknown>,
    @Res() reply: FastifyReply,
  ) {
    const auth = await this.apiKeys.verify(this.apiKeys.extract(headers));
    const result = await this.gateway.handleAnthropicMessages(body, auth);
    return this.sendProviderResult(reply, result);
  }

  @Post("messages/count_tokens")
  async countTokens(
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, unknown>,
  ) {
    await this.apiKeys.verify(this.apiKeys.extract(headers));
    const text = JSON.stringify(body);
    return {
      input_tokens: Math.ceil(text.length / 4),
    };
  }

  private sendProviderResult(
    reply: FastifyReply,
    result: Awaited<ReturnType<GatewayService["handleOpenAiChat"]>>,
  ) {
    reply.status(result.statusCode);

    if (result.type === "json") {
      return reply.send(result.data);
    }

    for (const [name, value] of Object.entries(result.headers)) {
      reply.header(name, value);
    }
    reply.header("x-accel-buffering", "no");
    reply.raw.on("close", () => {
      const stream = result.body as Readable;
      if (!stream.readableEnded && !reply.raw.writableEnded) {
        stream.destroy();
      }
    });
    return reply.send(result.body);
  }
}
