export type StellarNetwork = "testnet" | "mainnet";

export { type SplitProject, type Collaborator } from "../generated/contract-types.js";

// Extended type for frontend with additional computed fields
export interface SplitProjectWithBalance extends SplitProject {
  balance: string;
}

export function getHorizonUrl(network: StellarNetwork) {
  return network === "mainnet"
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org";
}

export function getExplorerUrl(hash: string, network: StellarNetwork | string | null) {
  const isMainnet = network === "mainnet" || network === "public";
  const baseUrl = isMainnet
    ? "https://stellar.expert/explorer/public"
    : "https://stellar.expert/explorer/testnet";
  return `${baseUrl}/tx/${hash}`;
}

export function getExplorerLabel(network: StellarNetwork | string | null) {
  const isMainnet = network === "mainnet" || network === "public";
  return isMainnet ? "Stellar.expert (Mainnet)" : "Stellar.expert (Testnet)";
}

export function formatBasisPoints(bps: number) {
  return `${(bps / 100).toFixed(2)}%`;
}