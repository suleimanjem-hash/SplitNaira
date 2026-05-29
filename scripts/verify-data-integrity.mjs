#!/usr/bin/env node
/**
 * Verifies contract interface artifacts and generated TypeScript types are
 * committed in sync with contracts/*.rs sources.
 *
 * Usage: node scripts/verify-data-integrity.mjs
 * Exit 0 when clean; exit 1 with a diff summary when drift is detected.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

function run(command) {
  execSync(command, { cwd: repoRoot, stdio: "inherit" });
}

function read(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function verifyReadmeErrorCodes() {
  const errorsRs = read("contracts/errors.rs");
  const readme = read("contracts/README.md");
  const codes = [...errorsRs.matchAll(/^\s+(\w+)\s*=\s*(\d+),/gm)].map((m) => ({
    name: m[1],
    code: Number(m[2])
  }));

  const missing = codes.filter(({ name, code }) => {
    const linePattern = new RegExp(`- \\\`${code}\\\` \\\`${name}\\\``);
    return !linePattern.test(readme);
  });

  if (missing.length > 0) {
    console.error(
      "[verify:data-integrity] contracts/README.md is missing error entries:",
      missing.map((e) => `${e.code} ${e.name}`).join(", ")
    );
    process.exit(1);
  }
}

function gitDiff(paths) {
  try {
    return execSync(`git diff --exit-code -- ${paths.join(" ")}`, {
      cwd: repoRoot,
      encoding: "utf8"
    });
  } catch (error) {
    if (error.status === 1) {
      console.error(
        "[verify:data-integrity] Generated artifacts are out of date. Run:\n" +
          "  npm run generate:contract-interface\n" +
          "  npm run generate:contract-types\n" +
          "Then commit the updated files."
      );
      try {
        execSync(`git diff -- ${paths.join(" ")}`, { cwd: repoRoot, stdio: "inherit" });
      } catch {
        /* ignore */
      }
      process.exit(1);
    }
    throw error;
  }
}

console.log("SplitNaira data integrity verification");
console.log("====================================");

verifyReadmeErrorCodes();
console.log("✓ contracts/README.md error table matches errors.rs");

run("node contracts/scripts/generate-interface.mjs");
gitDiff(["contracts/interface/splitnaira.contract-interface.json"]);
console.log("✓ contract interface artifact is current");

run("node scripts/generate-contract-types.mjs");
gitDiff([
  "backend/src/generated/contract-types.ts",
  "frontend/src/generated/contract-types.ts"
]);
console.log("✓ generated contract types match interface artifact");

console.log("\nAll data integrity checks passed.");
