// Single-owner login gate. Session cookie is HttpOnly; value = ADMIN_TOKEN (constant-time compare).
import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { config } from "./config.js";

export const SESSION_COOKIE = "julie_session";

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie ?? "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function loginHandler(req: Request, res: Response): void {
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!password || !safeEqual(password, config.adminPassword)) {
    res.status(401).json({ ok: false, error: "invalid password" });
    return;
  }
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(config.adminToken)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
  );
  res.json({ ok: true });
}

export function logoutHandler(_req: Request, res: Response): void {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.json({ ok: true });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const cookie = parseCookies(req)[SESSION_COOKIE];
  if (cookie && safeEqual(cookie, config.adminToken)) {
    next();
    return;
  }
  res.status(401).json({ ok: false, error: "unauthorized" });
}