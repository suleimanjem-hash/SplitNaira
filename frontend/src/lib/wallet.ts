"use client";

import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { AlbedoModule } from "@creit.tech/stellar-wallets-kit/modules/albedo";
import { RabetModule } from "@creit.tech/stellar-wallets-kit/modules/rabet";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";

export { createSorobanRpcServer, submitSorobanTransactionAndPoll } from "./soroban-transaction";

export interface WalletState {
  connected: boolean;
  address: string | null;
  network: string | null;
}

let kit: StellarWalletsKit | null = null;

function getKit(): StellarWalletsKit {
  if (!kit) {
    StellarWalletsKit.init({
      modules: [
        new FreighterModule(),
        new AlbedoModule(),
        new RabetModule(),
        new xBullModule(),
      ],
    });
    kit = StellarWalletsKit as unknown as StellarWalletsKit;
  }
  return StellarWalletsKit as unknown as StellarWalletsKit;
}

function parseNetwork(network: string): string {
  const n = network.toLowerCase();
  if (n.includes("test")) return "TESTNET";
  if (n.includes("future")) return "FUTURENET";
  if (n.includes("public") || n.includes("main")) return "PUBLIC";
  if (n.includes("sandbox")) return "SANDBOX";
  if (n.includes("standalone")) return "STANDALONE";
  return network;
}

export async function getWalletState(): Promise<WalletState> {
  try {
    const { address } = await StellarWalletsKit.getAddress();
    const rawNetwork = StellarWalletsKit.getNetwork
      ? await StellarWalletsKit.getNetwork()
      : null;
    const resolvedNetwork = typeof rawNetwork === "object" && rawNetwork !== null
      ? (rawNetwork as any).network
      : rawNetwork;
    return {
      connected: true,
      address: address ?? null,
      network: typeof resolvedNetwork === "string" ? parseNetwork(resolvedNetwork) : null,
    };
  } catch {
    return { connected: false, address: null, network: null };
  }
}

export async function connectWallet(network?: string): Promise<WalletState> {
  const targetNetwork = network ?? "TESTNET";
  StellarWalletsKit.setNetwork(targetNetwork as any);
  const { address } = await StellarWalletsKit.authModal();
  const rawNetwork = StellarWalletsKit.getNetwork
    ? await StellarWalletsKit.getNetwork()
    : targetNetwork;
  const resolvedNetwork = typeof rawNetwork === "object" && rawNetwork !== null
    ? (rawNetwork as any).network
    : rawNetwork;
  return {
    connected: true,
    address: address ?? null,
    network: typeof resolvedNetwork === "string" ? parseNetwork(resolvedNetwork) : targetNetwork,
  };
}

export async function signWithWallet(xdr: string, networkPassphrase: string): Promise<string> {
  const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
    networkPassphrase,
  });
  if (!signedTxXdr) {
    throw new Error("Wallet did not return a signed transaction.");
  }
  return signedTxXdr;
}
