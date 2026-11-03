const environments = ["development", "test", "staging", "production"] as const;
export type AppEnvironment = (typeof environments)[number];

function environment(value: string | undefined): AppEnvironment {
  const candidate = value?.trim().toLowerCase() || "development";
  if (!environments.includes(candidate as AppEnvironment)) {
    throw new Error(`APP_ENV must be one of: ${environments.join(", ")}`);
  }
  return candidate as AppEnvironment;
}

function integer(value: string | undefined, fallback: number, minimum: number, maximum: number, name: string): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function sqlitePath(value: string | undefined): string {
  const root = findProjectRoot();
  const dataRoot = path.resolve(root, "data");
  const candidate = path.resolve(root, value?.trim() || "data/fintech.sqlite");
  if (candidate !== dataRoot && !candidate.startsWith(`${dataRoot}${path.sep}`)) {
    throw new Error("SQLITE_PATH must stay inside the project data directory");
  }
  return candidate;
}

function bindHost(value: string | undefined): string {
  const candidate = value?.trim() || "127.0.0.1";
  if (!/^[A-Za-z0-9:.[\]-]+$/.test(candidate)) throw new Error("HOST contains unsupported characters");
  return candidate;
}

export const runtimeConfig = Object.freeze({
  environment: environment(process.env.APP_ENV),
  host: bindHost(process.env.HOST),
  port: integer(process.env.PORT, 4100, 1, 65_535, "PORT"),
  sqlitePath: sqlitePath(process.env.SQLITE_PATH),
  version: process.env.npm_package_version?.trim() || "0.1.0",
  mode: "foundation" as const,
  financialOperationsEnabled: false as const,
  activeDatabaseEngine: "sqlite" as const,
  hostingDatabaseTarget: "mysql" as const,
});
import path from "node:path";
import dotenv from "dotenv";
import { findProjectRoot } from "./project-root.js";

dotenv.config({ path: path.join(findProjectRoot(), ".env"), quiet: true });
