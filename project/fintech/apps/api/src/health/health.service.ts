import { Inject, Injectable } from "@nestjs/common";
import { runtimeConfig } from "../config/runtime-config.js";
import { DatabaseService } from "../database/database.service.js";

@Injectable()
export class HealthService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async snapshot() {
    const database = await this.database.probe();
    return {
      ok: database.state === "connected",
      service: "fintech-api",
      version: runtimeConfig.version,
      state: database.state === "connected" ? "ready" as const : "degraded" as const,
      environment: runtimeConfig.environment,
      mode: runtimeConfig.mode,
      financialOperationsEnabled: runtimeConfig.financialOperationsEnabled,
      storage: {
        active: runtimeConfig.activeDatabaseEngine,
        hostingTarget: runtimeConfig.hostingDatabaseTarget,
        hostingTargetConnected: false,
      },
      uptimeSeconds: Math.floor(process.uptime()),
      checkedAt: new Date().toISOString(),
      database,
    };
  }
}
