import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function requestIdMiddleware(request: Request, response: Response, next: NextFunction): void {
  const supplied = request.header("x-request-id")?.trim();
  const requestId = supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : crypto.randomUUID();
  response.setHeader("x-request-id", requestId);
  response.locals.requestId = requestId;
  next();
}
