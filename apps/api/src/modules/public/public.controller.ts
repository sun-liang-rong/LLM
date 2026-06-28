import { Controller, Get } from "@nestjs/common";
import { PlatformConfigService } from "../billing/platform-config.service";
import { PricingService } from "../billing/pricing.service";

@Controller("public")
export class PublicController {
  constructor(
    private readonly pricing: PricingService,
    private readonly platformConfig: PlatformConfigService,
  ) {}

  @Get("models")
  models() {
    return this.pricing.listPublicModels();
  }

  @Get("model-groups")
  modelGroups() {
    return this.platformConfig.listModelGroups({ publicOnly: true });
  }

  @Get("announcements")
  announcements() {
    return this.platformConfig.listAnnouncements({ publicOnly: true });
  }

  @Get("settings")
  settings() {
    return this.platformConfig.settings();
  }
}
