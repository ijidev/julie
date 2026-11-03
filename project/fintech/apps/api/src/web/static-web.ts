import fs from "node:fs";
import path from "node:path";
import type { Request, Response, NextFunction } from "express";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { findProjectRoot } from "../config/project-root.js";

export function configureStaticWeb(app: NestExpressApplication): void {
  const root = findProjectRoot();
  const webDist = path.join(root, "apps", "web", "dist");
  const docs = path.join(root, "docs");
  const index = path.join(webDist, "index.html");
  if (!fs.existsSync(index)) throw new Error("Web build is missing; run npm run build before npm start");

  app.useStaticAssets(docs, {
    prefix: "/docs/",
    index: false,
    fallthrough: true,
    setHeaders: (response) => response.setHeader("cache-control", "private, no-store"),
  });
  app.useStaticAssets(webDist, {
    index: "index.html",
    fallthrough: true,
    setHeaders: (response, file) => {
      response.setHeader("cache-control", file.endsWith("index.html") ? "private, no-store" : "public, max-age=31536000, immutable");
    },
  });

  const express = app.getHttpAdapter().getInstance();
  express.use((request: Request, response: Response, next: NextFunction) => {
    const acceptsHtml = request.accepts("html");
    const isClientRoute = request.method === "GET"
      && !request.path.startsWith("/api")
      && !request.path.startsWith("/docs/")
      && path.extname(request.path) === ""
      && Boolean(acceptsHtml);
    if (!isClientRoute) {
      next();
      return;
    }
    response.setHeader("cache-control", "private, no-store");
    response.sendFile(index);
  });
}
