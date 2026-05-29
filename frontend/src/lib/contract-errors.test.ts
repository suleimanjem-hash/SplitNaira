import { describe, expect, it } from "vitest";

import { ContractErrors } from "@/generated/contract-types";
import { formatContractFailure, parseContractError } from "./contract-errors";

describe("parseContractError", () => {
  it("maps numeric contract error codes to friendly messages", () => {
    expect(parseContractError(`HostError: Error(Contract, #${ContractErrors.DistributionsPaused})`)).toContain(
      "paused"
    );
    expect(parseContractError("contract error: 7")).toContain("no balance");
  });

  it("maps error names embedded in RPC strings", () => {
    expect(parseContractError("SplitError::Unauthorized")).toContain("not authorized");
  });

  it("returns null for unrelated errors", () => {
    expect(parseContractError("timeout waiting for ledger")).toBeNull();
  });
});

describe("formatContractFailure", () => {
  it("returns parsed message when available", () => {
    expect(formatContractFailure(`Error(${ContractErrors.InvalidSplit})`)).toContain("10,000");
  });

  it("falls back to raw text or default", () => {
    expect(formatContractFailure("")).toBe("Transaction failed on ledger.");
    expect(formatContractFailure("custom rpc failure")).toBe("custom rpc failure");
  });
});
