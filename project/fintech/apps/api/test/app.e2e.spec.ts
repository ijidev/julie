import "reflect-metadata";
import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { configureHttp } from "../src/common/configure-http.js";
import { DatabaseService } from "../src/database/database.service.js";

describe("fintech foundation API", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({ probe: async () => ({ state: "connected", engine: "sqlite", latencyMs: 2, migrations: 1 }) })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureHttp(app as NestExpressApplication);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("reports observed database readiness without exposing internals", async () => {
    const response = await request(app.getHttpServer()).get("/api/health").expect(200);
    expect(response.body).toMatchObject({
      ok: true,
      service: "fintech-api",
      state: "ready",
      mode: "foundation",
      financialOperationsEnabled: false,
      storage: { active: "sqlite", hostingTarget: "mysql", hostingTargetConnected: false },
      database: { state: "connected", engine: "sqlite", latencyMs: 2, migrations: 1 },
    });
    expect(response.headers["x-request-id"]).toBeTruthy();
    expect(JSON.stringify(response.body)).not.toMatch(/SQLITE_PATH|fintech\.sqlite|\/home\//i);
  });

  it("reports every requested money capability as unavailable", async () => {
    const response = await request(app.getHttpServer()).get("/api/capabilities").expect(200);
    expect(response.body.source).toBe("application-code");
    expect(response.body.financialOperationsEnabled).toBe(false);
    expect(response.body.features).toHaveLength(8);
    expect(response.body.features.every((feature: { available: boolean; state: string }) => !feature.available && feature.state === "not_implemented")).toBe(true);
  });

  it("returns 503 readiness when the active SQLite build is unavailable", async () => {
    const database = app.get(DatabaseService) as unknown as { probe: () => Promise<unknown> };
    database.probe = async () => ({ state: "unavailable", engine: "sqlite", latencyMs: 1, reason: "query_failed" });
    const response = await request(app.getHttpServer()).get("/api/readiness").expect(503);
    expect(response.body).toMatchObject({ ok: false, state: "degraded", database: { reason: "query_failed" } });
  });

  it("does not enable mutation routes", async () => {
    await request(app.getHttpServer()).post("/api/transfers").send({ amount: 1 }).expect(404);
  });
});
