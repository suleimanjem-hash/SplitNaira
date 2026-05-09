import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataSource } from "typeorm";
import { clearEnvCache } from "../config/env.js";
import { closeDatabase, initDatabase } from "./database.js";

const testEnv = {
  DATABASE_URL: "postgres://test:test@localhost:5432/splitnaira_test",
  HORIZON_URL: "https://horizon-testnet.stellar.org",
  SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
  SOROBAN_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  CONTRACT_ID: "C0000000000000000000000000000000000000000000000000000000000000000",
  SIMULATOR_ACCOUNT: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  NODE_ENV: "test"
};

function applyTestEnv(): void {
  for (const [key, value] of Object.entries(testEnv)) {
    process.env[key] = value;
  }
}

function clearTestEnv(): void {
  for (const key of Object.keys(testEnv)) {
    delete process.env[key];
  }
}

describe("database initialization", () => {
  beforeEach(async () => {
    applyTestEnv();
    clearEnvCache();
    await closeDatabase();
  });

  afterEach(async () => {
    await closeDatabase();
    vi.restoreAllMocks();
    clearEnvCache();
    clearTestEnv();
  });

  it("shares one in-flight initialization across concurrent calls", async () => {
    let releaseInitialize: () => void = () => undefined;
    const initializationGate = new Promise<void>((resolve) => {
      releaseInitialize = resolve;
    });

    const initializeSpy = vi.spyOn(DataSource.prototype, "initialize").mockImplementation(async function (this: DataSource) {
      await initializationGate;
      this.isInitialized = true;
      return this;
    });

    const destroySpy = vi.spyOn(DataSource.prototype, "destroy").mockImplementation(async function (this: DataSource) {
      this.isInitialized = false;
    });

    const first = initDatabase();
    const second = initDatabase();

    expect(initializeSpy).toHaveBeenCalledTimes(1);

    releaseInitialize();

    const [firstDataSource, secondDataSource] = await Promise.all([first, second]);

    expect(firstDataSource).toBe(secondDataSource);
    expect(firstDataSource.isInitialized).toBe(true);
    expect(initializeSpy).toHaveBeenCalledTimes(1);

    await closeDatabase();
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });
});
