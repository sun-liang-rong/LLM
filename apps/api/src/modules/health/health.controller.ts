import { Controller, Get } from "@nestjs/common";

@Controller()
export class HealthController {
  @Get("health")
  health() {
    return {
      status: "ok",
      service: "ai-coding-gateway",
      timestamp: new Date().toISOString(),
    };
  }
}
