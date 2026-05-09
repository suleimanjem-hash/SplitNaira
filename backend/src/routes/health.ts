import { Router } from "express";
import { getEnvDiagnostics } from "../config/env.js";
import { getDataSource } from "../services/database.js";

export const healthRouter = Router();

/**
 * Health endpoint - indicates service is running
 * Returns 200 OK if the service process is healthy
 */
healthRouter.get("/", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/**
 * Liveness endpoint - indicates service is not in a broken state
 * Returns 200 OK if the service is alive (should not be restarted)
 */
healthRouter.get("/live", (_req, res) => {
  res.json({
    status: "ok"
  });
});

/**
 * Readiness endpoint - indicates service is ready to serve traffic
 * Returns 200 OK if all dependencies (env, database) are ready
 * Returns 503 Service Unavailable if any dependency is missing
 */
healthRouter.get("/ready", (_req, res) => {
  const requestId = res.locals.requestId;
  
  // Check environment variables
  const envDiagnostics = getEnvDiagnostics();
  if (!envDiagnostics.ok) {
    res.status(503).json({
      status: "not_ready",
      error: "missing_config",
      message: "Required environment variables are missing or malformed.",
      issues: envDiagnostics.issues,
      requestId
    });
    return;
  }

  // Check database connection
  try {
    getDataSource();
  } catch (dbError) {
    res.status(503).json({
      status: "not_ready",
      error: "database_unavailable",
      message: "Database connection is not available.",
      requestId
    });
    return;
  }

  res.json({ status: "ready" });
});