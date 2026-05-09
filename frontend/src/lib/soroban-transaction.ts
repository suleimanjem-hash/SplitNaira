"use client";

import { rpc, Transaction, type FeeBumpTransaction } from "@stellar/stellar-sdk";

import { getEnv } from "./env";

const DEFAULT_POLL_ATTEMPTS = 90;

/** Matches Soroban RPC `getTransaction` status strings (see @stellar/stellar-sdk rpc.Api.GetTransactionStatus). */
const GET_TX = {
  NOT_FOUND: "NOT_FOUND",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED"
} as const;

export function createSorobanRpcServer(): rpc.Server {
  return new rpc.Server(getEnv().NEXT_PUBLIC_SOROBAN_RPC_URL, { allowHttp: true });
}

function submissionErrorMessage(submit: rpc.Api.SendTransactionResponse): string {
  if (submit.status === "ERROR") {
    return submit.errorResult?.toString() ?? "Transaction rejected by the network.";
  }
  if (submit.status === "TRY_AGAIN_LATER") {
    return "The RPC node is busy. Please wait a moment and try again.";
  }
  return `Unexpected submission status: ${submit.status}`;
}

function ledgerFailureMessage(polled: rpc.Api.GetTransactionResponse): string {
  if (polled.status === GET_TX.FAILED && "resultXdr" in polled && polled.resultXdr) {
    try {
      return polled.resultXdr.toString();
    } catch {
      /* fall through */
    }
  }
  return "Transaction failed on ledger (see explorer for details).";
}

/**
 * Submits a signed Soroban transaction, then polls until the RPC reports a
 * terminal ledger outcome (success, failure, or poll timeout).
 */
export async function submitSorobanTransactionAndPoll(
  server: rpc.Server,
  transaction: Transaction | FeeBumpTransaction,
  options?: {
    pollAttempts?: number;
    /** Invoked as soon as the RPC accepts the tx (hash known), before polling completes. */
    afterSubmitted?: (hash: string) => void;
  }
): Promise<{ hash: string }> {
  const submit = await server.sendTransaction(transaction);

  if (submit.status === "ERROR" || submit.status === "TRY_AGAIN_LATER") {
    throw new Error(submissionErrorMessage(submit));
  }

  const hash = submit.hash;
  if (!hash) {
    throw new Error("Submission did not return a transaction hash.");
  }

  options?.afterSubmitted?.(hash);

  const polled = await server.pollTransaction(hash, {
    attempts: options?.pollAttempts ?? DEFAULT_POLL_ATTEMPTS
  });

  if (polled.status === GET_TX.NOT_FOUND) {
    throw new Error(
      "Transaction was submitted but not confirmed in time. Check the explorer for the latest status."
    );
  }

  if (polled.status === GET_TX.FAILED) {
    throw new Error(ledgerFailureMessage(polled));
  }

  if (polled.status === GET_TX.SUCCESS) {
    return { hash };
  }

  throw new Error(`Unexpected transaction status: ${String((polled as { status: string }).status)}`);
}
