import { fileURLToPath } from "node:url";

export type DeployEnvironment = "staging" | "production";

const VALID_DEPLOY_ENVIRONMENTS = ["staging", "production"] as const;
const DEFAULT_DEPLOY_TARGET = "render";

export function normalizeDeployEnvironment(value?: string): DeployEnvironment {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || !VALID_DEPLOY_ENVIRONMENTS.includes(normalized as DeployEnvironment)) {
    throw new Error(
      `Invalid deploy environment: ${value}. Allowed values: ${VALID_DEPLOY_ENVIRONMENTS.join(", ")}`
    );
  }
  return normalized as DeployEnvironment;
}

export function resolveDeployTarget(input?: string, repoVar?: string): string {
  const target = input?.trim().toLowerCase();
  if (target) {
    return target;
  }
  if (repoVar && repoVar.trim().length > 0) {
    return repoVar.trim().toLowerCase();
  }
  return DEFAULT_DEPLOY_TARGET;
}

export function validateProductionSecrets(secrets: Record<string, string | undefined>): void {
  const missing = [];

  if (!secrets.RENDER_BACKEND_DEPLOY_HOOK_URL?.trim()) {
    missing.push("RENDER_BACKEND_DEPLOY_HOOK_URL");
  }
  if (!secrets.MAINNET_CONTRACT_ID?.trim()) {
    missing.push("MAINNET_CONTRACT_ID");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required production secrets: ${missing.join(", ")}. ` +
        "Set them in GitHub or your deployment environment before running a production deploy."
    );
  }
}

export function validateDeployConfig(options: {
  deployEnvironment?: string;
  deployTarget?: string;
  repoDeployTarget?: string;
  secrets?: Record<string, string | undefined>;
}): {
  deployEnvironment: DeployEnvironment;
  deployTarget: string;
} {
  const deployEnvironment = normalizeDeployEnvironment(options.deployEnvironment);
  const deployTarget = resolveDeployTarget(options.deployTarget, options.repoDeployTarget);

  if (deployEnvironment === "production") {
    validateProductionSecrets(options.secrets ?? {});
  }

  return { deployEnvironment, deployTarget };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] === scriptPath) {
  const [_node, _script, command, deployTarget, deployEnvironment] = process.argv;

  if (command !== "validate") {
    console.error("Usage: tsx backend/src/utils/deploy-config.ts validate [deployTarget] [deployEnvironment]");
    process.exit(1);
  }

  try {
    const normalized = validateDeployConfig({
      deployEnvironment,
      deployTarget,
      repoDeployTarget: process.env.BACKEND_DEPLOY_TARGET,
      secrets: {
        RENDER_BACKEND_DEPLOY_HOOK_URL: process.env.RENDER_BACKEND_DEPLOY_HOOK_URL,
        MAINNET_CONTRACT_ID: process.env.MAINNET_CONTRACT_ID
      }
    });

    console.log("Deployment config validated:", JSON.stringify(normalized));
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
