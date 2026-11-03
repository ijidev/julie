import { Controller, Get, Header, Inject } from "@nestjs/common";
import { PlatformService } from "./platform.service.js";

@Controller()
export class PlatformController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get()
  @Header("cache-control", "no-store")
  index() {
    return {
      service: "fintech-api",
      endpoints: ["api/health", "api/readiness", "api/capabilities"],
    };
  }

  @Get("capabilities")
  @Header("cache-control", "no-store")
  capabilities() {
    return this.platform.projection();
  }
}
