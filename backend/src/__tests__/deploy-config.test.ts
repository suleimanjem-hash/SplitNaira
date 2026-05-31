import { describe, it, expect } from "vitest";
import {
  normalizeDeployEnvironment,
  resolveDeployTarget,
  validateDeployConfig
} from "../utils/deploy-config.js";

describe("deploy-config utility", () => {
  it("normalizes staging environment", () => {
    expect(normalizeDeployEnvironment("staging")).toBe("staging");
    expect(normalizeDeployEnvironment("STAGING")).toBe("staging");
  });

  it("normalizes production environment", () => {
    expect(normalizeDeployEnvironment("production")).toBe("production");
    expect(normalizeDeployEnvironment("PRODUCTION")).toBe("production");
  });

  it("throws for unsupported deploy environments", () => {
    expect(() => normalizeDeployEnvironment("dogfood")).toThrowError(/Invalid deploy environment/);
  });

  it("resolves explicit deploy target when provided", () => {
    expect(resolveDeployTarget("render", "" )).toBe("render");
    expect(resolveDeployTarget("custom", "render")).toBe("custom");
  });

  it("falls back to repo variable when deploy target input is empty", () => {
    expect(resolveDeployTarget("", "render")).toBe("render");
  });

  it("uses default deploy target when neither input nor repo var is set", () => {
    expect(resolveDeployTarget(undefined, undefined)).toBe("render");
  });

  it("validates production deploy config with required secrets", () => {
    expect(() =>
      validateDeployConfig({
        deployEnvironment: "production",
        secrets: {
          RENDER_BACKEND_DEPLOY_HOOK_URL: "https://example.com/deploy",
          MAINNET_CONTRACT_ID: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        }
      })
    ).not.toThrow();
  });

  it("throws when production deploy config is missing secrets", () => {
    expect(() =>
      validateDeployConfig({
        deployEnvironment: "production",
        secrets: {
          RENDER_BACKEND_DEPLOY_HOOK_URL: "",
          MAINNET_CONTRACT_ID: ""
        }
      })
    ).toThrowError(/Missing required production secrets/);
  });
});
