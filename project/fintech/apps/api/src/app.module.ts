import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";
import { PlatformModule } from "./platform/platform.module.js";

@Module({
  imports: [DatabaseModule, HealthModule, PlatformModule],
})
export class AppModule {}
