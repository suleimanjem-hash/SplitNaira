import type { SplitProject } from "./stellar";
import { getEnv } from "./env";

const API_BASE_URL = getEnv().NEXT_PUBLIC_API_BASE_URL;

export interface CreateSplitPayload {
  owner: string;
  projectId: string;
  title: string;
  projectType: string;
  token: string;
  collaborators: Array<{
    address: string;
    alias: string;
    basisPoints: number;
  }>;
}

export interface ProjectHistoryItem {
  id: string;
  type: "round" | "payment";
  round: number;
  amount: string | number;
  recipient: string;
  ledgerCloseTime: number;
  txHash: string;
}

interface BuildSplitResponse {
  xdr: string;
  metadata: {
    networkPassphrase: string;
    contractId: string;
  };
}

function toErrorMessage(status: number, payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return `${fallback} (status ${status})`;
}

export async function buildCreateSplitXdr(payload: CreateSplitPayload): Promise<BuildSplitResponse> {
  const response = await fetch(`${API_BASE_URL}/splits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, body, "Failed to build split transaction"));
  }
  return body as BuildSplitResponse;
}

export async function buildDistributeXdr(projectId: string, sourceAddress: string): Promise<BuildSplitResponse> {
  const response = await fetch(`${API_BASE_URL}/splits/${encodeURIComponent(projectId)}/distribute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceAddress })
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, body, "Failed to build distribution transaction"));
  }
  return body as BuildSplitResponse;
}

export async function buildLockProjectXdr(projectId: string, owner: string): Promise<BuildSplitResponse> {
  const response = await fetch(`${API_BASE_URL}/splits/${encodeURIComponent(projectId)}/lock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner })
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, body, "Failed to build lock transaction"));
  }
  return body as BuildSplitResponse;
}

export async function buildDepositXdr(
  projectId: string,
  from: string,
  amount: number
): Promise<BuildSplitResponse> {
  const response = await fetch(`${API_BASE_URL}/splits/${encodeURIComponent(projectId)}/deposit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, amount })
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, body, "Failed to build deposit transaction"));
  }
  return body as BuildSplitResponse;
}

export async function buildUpdateMetadataXdr(
  projectId: string,
  owner: string,
  title: string,
  projectType: string
): Promise<BuildSplitResponse> {
  const response = await fetch(`${API_BASE_URL}/splits/${encodeURIComponent(projectId)}/metadata`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, title, projectType })
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, body, "Failed to build metadata update transaction"));
  }
  return body as BuildSplitResponse;
}

export async function buildUpdateCollaboratorsXdr(
  projectId: string,
  owner: string,
  collaborators: Array<{ address: string; alias: string; basisPoints: number }>
): Promise<BuildSplitResponse> {
  const response = await fetch(`${API_BASE_URL}/splits/${encodeURIComponent(projectId)}/collaborators`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, collaborators })
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, body, "Failed to build collaborators update transaction"));
  }
  return body as BuildSplitResponse;
}

export async function getSplit(projectId: string): Promise<SplitProject> {
  const response = await fetch(`${API_BASE_URL}/splits/${encodeURIComponent(projectId)}`);
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, body, "Failed to fetch split project"));
  }
  return body as SplitProject;
}

export async function getAllSplits(): Promise<SplitProject[]> {
  const response = await fetch(`${API_BASE_URL}/splits`);
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, body, "Failed to fetch projects"));
  }
  return body as SplitProject[];
}

export interface ListProjectsParams {
  start?: number;
  limit?: number;
}

export async function listProjects(params?: ListProjectsParams): Promise<SplitProject[]> {
  const url = new URL(`${API_BASE_URL}/splits`);
  if (params?.start !== undefined) {
    url.searchParams.set('start', params.start.toString());
  }
  if (params?.limit !== undefined) {
    url.searchParams.set('limit', params.limit.toString());
  }
  const response = await fetch(url.toString());
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, body, "Failed to fetch projects"));
  }
  return body as SplitProject[];
}

export async function getClaimable(projectId: string, address: string): Promise<{ claimed: number; claimable: number }> {
  const response = await fetch(`${API_BASE_URL}/splits/${encodeURIComponent(projectId)}/claimable/${encodeURIComponent(address)}`);
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, body, "Failed to fetch claimable info"));
  }
  return body as { claimed: number; claimable: number };
}

export async function getProjectHistory(
  projectId: string,
  cursor?: string
): Promise<{ items: ProjectHistoryItem[]; nextCursor: string | null }> {
  const url = new URL(`${API_BASE_URL}/splits/${encodeURIComponent(projectId)}/history`);
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }
  
  const response = await fetch(url.toString());
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as unknown;
    throw new Error(toErrorMessage(response.status, body, "Failed to fetch project history"));
  }
  return (await response.json()) as { items: ProjectHistoryItem[]; nextCursor: string | null };
}
import type { SplitProject } from "./stellar";
import { getEnv } from "./env";

const API_BASE_URL = getEnv().NEXT_PUBLIC_API_BASE_URL;
export interface CreateSplitPayload {
  owner: string;
  projectId: string;
  title: string;
  projectType: string;
  token: string;
  collaborators: Array<{
    address: string;
    alias: string;
    basisPoints: number;
  }>;
}
export interface ProjectHistoryItem {
  id: string;
  type: "round" | "payment";
  round: number;
  amount: string | number;
  recipient: string;
  ledgerCloseTime: number;
  txHash: string;
}
interface BuildSplitResponse {
  xdr: string;
  metadata: {
    networkPassphrase: string;
    contractId: string;
  };
}
export interface RemediationHint {
  message: string;
  action?: string;
  docsUrl?: string;
}

export interface ApiErrorResponse {
  error: string;
  code: string;
  type: string;
  message: string;
  remediation?: RemediationHint;
  requestId: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public payload: ApiErrorResponse,
    fallback: string
  ) {
    super(payload?.message || fallback);
    this.name = "ApiError";
  }

  get remediation() {
    return this.payload?.remediation;
  }

  get code() {
    return this.payload?.code;
  }
}

async function handleResponse<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as unknown;
  
  if (!response.ok) {
    const errorPayload = body as ApiErrorResponse;
    throw new ApiError(response.status, errorPayload, fallback);
  }
  
  return body as T;
}

export async function buildCreateSplitXdr(payload: CreateSplitPayload): Promise<BuildSplitResponse> {
  const response = await fetch(`${API_BASE_URL}/splits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return handleResponse<BuildSplitResponse>(response, "Failed to build split transaction");
}

export async function buildDistributeXdr(projectId: string, sourceAddress: string): Promise<BuildSplitResponse> {
  const response = await fetch(`${API_BASE_URL}/splits/${encodeURIComponent(projectId)}/distribute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceAddress })
  });
  return handleResponse<BuildSplitResponse>(response, "Failed to build distribution transaction");
}

export async function buildLockProjectXdr(projectId: string, owner: string): Promise<BuildSplitResponse> {
  const response = await fetch(`${API_BASE_URL}/splits/${encodeURIComponent(projectId)}/lock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner })
  });
  return handleResponse<BuildSplitResponse>(response, "Failed to build lock transaction");
}

export async function buildDepositXdr(
  projectId: string,
  from: string,
  amount: number
): Promise<BuildSplitResponse> {
  const response = await fetch(`${API_BASE_URL}/splits/${encodeURIComponent(projectId)}/deposit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, amount })
  });
  return handleResponse<BuildSplitResponse>(response, "Failed to build deposit transaction");
}

export async function getSplit(projectId: string): Promise<SplitProject> {
  const response = await fetch(`${API_BASE_URL}/splits/${encodeURIComponent(projectId)}`);
  return handleResponse<SplitProject>(response, "Failed to fetch split project");
}

export async function getProjectHistory(
  projectId: string,
): Promise<ProjectHistoryItem[]> {
  const response = await fetch(`${API_BASE_URL}/splits/${encodeURIComponent(projectId)}/history`);
  return handleResponse<ProjectHistoryItem[]>(response, "Failed to fetch project history");
}
import type { SplitProject } from "./stellar";
import { getEnv } from "./env";

const API_BASE_URL = getEnv().NEXT_PUBLIC_API_BASE_URL;

export interface CreateSplitPayload {
  owner: string;
  projectId: string;
  title: string;
  projectType: string;
  token: string;
  collaborators: Array<{
    address: string;
    alias: string;
    basisPoints: number;
  }>;
}

export interface ProjectHistoryItem {
  id: string;
  type: "round" | "payment";
  round: number;
  amount: string | number;
  recipient: string;
  ledgerCloseTime: number;
  txHash: string;
}

export interface ProjectHistoryResponse {
  items: ProjectHistoryItem[];
  nextCursor: string | null;
}

export interface ClaimableInfo {
  claimed: string | number;
  claimable?: string | number;
  distributionRound?: number;
}

export interface TokenAllowlistState {
  admin: string | null;
  allowedTokenCount: number;
  tokens: string[];
  start: number;
  limit: number;
}

interface BuildSplitResponse {
  xdr: string;
  metadata: {
    networkPassphrase: string;
    contractId: string;
  };
}

function toErrorMessage(status: number, payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return `${fallback} (status ${status})`;
}

async function requestJson<T>(
  path: string,
  fallbackMessage: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, body, fallbackMessage));
  }
  return body as T;
}

export async function buildCreateSplitXdr(
  payload: CreateSplitPayload
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>("/splits", "Failed to build split transaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function buildDistributeXdr(
  projectId: string,
  sourceAddress: string
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    `/splits/${encodeURIComponent(projectId)}/distribute`,
    "Failed to build distribution transaction",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceAddress })
    }
  );
}

export async function buildLockProjectXdr(
  projectId: string,
  owner: string
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    `/splits/${encodeURIComponent(projectId)}/lock`,
    "Failed to build lock transaction",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner })
    }
  );
}

export async function buildDepositXdr(
  projectId: string,
  from: string,
  amount: number
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    `/splits/${encodeURIComponent(projectId)}/deposit`,
    "Failed to build deposit transaction",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, amount })
    }
  );
}

export async function buildAllowTokenXdr(
  admin: string,
  token: string
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    "/splits/admin/allow-token",
    "Failed to build allow token transaction",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin, token })
    }
  );
}

export async function buildDisallowTokenXdr(
  admin: string,
  token: string
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    "/splits/admin/disallow-token",
    "Failed to build disallow token transaction",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin, token })
    }
  );
}

export async function buildUpdateMetadataXdr(
  projectId: string,
  owner: string,
  title: string,
  projectType: string
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    `/splits/${encodeURIComponent(projectId)}/metadata`,
    "Failed to build metadata update transaction",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner, title, projectType })
    }
  );
}

export async function buildUpdateCollaboratorsXdr(
  projectId: string,
  owner: string,
  collaborators: Array<{ address: string; alias: string; basisPoints: number }>
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    `/splits/${encodeURIComponent(projectId)}/collaborators`,
    "Failed to build collaborators update transaction",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner, collaborators })
    }
  );
}

export async function getSplit(projectId: string): Promise<SplitProject> {
  return requestJson<SplitProject>(
    `/splits/${encodeURIComponent(projectId)}`,
    "Failed to fetch split project"
  );
}

export async function getAllSplits(): Promise<SplitProject[]> {
  return requestJson<SplitProject[]>("/splits", "Failed to fetch projects");
}

export async function getClaimable(
  projectId: string,
  address: string
): Promise<ClaimableInfo> {
  return requestJson<ClaimableInfo>(
    `/splits/${encodeURIComponent(projectId)}/claimable/${encodeURIComponent(address)}`,
    "Failed to fetch claimable info"
  );
}

export async function getProjectHistory(
  projectId: string,
  cursor?: string
): Promise<ProjectHistoryResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return requestJson<ProjectHistoryResponse>(
    `/splits/${encodeURIComponent(projectId)}/history${query}`,
    "Failed to fetch project history"
  );
}

export async function getTokenAllowlist(
  start = 0,
  limit = 100
): Promise<TokenAllowlistState> {
  return requestJson<TokenAllowlistState>(
    `/splits/admin/allowlist?start=${start}&limit=${limit}`,
    "Failed to fetch token allowlist"
  );
}

// ============================================================
// Issue #152: Admin contract-state read helpers
// ============================================================

export interface AdminStatusState {
  admin: string | null;
  isPaused: boolean;
}

export async function getAdminStatus(): Promise<AdminStatusState> {
  return requestJson<AdminStatusState>(
    "/splits/admin/status",
    "Failed to fetch admin status"
  );
}

export async function isTokenAllowed(token: string): Promise<{ token: string; isAllowed: boolean }> {
  return requestJson<{ token: string; isAllowed: boolean }>(
    `/splits/admin/is-token-allowed?token=${encodeURIComponent(token)}`,
    "Failed to check token allowlist status"
  );
}

export async function getAdminTokenCount(): Promise<{ count: number }> {
  return requestJson<{ count: number }>(
    "/splits/admin/token-count",
    "Failed to fetch allowed token count"
  );
}

// ============================================================
// Issue #166: Unallocated token recovery helpers
// ============================================================

export interface UnallocatedBalanceState {
  token: string;
  unallocated: string;
}

export async function getUnallocatedBalance(token: string): Promise<UnallocatedBalanceState> {
  return requestJson<UnallocatedBalanceState>(
    `/splits/admin/unallocated?token=${encodeURIComponent(token)}`,
    "Failed to fetch unallocated balance"
  );
}

export interface WithdrawUnallocatedPayload {
  admin: string;
  token: string;
  to: string;
  amount: number;
}

export interface WithdrawUnallocatedResponse {
  xdr: string;
  metadata: {
    networkPassphrase: string;
    contractId: string;
    operation: string;
    auditContext: {
      token: string;
      destination: string;
      amount: number;
      initiatedAt: string;
    };
  };
}

export async function buildWithdrawUnallocatedXdr(
  payload: WithdrawUnallocatedPayload
): Promise<WithdrawUnallocatedResponse> {
  return requestJson<WithdrawUnallocatedResponse>(
    "/splits/admin/withdraw-unallocated",
    "Failed to build withdraw unallocated transaction",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );
}
import type { SplitProject } from "./stellar";
import { getEnv } from "./env";

const API_BASE_URL = getEnv().NEXT_PUBLIC_API_BASE_URL;

export interface CreateSplitPayload {
  owner: string;
  projectId: string;
  title: string;
  projectType: string;
  token: string;
  collaborators: Array<{
    address: string;
    alias: string;
    basisPoints: number;
  }>;
}

export interface ProjectHistoryItem {
  id: string;
  type: "round" | "payment";
  round: number;
  amount: string | number;
  recipient: string;
  ledgerCloseTime: number;
  txHash: string;
}

export interface ProjectHistoryResponse {
  items: ProjectHistoryItem[];
  nextCursor: string | null;
}

export interface ClaimableInfo {
  claimed: string | number;
  claimable?: string | number;
  distributionRound?: number;
}

export interface TokenAllowlistState {
  admin: string | null;
  allowedTokenCount: number;
  tokens: string[];
  start: number;
  limit: number;
}

interface BuildSplitResponse {
  xdr: string;
  metadata: {
    networkPassphrase: string;
    contractId: string;
  };
}

function toErrorMessage(status: number, payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return `${fallback} (status ${status})`;
}

async function requestJson<T>(
  path: string,
  fallbackMessage: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, body, fallbackMessage));
  }
  return body as T;
}

export async function buildCreateSplitXdr(
  payload: CreateSplitPayload
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>("/splits", "Failed to build split transaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function buildDistributeXdr(
  projectId: string,
  sourceAddress: string
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    `/splits/${encodeURIComponent(projectId)}/distribute`,
    "Failed to build distribution transaction",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceAddress })
    }
  );
}

export async function buildLockProjectXdr(
  projectId: string,
  owner: string
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    `/splits/${encodeURIComponent(projectId)}/lock`,
    "Failed to build lock transaction",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner })
    }
  );
}

export async function buildDepositXdr(
  projectId: string,
  from: string,
  amount: number
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    `/splits/${encodeURIComponent(projectId)}/deposit`,
    "Failed to build deposit transaction",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, amount })
    }
  );
}

export async function buildAllowTokenXdr(
  admin: string,
  token: string
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    "/splits/admin/allow-token",
    "Failed to build allow token transaction",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin, token })
    }
  );
}

export async function buildDisallowTokenXdr(
  admin: string,
  token: string
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    "/splits/admin/disallow-token",
    "Failed to build disallow token transaction",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin, token })
    }
  );
}

export async function buildUpdateMetadataXdr(
  projectId: string,
  owner: string,
  title: string,
  projectType: string
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    `/splits/${encodeURIComponent(projectId)}/metadata`,
    "Failed to build metadata update transaction",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner, title, projectType })
    }
  );
}

export async function buildUpdateCollaboratorsXdr(
  projectId: string,
  owner: string,
  collaborators: Array<{ address: string; alias: string; basisPoints: number }>
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    `/splits/${encodeURIComponent(projectId)}/collaborators`,
    "Failed to build collaborators update transaction",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner, collaborators })
    }
  );
}

export async function getSplit(projectId: string): Promise<SplitProject> {
  return requestJson<SplitProject>(
    `/splits/${encodeURIComponent(projectId)}`,
    "Failed to fetch split project"
  );
}

export async function getAllSplits(): Promise<SplitProject[]> {
  return requestJson<SplitProject[]>("/splits", "Failed to fetch projects");
}

export async function getClaimable(
  projectId: string,
  address: string
): Promise<ClaimableInfo> {
  return requestJson<ClaimableInfo>(
    `/splits/${encodeURIComponent(projectId)}/claimable/${encodeURIComponent(address)}`,
    "Failed to fetch claimable info"
  );
}

export async function getProjectHistory(
  projectId: string,
  cursor?: string
): Promise<ProjectHistoryResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return requestJson<ProjectHistoryResponse>(
    `/splits/${encodeURIComponent(projectId)}/history${query}`,
    "Failed to fetch project history"
  );
}

export async function getTokenAllowlist(
  start = 0,
  limit = 100
): Promise<TokenAllowlistState> {
  return requestJson<TokenAllowlistState>(
    `/splits/admin/allowlist?start=${start}&limit=${limit}`,
    "Failed to fetch token allowlist"
  );
}

// ============================================================
// Issue #152: Admin contract-state read helpers
// ============================================================

export interface AdminStatusState {
  admin: string | null;
  isPaused: boolean;
}

export async function getAdminStatus(): Promise<AdminStatusState> {
  return requestJson<AdminStatusState>(
    "/splits/admin/status",
    "Failed to fetch admin status"
  );
}

export async function isTokenAllowed(token: string): Promise<{ token: string; isAllowed: boolean }> {
  return requestJson<{ token: string; isAllowed: boolean }>(
    `/splits/admin/is-token-allowed?token=${encodeURIComponent(token)}`,
    "Failed to check token allowlist status"
  );
}

export async function getAdminTokenCount(): Promise<{ count: number }> {
  return requestJson<{ count: number }>(
    "/splits/admin/token-count",
    "Failed to fetch allowed token count"
  );
}

// ============================================================
// Issue #166: Unallocated token recovery helpers
// ============================================================

export interface UnallocatedBalanceState {
  token: string;
  unallocated: string;
}

export async function getUnallocatedBalance(token: string): Promise<UnallocatedBalanceState> {
  return requestJson<UnallocatedBalanceState>(
    `/splits/admin/unallocated?token=${encodeURIComponent(token)}`,
    "Failed to fetch unallocated balance"
  );
}

export interface WithdrawUnallocatedPayload {
  admin: string;
  token: string;
  to: string;
  amount: number;
}

export interface WithdrawUnallocatedResponse {
  xdr: string;
  metadata: {
    networkPassphrase: string;
    contractId: string;
    operation: string;
    auditContext: {
      token: string;
      destination: string;
      amount: number;
      initiatedAt: string;
    };
  };
}

export async function buildWithdrawUnallocatedXdr(
  payload: WithdrawUnallocatedPayload
): Promise<WithdrawUnallocatedResponse> {
  return requestJson<WithdrawUnallocatedResponse>(
    "/splits/admin/withdraw-unallocated",
    "Failed to build withdraw unallocated transaction",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );
}
import type { SplitProject } from "./stellar";
import type { Collaborator } from "../generated/contract-types.js";
import { getEnv } from "./env";

const API_BASE_URL = getEnv().NEXT_PUBLIC_API_BASE_URL;

export interface CreateSplitPayload {
  owner: string;
  projectId: string;
  title: string;
  projectType: string;
  token: string;
  collaborators: Array<Collaborator>;
}

export interface ProjectHistoryItem {
  id: string;
  type: "round" | "payment";
  round: number;
  amount: string | number;
  recipient: string;
  ledgerCloseTime: number;
  txHash: string;
}

export interface ProjectHistoryResponse {
  items: ProjectHistoryItem[];
  nextCursor: string | null;
}

export interface ClaimableInfo {
  claimed: string | number;
  claimable?: string | number;
  distributionRound?: number;
}

export interface TokenAllowlistState {
  admin: string | null;
  allowedTokenCount: number;
  tokens: string[];
  start: number;
  limit: number;
}

interface BuildSplitResponse {
  xdr: string;
  metadata: {
    networkPassphrase: string;
    contractId: string;
  };
}

function toErrorMessage(status: number, payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return `${fallback} (status ${status})`;
}

async function requestJson<T>(
  path: string,
  fallbackMessage: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, body, fallbackMessage));
  }
  return body as T;
}

export async function buildCreateSplitXdr(
  payload: CreateSplitPayload
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>("/splits", "Failed to build split transaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function buildDistributeXdr(
  projectId: string,
  sourceAddress: string
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    `/splits/${encodeURIComponent(projectId)}/distribute`,
    "Failed to build distribution transaction",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceAddress }),
    }
  );
}

export async function buildLockProjectXdr(
  projectId: string,
  owner: string
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    `/splits/${encodeURIComponent(projectId)}/lock`,
    "Failed to build lock transaction",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner }),
    }
  );
}

export async function buildDepositXdr(
  projectId: string,
  from: string,
  amount: number
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    `/splits/${encodeURIComponent(projectId)}/deposit`,
    "Failed to build deposit transaction",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, amount }),
    }
  );
}

export async function buildAllowTokenXdr(
  admin: string,
  token: string
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    "/splits/admin/allow-token",
    "Failed to build allow token transaction",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin, token }),
    }
  );
}

export async function buildDisallowTokenXdr(
  admin: string,
  token: string
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    "/splits/admin/disallow-token",
    "Failed to build disallow token transaction",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin, token }),
    }
  );
}

export async function buildUpdateMetadataXdr(
  projectId: string,
  owner: string,
  title: string,
  projectType: string
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    `/splits/${encodeURIComponent(projectId)}/metadata`,
    "Failed to build metadata update transaction",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner, title, projectType }),
    }
  );
}

export async function buildUpdateCollaboratorsXdr(
  projectId: string,
  owner: string,
  collaborators: Array<Collaborator>
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    `/splits/${encodeURIComponent(projectId)}/collaborators`,
    "Failed to build collaborators update transaction",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner, collaborators }),
    }
  );
}

export async function getSplit(projectId: string): Promise<SplitProject> {
  return requestJson<SplitProject>(
    `/splits/${encodeURIComponent(projectId)}`,
    "Failed to fetch split project"
  );
}

export async function getAllSplits(): Promise<SplitProject[]> {
  return requestJson<SplitProject[]>("/splits", "Failed to fetch projects");
}

export async function getClaimable(
  projectId: string,
  address: string
): Promise<ClaimableInfo> {
  return requestJson<ClaimableInfo>(
    `/splits/${encodeURIComponent(projectId)}/claimable/${encodeURIComponent(address)}`,
    "Failed to fetch claimable info"
  );
}

export async function getProjectHistory(
  projectId: string,
  cursor?: string
): Promise<ProjectHistoryResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return requestJson<ProjectHistoryResponse>(
    `/splits/${encodeURIComponent(projectId)}/history${query}`,
    "Failed to fetch project history"
  );
}

export async function getTokenAllowlist(
  start = 0,
  limit = 100
): Promise<TokenAllowlistState> {
  return requestJson<TokenAllowlistState>(
    `/splits/admin/allowlist?start=${start}&limit=${limit}`,
    "Failed to fetch token allowlist"
  );
}

// ============================================================
// Issue #152: Admin contract-state read helpers
// ============================================================

export interface AdminStatusState {
  admin: string | null;
  isPaused: boolean;
}

export async function getAdminStatus(): Promise<AdminStatusState> {
  return requestJson<AdminStatusState>(
    "/splits/admin/status",
    "Failed to fetch admin status"
  );
}

export async function buildPauseDistributionsXdr(
  admin: string
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    "/splits/admin/pause-distributions",
    "Failed to build pause transaction",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin }),
    }
  );
}

export async function buildUnpauseDistributionsXdr(
  admin: string
): Promise<BuildSplitResponse> {
  return requestJson<BuildSplitResponse>(
    "/splits/admin/unpause-distributions",
    "Failed to build unpause transaction",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin }),
    }
  );
}

export async function isTokenAllowed(
  token: string
): Promise<{ token: string; isAllowed: boolean }> {
  return requestJson<{ token: string; isAllowed: boolean }>(
    `/splits/admin/is-token-allowed?token=${encodeURIComponent(token)}`,
    "Failed to check token allowlist status"
  );
}

export async function getAdminTokenCount(): Promise<{ count: number }> {
  return requestJson<{ count: number }>(
    "/splits/admin/token-count",
    "Failed to fetch allowed token count"
  );
}

// ============================================================
// Issue #166: Unallocated token recovery helpers
// ============================================================

export interface UnallocatedBalanceState {
  token: string;
  unallocated: string;
}

export async function getUnallocatedBalance(
  token: string
): Promise<UnallocatedBalanceState> {
  return requestJson<UnallocatedBalanceState>(
    `/splits/admin/unallocated?token=${encodeURIComponent(token)}`,
    "Failed to fetch unallocated balance"
  );
}

export interface WithdrawUnallocatedPayload {
  admin: string;
  token: string;
  to: string;
  amount: number;
}

export interface WithdrawUnallocatedResponse {
  xdr: string;
  metadata: {
    networkPassphrase: string;
    contractId: string;
    operation: string;
    auditContext: {
      token: string;
      destination: string;
      amount: number;
      initiatedAt: string;
    };
  };
}

export async function buildWithdrawUnallocatedXdr(
  payload: WithdrawUnallocatedPayload
): Promise<WithdrawUnallocatedResponse> {
  return requestJson<WithdrawUnallocatedResponse>(
    "/splits/admin/withdraw-unallocated",
    "Failed to build withdraw unallocated transaction",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}
