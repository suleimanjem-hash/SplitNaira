// Known token contracts by network
export type TokenNetwork = "testnet" | "mainnet";

export interface TokenInfo {
  id: string; // Stellar contract ID
  name: string;
  network: TokenNetwork;
  code: string;
}

export const KNOWN_TOKENS: TokenInfo[] = [
  // Testnet tokens
  {
    id: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVHUBXNIHG3DBJ4F3CHWIQY2OJ5G",
    name: "Native Stellar Lumens",
    network: "testnet",
    code: "XLM",
  },
  {
    id: "CBLASIRZ7CUKC7S5IS3VSNMQGKZ5FTRWLHZZXH7H4YG6ZLRFPJF5H2LR",
    name: "USD Coin",
    network: "testnet",
    code: "USDC",
  },
  {
    id: "CDLZJQG2OZZXZAU3YICESOJE73SOXREH74DRBEDAFTMPAQWX3JD3YQ",
    name: "Euro Coin",
    network: "testnet",
    code: "EURC",
  },

  // Mainnet tokens
  {
    id: "CAS3FL6TLZKDGGSISDBWGGPXT3NRR4DYTZD7YODSVGR2UUT5GQOUY3YM",
    name: "Native Stellar Lumens",
    network: "mainnet",
    code: "XLM",
  },
  {
    id: "CBBD3L2DQADRDX3CI4UJL3XNPVVVMMB7VPZL3DQUMHWQ6XGYWYSGPBEM",
    name: "USD Coin",
    network: "mainnet",
    code: "USDC",
  },
  {
    id: "CAQLY5C7KDNHBX64CTMZ7JVYQSXC3MSWQJ5XLPZ7KUG2LSX2DTG3GXM",
    name: "Euro Coin",
    network: "mainnet",
    code: "EURC",
  },
];

export function normalizeTokenNetwork(network: string | null): TokenNetwork | null {
  if (!network) return null;
  const normalized = network.toLowerCase();
  if (normalized.includes("test")) return "testnet";
  if (normalized.includes("main") || normalized.includes("public")) return "mainnet";
  return null;
}

/**
 * Get tokens for a specific network. When the wallet network is unknown,
 * return all presets so users can still pick a known token.
 */
export function getTokensByNetwork(network: string | null): TokenInfo[] {
  const normalizedNetwork = normalizeTokenNetwork(network);
  if (!normalizedNetwork) return KNOWN_TOKENS;
  return KNOWN_TOKENS.filter((token) => token.network === normalizedNetwork);
}

/**
 * Find a token by ID.
 */
export function getTokenById(id: string): TokenInfo | undefined {
  return KNOWN_TOKENS.find((token) => token.id === id);
}

/**
 * Get display name for a token.
 */
export function getTokenDisplayName(id: string): string {
  const token = getTokenById(id);
  return token ? `${token.code} · ${token.name} (${id.slice(0, 6)}…${id.slice(-6)})` : id;
}
