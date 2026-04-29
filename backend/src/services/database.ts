import { DataSource } from "typeorm";
import { getEnv } from "../config/env.js";
import { logger } from "./logger.js";

let AppDataSource: DataSource | null = null;
let initializationPromise: Promise<DataSource> | null = null;

export async function initDatabase(): Promise<DataSource> {
  if (AppDataSource?.isInitialized) {
    return AppDataSource;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const env = getEnv();
    const databaseUrl = env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required for database initialization.");
    }

    const needsSsl =
      new URL(databaseUrl).hostname !== "localhost" &&
      new URL(databaseUrl).hostname !== "127.0.0.1" &&
      !databaseUrl.includes("sslmode=") &&
      !databaseUrl.includes("ssl=");

    AppDataSource = new DataSource({
      type: "postgres",
      url: databaseUrl,
      synchronize: process.env.NODE_ENV !== "production",
      logging: process.env.NODE_ENV === "development",
      entities: ["src/entities/*.ts"],
      migrations: ["src/migrations/*.ts"],
      migrationsTableName: "migrations",
      ssl: needsSsl
        ? {
            rejectUnauthorized: false
          }
        : false
    });

    try {
      await AppDataSource.initialize();
      logger.info("Database connection established");
      return AppDataSource;
    } catch (error) {
      AppDataSource = null;
      logger.error("Failed to initialize database", { error });
      throw error;
    } finally {
      initializationPromise = null;
    }
  })();

  return initializationPromise;
}

export function getDataSource(): DataSource {
  if (!AppDataSource?.isInitialized) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return AppDataSource;
}

export async function closeDatabase(): Promise<void> {
  if (initializationPromise && !AppDataSource?.isInitialized) {
    try {
      await initializationPromise;
    } catch {
      // Ignore initialization failures during cleanup.
    }
  }

  if (AppDataSource?.isInitialized) {
    await AppDataSource.destroy();
    logger.info("Database connection closed");
  }

  AppDataSource = null;
  initializationPromise = null;
}
