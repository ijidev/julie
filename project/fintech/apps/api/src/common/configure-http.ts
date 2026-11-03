import { ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { requestIdMiddleware } from "./request-id.middleware.js";
import { runtimeConfig } from "../config/runtime-config.js";

export function configureHttp(app: NestExpressApplication): void {
  const express = app.getHttpAdapter().getInstance();
  express.disable("x-powered-by");
  express.set("trust proxy", 1);

  app.use(requestIdMiddleware);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        upgradeInsecureRequests: runtimeConfig.environment === "production" ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: runtimeConfig.environment === "production"
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
      : false,
    referrerPolicy: { policy: "no-referrer" },
  }));
  app.useGlobalPipes(new ValidationPipe({
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transform: true,
    whitelist: true,
  }));
  app.setGlobalPrefix("api");
}
