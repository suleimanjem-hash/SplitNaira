import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import swaggerUi from "swagger-ui-express";
import { healthRouter } from "./routes/health.js";
import { splitsRouter } from "./routes/splits.js";
import { usersRouter } from "./routes/users.js";
import { transactionsRouter } from "./routes/transactions.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { globalLimiter, readLimiter, writeLimiter, adminLimiter, authLimiter } from "./middleware/rate-limit.js";
import { validateEnv, printEnvDiagnostics } from "./config/env.js";
import { initDatabase, closeDatabase } from "./services/database.js";
import { logger } from "./services/logger.js";
import { generateOpenApi } from "./openapi.js";

dotenv.config();

export const app = express();

app.disable("x-powered-by");

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean)
  : ["http://localhost:3000"];

const corsOrigin = corsOrigins.length > 0 ? corsOrigins : false;

app.use(helmet());
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: "1mb" }));
app.use(requestIdMiddleware);
// Global safety-net — must run before all route-specific limiters (#290)
app.use(globalLimiter);
app.use(
  morgan((tokens, req, res) => {
    const requestId = res.locals.requestId ?? req.header("x-request-id") ?? "-";
    return [
      tokens.method(req, res),
      tokens.url(req, res),
      tokens.status(req, res),
      "-",
      tokens["response-time"](req, res),
      "ms",
      "x-request-id=",
      String(requestId)
    ].join(" ");
  })
);

SplitNaira is in active development. This repo currently contains:

- `contracts/` Soroban smart contract and tests
- `frontend/` Next.js + Tailwind scaffold
- `backend/` Express API scaffold
- `demo/` Static HTML flow prototype

app.use("/health", readLimiter);
app.use("/splits/admin", adminLimiter);
app.use("/splits", (req, res, next) => {
  if (req.method === "GET") return readLimiter(req, res, next);
  return writeLimiter(req, res, next);
});
// Auth endpoints get a stricter per-IP limiter to block credential stuffing
app.use("/users/register", authLimiter);
app.use("/users/login", authLimiter);
app.use("/users", (req, res, next) => {
  if (req.method === "GET") return readLimiter(req, res, next);
  return writeLimiter(req, res, next);
});
app.use("/transactions", readLimiter);

app.get("/", (_req, res) => {
  res.json({
    name: "SplitNaira API",
    status: "ok",
    version: "0.1.0"
  });
});

app.use("/health", healthRouter);
app.use("/splits", splitsRouter);
app.use("/users", usersRouter);
app.use("/transactions", transactionsRouter);

// ─── OpenAPI & Swagger Documentation ──────────────────────────────────────────

// Serve OpenAPI spec as JSON
app.get("/api/openapi.json", (_req, res) => {
  const spec = generateOpenApi();
  res.json(spec);
});

// Serve Swagger UI at /api/docs
const swaggerOptions = {
  customCss: ".swagger-ui .topbar { display: none }",
  customSiteTitle: "SplitNaira API Documentation",
  swaggerOptions: {
    url: "/api/openapi.json",
    displayOperationId: true,
    filter: true,
    showExtensions: true,
  },
};

app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(null, swaggerOptions));

// Redirect /api/docs/ to /api/docs
app.get("/api/docs/", (_req, res) => {
  res.redirect("/api/docs");
});

app.use(notFoundHandler);
app.use(errorHandler);

if (process.env.NODE_ENV !== "test") {
  // Startup wrapper to allow clean fatal handling
  const start = async () => {
    try {
      if (process.env.NODE_ENV !== "production") {
        printEnvDiagnostics();
      }
      validateEnv();

      await initDatabase();

      const port = Number(process.env.PORT ?? 3001);
      const server = app.listen(port, () => {
        logger.info(`Server started on port ${port}`);
      });

      // Graceful shutdown
      const shutdown = async (signal: NodeJS.Signals) => {
        logger.info(`Received ${signal}. Shutting down...`);
        await closeDatabase();
        server.close((err?: Error) => {
          if (err) {
            logger.error("Error during server close", { error: err });
            process.exit(1);
          }
          logger.info("Server closed cleanly");
          process.exit(0);
        });

        // Fallback: force exit after timeout
        const forceTimeoutMs = Number(process.env.SHUTDOWN_FORCE_TIMEOUT_MS ?? 10_000);
        setTimeout(() => {
          logger.warn("Force exiting after timeout");
          process.exit(1);
        }, forceTimeoutMs).unref();
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      // Fatal error handlers
      process.on("unhandledRejection", (reason) => {
        logger.error("Unhandled promise rejection", { reason });
        process.exit(1);
      });
      process.on("uncaughtException", (err) => {
        logger.error("Uncaught exception", { error: err });
        process.exit(1);
      });
    } catch (err) {
      logger.error("Failed to start server", { error: err });
      process.exit(1);
    }
  };
  // Immediately invoke
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  start();
}

