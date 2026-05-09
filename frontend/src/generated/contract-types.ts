// Auto-generated from contract interface artifact
// Do not edit manually - regenerate with: npm run generate:contract-types

// Contract Types

export interface Collaborator {
  /** Stellar wallet address of the collaborator */
  address: string;
  /** Human-readable alias (e.g. "Burna B.") */
  alias: string;
  /** Percentage share in basis points (e.g. 5000 = 50.00%) Using basis points avoids floating point entirely. */
  basisPoints: number;
}

export interface SplitProject {
  /** Unique project identifier */
  projectId: string;
  /** Human-readable project title */
  title: string;
  /** Project type: "music", "film", "art", "podcast", "book", "other" */
  projectType: string;
  /** Token contract address (XLM or USDC) */
  token: string;
  /** The project creator / admin address */
  owner: string;
  /** All collaborators and their splits */
  collaborators: Array<Collaborator>;
  /** Whether the split is locked (immutable after locking) */
  locked: boolean;
  /** Total funds distributed so far (in token stroops) */
  totalDistributed: string;
  /** Number of successful distribution rounds completed */
  distributionRound: number;
}

export interface ClaimableInfo {
  /** Total amount claimed (paid out) to this collaborator across all rounds */
  claimed: string;
  /** Number of distribution rounds completed for this project */
  distributionRound: number;
}

// Method Argument Types

export type CreateProjectArgs = {
  owner: string;
  project_id: string;
  title: string;
  project_type: string;
  token: string;
  collaborators: Array<Collaborator>;
};

export type UpdateCollaboratorsArgs = {
  project_id: string;
  owner: string;
  collaborators: Array<Collaborator>;
};

export type LockProjectArgs = {
  project_id: string;
  owner: string;
};

export type DepositArgs = {
  project_id: string;
  from: string;
  amount: string;
};

export type DistributeArgs = {
  project_id: string;
};

export type GetProjectArgs = {
  project_id: string;
};

export type ProjectExistsArgs = {
  project_id: string;
};

export type GetClaimedArgs = {
  project_id: string;
  address: string;
};

export type RefreshProjectStorageArgs = {
  project_id: string;
};

export type ListProjectsArgs = {
  start: number;
  limit: number;
};

export type GetBalanceArgs = {
  project_id: string;
};

export type GetUnallocatedBalanceArgs = {
  token: string;
};

export type WithdrawUnallocatedArgs = {
  admin: string;
  token: string;
  to: string;
  amount: string;
};

export type IsTokenAllowedArgs = {
  token: string;
};

export type GetAllowedTokenCountArgs = {};

export type GetAllowedTokensArgs = {
  start: number;
  limit: number;
};

export type GetAdminArgs = {};

export type GetProjectIdsArgs = {
  start: number;
  limit: number;
};

export type GetClaimableArgs = {
  project_id: string;
  collaborator: string;
};

export type UpdateProjectMetadataArgs = {
  project_id: string;
  owner: string;
  title: string;
  project_type: string;
};

// Event Types

export interface ProjectCreatedEvent {
  project_id: string;
  owner: string;
}

export interface ProjectLockedEvent {
  project_id: string;
}

export interface PaymentSentEvent {
  project_id: string;
  recipient: string;
  amount: string;
}

export interface DistributionCompleteEvent {
  project_id: string;
  round: number;
  total: string;
}

export interface DepositReceivedEvent {
  project_id: string;
  from: string;
  amount: string;
  project_balance: string;
}

export interface MetadataUpdatedEvent {
  project_id: string;
}

export interface UnallocatedWithdrawnEvent {
  token: string;
  admin: string;
  to: string;
  amount: string;
  remaining_unallocated: string;
}

// Error Types

export const ContractErrors = {
  ProjectExists: 1,
  NotFound: 2,
  Unauthorized: 3,
  InvalidSplit: 4,
  TooFewCollaborators: 5,
  ZeroShare: 6,
  NoBalance: 7,
  AlreadyLocked: 8,
  ProjectLocked: 9,
  DuplicateCollaborator: 10,
  InvalidAmount: 11,
  TokenNotAllowed: 12,
  AdminNotSet: 13,
  ArithmeticOverflow: 14,
  InsufficientUnallocated: 15,
  DistributionsPaused: 16
} as const;

export type ContractErrorCode = typeof ContractErrors[keyof typeof ContractErrors];