import { Request, Response, NextFunction } from "express";
import { RpcTimeoutError } from "../services/stellar.js";

const DEFAULT_TIMEOUT_MS = 30_000;

export function requestTimeout(ms = DEFAULT_TIMEOUT_MS) {
  return (_req: Request, res: Response, next: NextFunction) => {
   const timer = setTimeout(() => {
  if (!res.headersSent) {
    next(new RpcTimeoutError("Request timeout"));
  }
}, ms);

    res.on("finish", () => clearTimeout(timer));
    res.on("close", () => clearTimeout(timer));
    next();
  };
}