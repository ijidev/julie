import { Controller, Get, Header, Inject, Res } from "@nestjs/common";
import type { Response } from "express";
import { HealthService } from "./health.service.js";

@Controller()
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get("health")
  @Header("cache-control", "no-store")
  snapshot() {
    return this.health.snapshot();
  }

  @Get("readiness")
  @Header("cache-control", "no-store")
  async readiness(@Res({ passthrough: true }) response: Response) {
    const snapshot = await this.health.snapshot();
    if (!snapshot.ok) response.status(503);
    return snapshot;
  }
}
