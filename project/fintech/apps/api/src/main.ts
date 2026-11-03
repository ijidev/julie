import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { configureHttp } from "./common/configure-http.js";
import { runtimeConfig } from "./config/runtime-config.js";
import { configureStaticWeb } from "./web/static-web.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  configureHttp(app);
  configureStaticWeb(app);
  app.enableShutdownHooks();
  await app.listen(runtimeConfig.port, runtimeConfig.host);
  Logger.log(
    `Fintech foundation listening on ${runtimeConfig.host}:${runtimeConfig.port} (${runtimeConfig.environment}; financial operations disabled)`,
    "Bootstrap",
  );
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown startup error";
  Logger.error(`Fintech startup failed: ${message}`, undefined, "Bootstrap");
  process.exitCode = 1;
});
