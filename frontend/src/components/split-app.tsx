"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { rpc, Transaction, StrKey } from "@stellar/stellar-sdk";
import { clsx } from "clsx";
import { Controller, useFieldArray, useForm, type SubmitHandler } from "react-hook-form";

import {
  buildAllowTokenXdr,
  buildCreateSplitXdr,
  buildDisallowTokenXdr,
  buildDepositXdr,
  buildDistributeXdr,
  buildLockProjectXdr,
  buildUpdateMetadataXdr,
  buildUpdateCollaboratorsXdr,
  getAllSplits,
  getClaimable,
  getProjectHistory,
  getSplit,
  listProjects,
  type ProjectHistoryItem,
  getTokenAllowlist,
  type TokenAllowlistState,
  getUnallocatedBalance,
  buildWithdrawUnallocatedXdr,
  type UnallocatedBalanceState,
  getAdminStatus,
  buildPauseDistributionsXdr,
  buildUnpauseDistributionsXdr,
  type AdminStatusState,
} from "@/lib/api";
import { isOwner } from "@/lib/address";
import {
  createSorobanRpcServer,
  signWithFreighter,
  submitSorobanTransactionAndPoll,
} from "@/lib/freighter";
import {
  type SplitProject,
  getExplorerUrl,
  getExplorerLabel,
} from "@/lib/stellar";
import { useWallet } from "@/hooks/useWallet";
import { notify } from "@/lib/notification";
import { SummaryCardSkeleton } from "./Skeleton";
import { TokenSelector } from "./TypeSelector";
import {
  TransactionReceiptView,
  type TransactionReceipt,
} from "./TransactionReceiptView";
import { Input } from "./Input";
import { CreateSplitSchema } from "@/lib/schemas";

interface CollaboratorInput {
  id: string;
  address: string;
  alias: string;
  basisPoints: string;
}

interface CreateCollaboratorInput {
  address: string;
  alias: string;
  basisPoints: string;
}

interface CreateSplitFormValues {
  projectId: string;
  title: string;
  projectType: string;
  token: string;
  collaborators: CreateCollaboratorInput[];
}

interface AllowlistActionResult {
  action: "allow" | "disallow";
  token: string;
  txHash: string | null;
}

// Use static IDs instead of random UUIDs to avoid hydration mismatches
const getInitialCreateCollaborators = (): CreateCollaboratorInput[] => [
  { address: "", alias: "", basisPoints: "5000" },
  { address: "", alias: "", basisPoints: "5000" },
];


const getInitialCreateFormValues = (): CreateSplitFormValues => ({
  projectId: "",
  title: "",
  projectType: "music",
  token: "",
  collaborators: getInitialCreateCollaborators(),
});

// Seeded project IDs for Phase 3 Projects list view
const SEEDED_PROJECT_IDS = [
  "afrobeats_001",
  "diaspora_sounds_02",
  "naija_vibes_03",
  "west_african_beats_04",
  "cultural_resonance_05",
];

export function SplitApp() {
  const { wallet, connect, refresh } = useWallet();

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors: createFormErrors, isValid: isCreateFormValid },
  } = useForm<CreateSplitFormValues>({
    defaultValues: getInitialCreateFormValues(),
    mode: "onChange",
  });
  const {
    fields: collaboratorFields,
    append: appendCollaborator,
    remove: removeCollaborator,
  } = useFieldArray({
    control,
    name: "collaborators",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);
  const [createdProject, setCreatedProject] = useState<SplitProject | null>(null);
  const latestTxHash = txHash ?? receipt?.hash ?? null;

  const [activeTab, setActiveTab] = useState<"dashboard" | "create" | "manage" | "projects">("dashboard");
  const [createStep, setCreateStep] = useState(1);
  const [searchProjectId, setSearchProjectId] = useState("");
  const [fetchedProject, setFetchedProject] = useState<SplitProject | null>(null);
  const [isFetchingProject, setIsFetchingProject] = useState(false);
  const [showDistributeModal, setShowDistributeModal] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);
  const [history, setHistory] = useState<ProjectHistoryItem[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isHistoryStale, setIsHistoryStale] = useState(false);
  const lockModalRef = useRef<HTMLDivElement | null>(null);
  const depositModalRef = useRef<HTMLDivElement | null>(null);

  const [projectsList, setProjectsList] = useState<SplitProject[]>([]);
  const [projectsListLoaded, setProjectsListLoaded] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isLoadingProjectsList, setIsLoadingProjectsList] = useState(false);
  const [projectsStart, setProjectsStart] = useState(0);
  const [hasMoreProjects, setHasMoreProjects] = useState(true);
  const PROJECTS_LIMIT = 10;
  const [projectsListError, setProjectsListError] = useState<string | null>(null);
  const [isProjectsListStale, setIsProjectsListStale] = useState(false);
  const [projectFetchError, setProjectFetchError] = useState<string | null>(null);
  const [isProjectStale, setIsProjectStale] = useState(false);

  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editProjectType, setEditProjectType] = useState("music");
  const [isUpdatingMetadata, setIsUpdatingMetadata] = useState(false);

  const [isEditingCollaborators, setIsEditingCollaborators] = useState(false);
  const [editCollaborators, setEditCollaborators] = useState<CollaboratorInput[]>([]);
  const [isUpdatingCollaborators, setIsUpdatingCollaborators] = useState(false);

  const [dashboardData, setDashboardData] = useState<SplitProject[]>([]);
  const [userEarnings, setUserEarnings] = useState<Record<string, string>>({});
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [dashboardListLoaded, setDashboardListLoaded] = useState(false);
  const [tokenAllowlist, setTokenAllowlist] = useState<TokenAllowlistState | null>(null);
  const [allowlistTokenInput, setAllowlistTokenInput] = useState("");
  const [isLoadingAllowlist, setIsLoadingAllowlist] = useState(true);
  const [isUpdatingAllowlist, setIsUpdatingAllowlist] = useState(false);
  const [lastAllowlistTx, setLastAllowlistTx] = useState<AllowlistActionResult | null>(null);

  const [recoveryTokenInput, setRecoveryTokenInput] = useState("");
  const [recoveryToInput, setRecoveryToInput] = useState("");
  const [recoveryAmountInput, setRecoveryAmountInput] = useState("");
  const [unallocatedBalance, setUnallocatedBalance] = useState<UnallocatedBalanceState | null>(null);
  const [isLoadingUnallocated, setIsLoadingUnallocated] = useState(false);
  const [unallocatedError, setUnallocatedError] = useState<string | null>(null);
  const [showRecoveryConfirm, setShowRecoveryConfirm] = useState(false);
  const [isSubmittingRecovery, setIsSubmittingRecovery] = useState(false);
  const [lastRecoveryTxHash, setLastRecoveryTxHash] = useState<string | null>(null);

  // Issue #165: Distribution pause/unpause control plane state
  const [adminStatus, setAdminStatus] = useState<AdminStatusState | null>(null);
  const [isLoadingAdminStatus, setIsLoadingAdminStatus] = useState(false);
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);
  const [showUnpauseConfirm, setShowUnpauseConfirm] = useState(false);
  const [isSubmittingPause, setIsSubmittingPause] = useState(false);
  const [lastPauseTxHash, setLastPauseTxHash] = useState<string | null>(null);

  const watchedCollaborators = watch("collaborators");
  const createProjectId = watch("projectId");
  const createTitle = watch("title");
  const createProjectType = watch("projectType");
  const createToken = watch("token");

  const totalBasisPoints = useMemo(
    () =>
      watchedCollaborators.reduce((sum, collaborator) => {
        const parsed = Number.parseInt(collaborator.basisPoints, 10);
        return sum + (Number.isFinite(parsed) ? parsed : 0);
      }, 0),
    [watchedCollaborators],
  );

  const collaboratorValidationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    const addresses = new Map<string, string>();
    const duplicates = new Set<string>();

    collaboratorFields.forEach((field, index) => {
      const collaborator = watchedCollaborators[index];
      if (!collaborator) return;

      const addr = collaborator.address.trim();
      if (addr) {
        if (!StrKey.isValidEd25519PublicKey(addr) && !StrKey.isValidContract(addr)) {
          errors[field.id] = "Invalid Stellar address (G...) or contract ID (C...)";
        } else if (addresses.has(addr)) {
          duplicates.add(addr);
        } else {
          addresses.set(addr, field.id);
        }
      }
    });

    if (duplicates.size > 0) {
      collaboratorFields.forEach((field, index) => {
        const addr = watchedCollaborators[index]?.address.trim();
        if (addr && duplicates.has(addr)) {
          errors[field.id] = "Duplicate address";
        }
      });
    }

    return errors;
  }, [collaboratorFields, watchedCollaborators]);

  const isValid = useMemo(
    () =>
      isCreateFormValid &&
      totalBasisPoints === 10_000 &&
      Object.keys(collaboratorValidationErrors).length === 0 &&
      collaboratorFields.length >= 2,
    [collaboratorValidationErrors, collaboratorFields.length, isCreateFormValid, totalBasisPoints],
  );

  // Step validation
  const isStep1Valid = useMemo(
    () =>
      Boolean(createProjectId.trim()) &&
      Boolean(createTitle.trim()) &&
      Boolean(createProjectType.trim()) &&
      Boolean(createToken.trim()) &&
      (StrKey.isValidEd25519PublicKey(createToken) || StrKey.isValidContract(createToken)),
    [createProjectId, createProjectType, createTitle, createToken],
  );

  const isStep2Valid = useMemo(
    () =>
      totalBasisPoints === 10_000 &&
      Object.keys(collaboratorValidationErrors).length === 0 &&
      collaboratorFields.length >= 2,
    [collaboratorFields.length, collaboratorValidationErrors, totalBasisPoints],
  );

  const normalizedAllowlistToken = allowlistTokenInput.trim();
  const isValidAllowlistToken = useMemo(
    () =>
      normalizedAllowlistToken.length > 0 &&
      (StrKey.isValidEd25519PublicKey(normalizedAllowlistToken) ||
        StrKey.isValidContract(normalizedAllowlistToken)),
    [normalizedAllowlistToken],
  );

  const isContractAdmin = tokenAllowlist?.admin
    ? isOwner(tokenAllowlist.admin, wallet.address)
    : false;

  const sorobanSplitFlowBusy = isSubmitting || isLocking || isDepositing;

  useEffect(() => {
    let cancelled = false;
    getTokenAllowlist()
      .then((state) => {
        if (!cancelled) setTokenAllowlist(state);
      })
      .catch((error) => {
        console.error("Failed to fetch token allowlist:", error);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingAllowlist(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getAdminStatus()
      .then((status) => {
        if (!cancelled) setAdminStatus(status);
      })
      .catch((error) => {
        console.error("Failed to fetch admin status:", error);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingAdminStatus(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function onConnectWallet() {
    try {
      await connect();
      notify.success("Wallet connected.");
    } catch (error) {
      notify.error("Wallet connection failed.");
    }
  }

  async function onReconnectWallet() {
    try {
      await refresh();
      notify.info(wallet.connected ? "Wallet reconnected." : "Wallet not authorized.");
    } catch (error) {
      notify.error("Wallet refresh failed.");
    }
  }

  function onDisconnectWallet() {
    notify.info(
      "Freighter does not support programmatic disconnect. Use the extension to revoke access.",
    );
  }

  async function onInspectUnallocated() {
    if (!recoveryTokenInput.trim()) {
      notify.error("Token address is required.");
      return;
    }
    setIsLoadingUnallocated(true);
    setUnallocatedError(null);
    setUnallocatedBalance(null);
    setShowRecoveryConfirm(false);
    setLastRecoveryTxHash(null);
    try {
      const data = await getUnallocatedBalance(recoveryTokenInput.trim());
      setUnallocatedBalance(data);
    } catch (error) {
      setUnallocatedError(
        error instanceof Error ? error.message : "Failed to fetch unallocated balance.",
      );
    } finally {
      setIsLoadingUnallocated(false);
    }
  }

  async function onConfirmRecovery() {
    if (!wallet.address || !unallocatedBalance) return;
    const amount = Number(recoveryAmountInput.trim());
    if (!recoveryToInput.trim() || !Number.isFinite(amount) || amount <= 0) {
      notify.error("Destination address and a valid positive amount are required.");
      return;
    }
    setIsSubmittingRecovery(true);
    try {
      const buildResponse = await buildWithdrawUnallocatedXdr({
        admin: wallet.address,
        token: unallocatedBalance.token,
        to: recoveryToInput.trim(),
        amount,
      });
      const signedTxXdr = await signWithFreighter(
        buildResponse.xdr,
        buildResponse.metadata.networkPassphrase,
      );
      const server = createSorobanRpcServer();
      const transaction = new Transaction(signedTxXdr, buildResponse.metadata.networkPassphrase);
      const submitResponse = await server.sendTransaction(transaction);
      if (submitResponse.status === "ERROR")
        throw new Error(submitResponse.errorResult?.toString() ?? "Transaction failed.");
      setLastRecoveryTxHash(submitResponse.hash ?? null);
      setShowRecoveryConfirm(false);
      notify.success("Recovery transaction submitted successfully.");
      await onInspectUnallocated();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Recovery transaction failed.");
    } finally {
      setIsSubmittingRecovery(false);
    }
  }

  async function onUpdateMetadata() {
    if (!fetchedProject || !wallet.address) return;
    if (!editTitle.trim()) {
      notify.error("Title is required.");
      return;
    }
    setIsUpdatingMetadata(true);
    try {
      const buildResponse = await buildUpdateMetadataXdr(
        fetchedProject.projectId,
        wallet.address,
        editTitle.trim(),
        editProjectType.trim(),
      );
      const signedTxXdr = await signWithFreighter(
        buildResponse.xdr,
        buildResponse.metadata.networkPassphrase,
      );
      const server = createSorobanRpcServer();
      const transaction = new Transaction(signedTxXdr, buildResponse.metadata.networkPassphrase);
      const submitResponse = await server.sendTransaction(transaction);
      if (submitResponse.status === "ERROR")
        throw new Error(submitResponse.errorResult?.toString() ?? "Transaction failed.");
      notify.success("Project metadata updated successfully.");
      setIsEditingMetadata(false);
      await onFetchProject();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to update metadata.");
    } finally {
      setIsUpdatingMetadata(false);
    }
  }

  async function onUpdateCollaborators() {
    if (!fetchedProject || !wallet.address) return;
    const result = CreateSplitSchema.shape.collaborators.safeParse(editCollaborators);
    if (!result.success) {
      notify.error("Please fix collaborator validation errors.");
      return;
    }
    setIsUpdatingCollaborators(true);
    try {
      const buildResponse = await buildUpdateCollaboratorsXdr(
        fetchedProject.projectId,
        wallet.address,
        editCollaborators.map((c) => ({
          address: c.address.trim(),
          alias: c.alias.trim(),
          basisPoints: Number.parseInt(c.basisPoints, 10),
        })),
      );
      const signedTxXdr = await signWithFreighter(
        buildResponse.xdr,
        buildResponse.metadata.networkPassphrase,
      );
      const server = createSorobanRpcServer();
      const transaction = new Transaction(signedTxXdr, buildResponse.metadata.networkPassphrase);
      const submitResponse = await server.sendTransaction(transaction);
      if (submitResponse.status === "ERROR")
        throw new Error(submitResponse.errorResult?.toString() ?? "Transaction failed.");
      notify.success("Collaborators updated successfully.");
      setIsEditingCollaborators(false);
      await onFetchProject();
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Failed to update collaborators.",
      );
    } finally {
      setIsUpdatingCollaborators(false);
    }
  }

  function _onWizardReset() {
    setCreateStep(1);
    reset(getInitialCreateFormValues());
    setTxHash(null);
    setReceipt(null);
    setCreatedProject(null);
  }

  function updateEditCollaborator(id: string, patch: Partial<CollaboratorInput>) {
    setEditCollaborators((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  }

  function addEditCollaborator() {
    setEditCollaborators((prev) => [
      ...prev,
      {
        id: `edit-collab-${Date.now()}-${prev.length}`,
        address: "",
        alias: "",
        basisPoints: "0",
      },
    ]);
  }

  function removeEditCollaborator(id: string) {
    setEditCollaborators((prev) =>
      prev.length <= 2 ? prev : prev.filter((c) => c.id !== id),
    );
  }

  const onSubmit: SubmitHandler<CreateSplitFormValues> = async (data) => {
    if (!wallet.connected || !wallet.address) {
      notify.error("Connect Freighter wallet first.");
      return;
    }
    const collaboratorPayload = data.collaborators.map((collaborator) => ({
      address: collaborator.address.trim(),
      alias: collaborator.alias.trim(),
      basisPoints: Number.parseInt(collaborator.basisPoints, 10),
    }));
    setIsSubmitting(true);
    setTxHash(null);
    setReceipt(null);
    try {
      const buildResponse = await buildCreateSplitXdr({
        owner: wallet.address,
        projectId: data.projectId.trim(),
        title: data.title.trim(),
        projectType: data.projectType.trim(),
        token: data.token.trim(),
        collaborators: collaboratorPayload,
      });
      const signedTxXdr = await signWithFreighter(
        buildResponse.xdr,
        buildResponse.metadata.networkPassphrase,
      );
      const server = createSorobanRpcServer();
      const transaction = new Transaction(signedTxXdr, buildResponse.metadata.networkPassphrase);

      await submitSorobanTransactionAndPoll(server, transaction, {
        afterSubmitted: (hash) => {
          setTxHash(hash);
          setReceipt({
            hash,
            lifecycle: "confirming",
            action: "create",
            projectId: data.projectId.trim(),
            title: data.title.trim(),
          });
        },
      });

      setReceipt((prev) =>
        prev?.action === "create" && prev.hash ? { ...prev, lifecycle: "success" } : prev,
      );
      notify.success("Split project created successfully.");

      try {
        const projectDetails = await getSplit(data.projectId.trim());
        setCreatedProject(projectDetails);
        setCreateStep(4);
      } catch (error) {
        console.error("Failed to fetch created project details:", error);
        setCreateStep(4);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create split project.";
      setReceipt((prev) =>
        prev?.lifecycle === "confirming" && prev.action === "create"
          ? { ...prev, lifecycle: "failed", failureReason: message }
          : prev,
      );
      notify.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  async function fetchHistory(id: string, cursor?: string) {
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const data = await getProjectHistory(id, cursor);
      if (cursor) setHistory((prev) => [...prev, ...data.items]);
      else setHistory(data.items);
      setHistoryCursor(data.nextCursor);
      setIsHistoryStale(false);
    } catch (error) {
      setHistoryError("Failed to fetch history.");
      setIsHistoryStale(history.length > 0);
    } finally {
      setIsLoadingHistory(false);
    }
  }

  const onFetchProject = async () => {
    if (!searchProjectId.trim()) return;
    setIsFetchingProject(true);
    setProjectFetchError(null);
    try {
      const project = await getSplit(searchProjectId.trim());
      setFetchedProject(project);
      setIsEditingCollaborators(false);
      setIsProjectStale(false);
      await fetchHistory(searchProjectId.trim());
    } catch (error) {
      setProjectFetchError("Failed to fetch project.");
      setIsProjectStale(Boolean(fetchedProject));
    } finally {
      setIsFetchingProject(false);
    }
  };

  const onDistribute = async () => {
    if (!fetchedProject || !wallet.address) return;
    setIsSubmitting(true);
    setShowDistributeModal(false);
    try {
      const { xdr, metadata } = await buildDistributeXdr(fetchedProject.projectId, wallet.address);
      const signedTxXdr = await signWithFreighter(xdr, metadata.networkPassphrase);
      const server = createSorobanRpcServer();
      const transaction = new Transaction(signedTxXdr, metadata.networkPassphrase);

      await submitSorobanTransactionAndPoll(server, transaction, {
        afterSubmitted: (hash) => {
          setTxHash(hash);
          setReceipt({
            hash,
            lifecycle: "confirming",
            action: "distribute",
            projectId: fetchedProject.projectId,
            round: fetchedProject.distributionRound + 1,
          });
        },
      });

      setReceipt((prev) =>
        prev?.action === "distribute" && prev.hash ? { ...prev, lifecycle: "success" } : prev,
      );
      notify.success("Distribution completed successfully.");
      await onFetchProject();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Distribution failed.";
      setReceipt((prev) =>
        prev?.lifecycle === "confirming" && prev.action === "distribute"
          ? { ...prev, lifecycle: "failed", failureReason: message }
          : prev,
      );
      notify.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isProjectOwner = useMemo(() => {
    if (!fetchedProject || !wallet.address) return false;
    return isOwner(fetchedProject.owner, wallet.address);
  }, [fetchedProject, wallet.address]);

  const canLockProject = useMemo(() => {
    return Boolean(fetchedProject && !fetchedProject.locked && isProjectOwner);
  }, [fetchedProject, isProjectOwner]);

  const onLockProject = async () => {
    if (!fetchedProject || !wallet.address) return;
    setIsLocking(true);
    try {
      const { xdr, metadata } = await buildLockProjectXdr(fetchedProject.projectId, wallet.address);
      const signedTxXdr = await signWithFreighter(xdr, metadata.networkPassphrase);
      const server = createSorobanRpcServer();
      const transaction = new Transaction(signedTxXdr, metadata.networkPassphrase);

      await submitSorobanTransactionAndPoll(server, transaction, {
        afterSubmitted: (hash) => {
          setTxHash(hash);
          setReceipt({
            hash,
            lifecycle: "confirming",
            action: "lock",
            projectId: fetchedProject.projectId,
          });
        },
      });

      setReceipt((prev) =>
        prev?.action === "lock" && prev.hash ? { ...prev, lifecycle: "success" } : prev,
      );
      setFetchedProject((prev) => (prev ? { ...prev, locked: true } : prev));
      setShowLockModal(false);
      notify.success("Project locked permanently.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to lock project.";
      setReceipt((prev) =>
        prev?.lifecycle === "confirming" && prev.action === "lock"
          ? { ...prev, lifecycle: "failed", failureReason: message }
          : prev,
      );
      notify.error(message);
    } finally {
      setIsLocking(false);
    }
  };

  const onDeposit = async () => {
    if (!fetchedProject || !wallet.address || !depositAmount) return;
    setIsDepositing(true);
    try {
      const amountInStroops = Math.floor(Number.parseFloat(depositAmount) * 10_000_000);
      const { xdr, metadata } = await buildDepositXdr(
        fetchedProject.projectId,
        wallet.address,
        amountInStroops,
      );
      const signedTxXdr = await signWithFreighter(xdr, metadata.networkPassphrase);
      const server = createSorobanRpcServer();
      const transaction = new Transaction(signedTxXdr, metadata.networkPassphrase);

      await submitSorobanTransactionAndPoll(server, transaction, {
        afterSubmitted: (hash) => {
          setTxHash(hash);
          setReceipt({
            hash,
            lifecycle: "confirming",
            action: "deposit",
            projectId: fetchedProject.projectId,
            amount: depositAmount,
          });
        },
      });

      setReceipt((prev) =>
        prev?.action === "deposit" && prev.hash ? { ...prev, lifecycle: "success" } : prev,
      );
      setShowDepositModal(false);
      setDepositAmount("");
      notify.success("Deposit successful!");
      await onFetchProject();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Deposit failed.";
      setReceipt((prev) =>
        prev?.lifecycle === "confirming" && prev.action === "deposit"
          ? { ...prev, lifecycle: "failed", failureReason: message }
          : prev,
      );
      notify.error(message);
    } finally {
      setIsDepositing(false);
    }
  };

  // Phase 3: Fetch projects list from backend with pagination
  const onFetchProjectsList = useCallback(async (loadMore = false) => {
    if (isLoadingProjectsList) return;
    if (!loadMore && projectsList.length > 0) return;

    setIsLoadingProjectsList(true);
    setProjectsListError(null);
    try {
      const start = loadMore ? projectsStart : 0;
      const projects = await listProjects({ start, limit: PROJECTS_LIMIT });
      
      if (loadMore) {
        setProjectsList(prev => [...prev, ...projects]);
      } else {
        setProjectsList(projects);
        setProjectsStart(0);
      }
      
      const newStart = start + projects.length;
      setProjectsStart(newStart);
      setHasMoreProjects(projects.length === PROJECTS_LIMIT);
      
      if (projects.length === 0 && !loadMore) {
        notify.info("No projects found.");
      }
    } catch (error) {
      setProjectsListError("Failed to fetch projects list.");
    } finally {
      setIsLoadingProjectsList(false);
      setProjectsListLoaded(true);
    }
  }, [isLoadingProjectsList, projectsList.length, projectsStart, listProjects]);

  const onFetchDashboardData = useCallback(async () => {
    setIsLoadingDashboard(true);
    try {
      const projects = await getAllSplits();
      setDashboardData(projects);
      if (wallet.connected && wallet.address) {
        const earnings: Record<string, string> = {};
        await Promise.all(
          projects
            .filter(
              (p) =>
                p.collaborators.some((c) => c.address === wallet.address) ||
                p.owner === wallet.address,
            )
            .map(async (p) => {
              try {
                const info = await getClaimable(p.projectId, wallet.address!);
                earnings[p.projectId] = String(info.claimed);
              } catch (e) {}
            }),
        );
        setUserEarnings(earnings);
      }
    } catch (error) {
      notify.error("Failed to load dashboard.");
    } finally {
      setIsLoadingDashboard(false);
      setDashboardListLoaded(true);
    }
  }, [wallet.connected, wallet.address]);

  const refreshTokenAllowlist = async () => {
    setIsLoadingAllowlist(true);
    try {
      const state = await getTokenAllowlist();
      setTokenAllowlist(state);
      return state;
    } catch (error) {
      notify.error("Failed to refresh allowlist.");
      return null;
    } finally {
      setIsLoadingAllowlist(false);
    }
  };

  const refreshAdminStatus = async () => {
    setIsLoadingAdminStatus(true);
    try {
      const status = await getAdminStatus();
      setAdminStatus(status);
      return status;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to refresh admin status.";
      notify.error(message);
      return null;
    } finally {
      setIsLoadingAdminStatus(false);
    }
  };

  const onTogglePause = async (action: "pause" | "unpause") => {
    if (!wallet.address || !isContractAdmin) {
      notify.error("Only the contract admin can pause or unpause distributions.");
      return;
    }
    setIsSubmittingPause(true);
    setLastPauseTxHash(null);
    try {
      const buildResponse =
        action === "pause"
          ? await buildPauseDistributionsXdr(wallet.address)
          : await buildUnpauseDistributionsXdr(wallet.address);

      const signedTxXdr = await signWithFreighter(
        buildResponse.xdr,
        buildResponse.metadata.networkPassphrase,
      );
      const server = new rpc.Server(
        process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org",
        { allowHttp: true },
      );
      const transaction = new Transaction(signedTxXdr, buildResponse.metadata.networkPassphrase);
      const submitResponse = await server.sendTransaction(transaction);
      if (submitResponse.status === "ERROR") {
        throw new Error(submitResponse.errorResult?.toString() ?? "Transaction failed.");
      }
      setLastPauseTxHash(submitResponse.hash ?? null);
      setShowPauseConfirm(false);
      setShowUnpauseConfirm(false);
      notify.success(action === "pause" ? "Distributions paused." : "Distributions resumed.");
      await refreshAdminStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transaction failed.";
      notify.error(message);
    } finally {
      setIsSubmittingPause(false);
    }
  };

  const onSubmitAllowlistAction = async (action: "allow" | "disallow") => {
    if (!wallet.address || !isContractAdmin || !isValidAllowlistToken) return;
    setIsUpdatingAllowlist(true);
    try {
      const buildResponse =
        action === "allow"
          ? await buildAllowTokenXdr(wallet.address, normalizedAllowlistToken)
          : await buildDisallowTokenXdr(wallet.address, normalizedAllowlistToken);
      const signedTxXdr = await signWithFreighter(
        buildResponse.xdr,
        buildResponse.metadata.networkPassphrase,
      );
      const server = createSorobanRpcServer();
      const transaction = new Transaction(signedTxXdr, buildResponse.metadata.networkPassphrase);
      const submitResponse = await server.sendTransaction(transaction);
      if (submitResponse.status === "ERROR") throw new Error("Allowlist action failed.");
      setLastAllowlistTx({
        action,
        token: normalizedAllowlistToken,
        txHash: submitResponse.hash ?? null,
      });
      setAllowlistTokenInput("");
      notify.success("Allowlist updated.");
      await refreshTokenAllowlist();
    } catch (error) {
      notify.error("Failed to update allowlist.");
    } finally {
      setIsUpdatingAllowlist(false);
    }
  };

  useEffect(() => {
    if (activeTab === "projects") {
      if (projectsList.length === 0 && !isLoadingProjectsList) {
        void onFetchProjectsList();
      }
    } else if (activeTab === "dashboard" && dashboardData.length === 0 && !isLoadingDashboard) {
      void onFetchDashboardData();
    }
  }, [
    activeTab,
    dashboardData.length,
    isLoadingDashboard,
    isLoadingProjectsList,
    onFetchDashboardData,
    onFetchProjectsList,
    projectsList.length,
  ]);

  useEffect(() => {
    if (!showLockModal && !showDepositModal) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowLockModal(false);
        setShowDepositModal(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showLockModal, showDepositModal]);

  return (
    <main className="min-h-screen px-6 py-12 md:px-12 selection:bg-greenBright/10 selection:text-greenBright">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-10">
        {/* Header Section */}
        <header className="glass-card rounded-[2.5rem] p-8 md:p-10">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-1">
              <h1 className="font-display text-4xl tracking-tight text-ink">SplitNaira</h1>
              <p className="max-w-md text-sm leading-relaxed text-muted">
                Premium royalty management on Stellar.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {!wallet.connected ? (
                <button
                  type="button"
                  onClick={onConnectWallet}
                  className="premium-button rounded-full bg-greenMid px-8 py-3 text-sm font-bold text-white shadow-lg"
                >
                  Connect Wallet
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onReconnectWallet}
                    className="premium-button rounded-full border bg-white/5 px-6 py-3 text-sm"
                  >
                    Sync
                  </button>
                  <button
                    type="button"
                    onClick={onDisconnectWallet}
                    className="premium-button rounded-full border bg-white/5 px-6 py-3 text-sm hover:text-red-400"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          </div>
          {wallet.connected && (
            <div className="mt-8 flex flex-wrap gap-8 border-t border-white/5 pt-8 text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-greenBright animate-pulse" />
                <span>Status: Connected</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="opacity-40">Wallet</span>
                <span className="text-ink font-mono">
                  {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-6)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="opacity-40">Network</span>
                <span className="text-ink">{wallet.network}</span>
              </div>
            </div>
          )}
        </header>

        {/* Navigation Tabs */}
        <nav className="flex gap-1 rounded-full bg-white/5 p-1.5 self-center">
          {["dashboard", "create", "manage", "projects"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={clsx(
                "rounded-full px-8 py-2.5 text-xs font-bold uppercase tracking-widest transition-all",
                activeTab === tab
                  ? "bg-white/10 text-ink shadow-sm"
                  : "text-muted hover:text-ink/80",
              )}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>

        {/* Content Tabs */}
        {activeTab === "dashboard" ? (
          <div className="space-y-10 animate-in fade-in duration-700">
            <div className="grid gap-6 md:grid-cols-3">
              {isLoadingDashboard ? (
                Array(3)
                  .fill(0)
                  .map((_, i) => <SummaryCardSkeleton key={i} />)
              ) : (
                <>
                  <div className="glass-card rounded-3xl p-8 border-l-4 border-greenBright">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted mb-2">
                      Total Managed
                    </p>
                    <p className="text-3xl font-display">
                      {dashboardData.length}{" "}
                      <span className="text-sm font-sans text-muted">Projects</span>
                    </p>
                  </div>
                  <div className="glass-card rounded-3xl p-8 border-l-4 border-goldLight">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted mb-2">
                      Platform Treasury
                    </p>
                    <p className="text-3xl font-display text-greenBright">
                      {dashboardData
                        .reduce((s, p) => s + Number(p.balance), 0)
                        .toLocaleString()}{" "}
                      <span className="text-sm font-sans text-muted">Stroops</span>
                    </p>
                  </div>
                  <div className="glass-card rounded-3xl p-8 border-l-4 border-white/20">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted mb-2">
                      Lifetime Payouts
                    </p>
                    <p className="text-3xl font-display">
                      {dashboardData
                        .reduce((s, p) => s + Number(p.totalDistributed), 0)
                        .toLocaleString()}
                    </p>
                  </div>
                </>
              )}
            </div>

            {wallet.connected && isContractAdmin && tokenAllowlist && (
              <div className="glass-card rounded-[2.5rem] p-8 md:p-10 border border-greenBright/10">
                <div className="flex flex-wrap items-start justify-between gap-6">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-greenBright/80">
                      Admin Control Plane
                    </p>
                    <h2 className="font-display text-2xl tracking-tight">Admin Token Allowlist</h2>
                    <p className="max-w-2xl text-sm text-muted">
                      Inspect the live allowlist and submit contract-backed allow or disallow actions from the connected admin wallet.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { void refreshTokenAllowlist(); }}
                    disabled={isLoadingAllowlist || isUpdatingAllowlist}
                    className="premium-button rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-muted hover:text-ink disabled:opacity-40"
                  >
                    {isLoadingAllowlist ? "Refreshing..." : "Refresh State"}
                  </button>
                </div>

                <div className="mt-8 grid gap-4 md:grid-cols-3">
                  <div className="rounded-3xl border border-white/5 bg-white/2 p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Contract Admin</p>
                    <p className="mt-3 break-all font-mono text-xs text-ink">{tokenAllowlist.admin}</p>
                  </div>
                  <div className="rounded-3xl border border-white/5 bg-white/2 p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Allowlist Mode</p>
                    <p className="mt-3 text-2xl font-display text-greenBright">
                      {tokenAllowlist.allowedTokenCount > 0 ? "Active" : "Open"}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {tokenAllowlist.allowedTokenCount > 0
                        ? "New splits are restricted to the listed token addresses."
                        : "No tokens are listed, so any token address can be used."}
                    </p>
                  </div>
                  <div className="rounded-3xl border border-white/5 bg-white/2 p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Listed Tokens</p>
                    <p className="mt-3 text-2xl font-display">{tokenAllowlist.allowedTokenCount}</p>
                    <p className="mt-1 text-xs text-muted">
                      Current page contains {tokenAllowlist.tokens.length} token address{tokenAllowlist.tokens.length === 1 ? "" : "es"}.
                    </p>
                  </div>
                </div>

                <div className="mt-8 rounded-[2rem] border border-white/5 bg-white/2 p-6">
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <div className="space-y-2">
                      <label
                        htmlFor="allowlist-token-input"
                        className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted"
                      >
                        Token Contract Address
                      </label>
                      <input
                        id="allowlist-token-input"
                        value={allowlistTokenInput}
                        onChange={(event) => setAllowlistTokenInput(event.target.value)}
                        placeholder="Enter token address to allow or disallow"
                        disabled={isUpdatingAllowlist}
                        className={clsx(
                          "glass-input w-full rounded-2xl px-5 py-4 text-sm",
                          normalizedAllowlistToken && !isValidAllowlistToken
                            ? "border-red-500/50 bg-red-500/5"
                            : "",
                        )}
                      />
                      {normalizedAllowlistToken && !isValidAllowlistToken && (
                        <p className="text-[10px] font-bold uppercase tracking-widest text-red-400">
                          Enter a valid Stellar account or contract address.
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { void onSubmitAllowlistAction("allow"); }}
                      disabled={isUpdatingAllowlist || !isValidAllowlistToken}
                      className="premium-button self-end rounded-2xl bg-greenBright px-6 py-4 text-[10px] font-black uppercase tracking-[0.3em] text-[#0a0a09] disabled:opacity-30"
                    >
                      {isUpdatingAllowlist ? "Submitting..." : "Allow Token"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { void onSubmitAllowlistAction("disallow"); }}
                      disabled={isUpdatingAllowlist || !isValidAllowlistToken}
                      className="premium-button self-end rounded-2xl border border-red-400/30 bg-red-500/10 px-6 py-4 text-[10px] font-black uppercase tracking-[0.3em] text-red-300 disabled:opacity-30"
                    >
                      {isUpdatingAllowlist ? "Submitting..." : "Disallow Token"}
                    </button>
                  </div>
                </div>

                {lastAllowlistTx && (
                  <div className="mt-6 rounded-2xl border border-greenBright/20 bg-greenBright/5 p-5">
                    <div className="flex items-start gap-4">
                      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-greenBright/10">
                        <svg className="h-5 w-5 text-greenBright" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-greenBright">
                          {lastAllowlistTx.action === "allow" ? "Allowlist updated" : "Allowlist removal confirmed"}
                        </h3>
                        <p className="text-sm text-muted">
                          {lastAllowlistTx.action === "allow" ? "Allowed" : "Disallowed"} token{" "}
                          <span className="font-mono text-ink">{lastAllowlistTx.token}</span>.
                        </p>
                        {lastAllowlistTx.txHash && (
                          <>
                            <p className="font-mono text-[10px] text-muted break-all opacity-80">
                              Tx: {lastAllowlistTx.txHash}
                            </p>
                            <a
                              href={`https://stellar.expert/explorer/testnet/tx/${lastAllowlistTx.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-block pt-1 text-[10px] font-bold text-greenBright underline underline-offset-4 hover:text-white"
                            >
                              View on Explorer →
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-8 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
                      Current Allowed Tokens
                    </h3>
                    <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted">
                      {tokenAllowlist.allowedTokenCount} total
                    </span>
                  </div>
                  {tokenAllowlist.tokens.length > 0 ? (
                    <div className="space-y-3">
                      {tokenAllowlist.tokens.map((allowedToken) => (
                        <div key={allowedToken} className="rounded-2xl border border-white/5 bg-white/2 px-5 py-4">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-greenBright/70">Allowed Token</p>
                          <p className="mt-2 break-all font-mono text-xs text-ink">{allowedToken}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/2 px-5 py-6 text-sm text-muted">
                      No token addresses are allowlisted yet. The contract currently accepts any token address for new splits.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Issue #166: Unallocated Token Recovery Console */}
            {wallet.connected && isContractAdmin && (
              <div className="glass-card rounded-[2.5rem] p-8 md:p-10 border border-goldLight/10">
                <div className="space-y-1 mb-8">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-goldLight/80">
                    Admin — Recovery Console
                  </p>
                  <h2 className="font-display text-2xl tracking-tight">Unallocated Token Recovery</h2>
                  <p className="max-w-2xl text-sm text-muted">
                    Inspect and safely recover tokens that were sent directly to the contract address
                    outside of any tracked project balance. This action never touches project-accounted funds.
                  </p>
                </div>

                <div className="space-y-4">
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Recovery Token Address</span>
                    <input
                      type="text"
                      value={recoveryTokenInput}
                      onChange={(e) => setRecoveryTokenInput(e.target.value)}
                      placeholder="C..."
                      className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-ink placeholder:text-muted/40 focus:outline-none focus:ring-2 focus:ring-goldLight/30"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={onInspectUnallocated}
                    disabled={isLoadingUnallocated || !recoveryTokenInput.trim()}
                    className="rounded-xl border border-goldLight/30 bg-goldLight/10 px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-goldLight transition-all hover:bg-goldLight/20 disabled:opacity-40"
                  >
                    {isLoadingUnallocated ? "Inspecting…" : "Inspect Unallocated Balance"}
                  </button>

                  {unallocatedError && (
                    <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                      {unallocatedError}
                    </p>
                  )}

                  {unallocatedBalance && (
                    <div className="rounded-2xl border border-goldLight/20 bg-goldLight/5 p-6 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-goldLight/80">Recoverable Balance</p>
                          <p className="font-mono text-2xl font-bold text-goldLight">
                            {Number(unallocatedBalance.unallocated).toLocaleString()}{" "}
                            <span className="text-sm font-sans text-muted">Stroops</span>
                          </p>
                        </div>
                        <div className="text-right space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Token</p>
                          <p className="font-mono text-[11px] text-muted break-all max-w-[200px]">{unallocatedBalance.token}</p>
                        </div>
                      </div>

                      {Number(unallocatedBalance.unallocated) > 0 && !showRecoveryConfirm && (
                        <div className="space-y-3 pt-2 border-t border-white/5">
                          <label className="block">
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Destination Address</span>
                            <input
                              type="text"
                              value={recoveryToInput}
                              onChange={(e) => setRecoveryToInput(e.target.value)}
                              placeholder="G... or C..."
                              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-ink placeholder:text-muted/40 focus:outline-none focus:ring-2 focus:ring-goldLight/30"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Amount (Stroops)</span>
                            <input
                              type="number"
                              min={1}
                              max={Number(unallocatedBalance.unallocated)}
                              value={recoveryAmountInput}
                              onChange={(e) => setRecoveryAmountInput(e.target.value)}
                              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-ink placeholder:text-muted/40 focus:outline-none focus:ring-2 focus:ring-goldLight/30"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              if (!recoveryToInput.trim() || !recoveryAmountInput || Number(recoveryAmountInput) <= 0) {
                                notify.error("Fill in destination address and a valid amount.");
                                return;
                              }
                              setShowRecoveryConfirm(true);
                            }}
                            className="rounded-xl bg-goldLight/20 px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-goldLight transition-all hover:bg-goldLight/30"
                          >
                            Review Recovery
                          </button>
                        </div>
                      )}

                      {showRecoveryConfirm && (
                        <div className="space-y-4 rounded-2xl border border-goldLight/30 bg-black/30 p-6 pt-4">
                          <h3 className="text-xs font-bold uppercase tracking-widest text-goldLight">
                            Confirm Recovery — Review Before Submitting
                          </h3>
                          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                            <dt className="text-muted">Token</dt>
                            <dd className="font-mono text-[11px] break-all">{unallocatedBalance.token}</dd>
                            <dt className="text-muted">Destination</dt>
                            <dd className="font-mono text-[11px] break-all">{recoveryToInput}</dd>
                            <dt className="text-muted">Amount</dt>
                            <dd className="font-mono font-bold text-goldLight">{Number(recoveryAmountInput).toLocaleString()} Stroops</dd>
                            <dt className="text-muted">Remaining After</dt>
                            <dd className="font-mono">
                              {(Number(unallocatedBalance.unallocated) - Number(recoveryAmountInput)).toLocaleString()} Stroops
                            </dd>
                          </dl>
                          <p className="text-[11px] text-muted/70 italic">
                            This action only withdraws the unallocated surplus. Project-accounted balances are never touched.
                          </p>
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={onConfirmRecovery}
                              disabled={isSubmittingRecovery}
                              className="rounded-xl bg-goldLight/30 px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-goldLight transition-all hover:bg-goldLight/40 disabled:opacity-40"
                            >
                              {isSubmittingRecovery ? "Submitting…" : "Confirm & Submit"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowRecoveryConfirm(false)}
                              className="rounded-xl border border-white/10 px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-muted transition-all hover:text-ink"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {lastRecoveryTxHash && (
                    <div className="rounded-2xl border border-greenBright/20 bg-greenBright/5 p-5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-greenBright mb-2">Recovery Submitted</p>
                      <p className="font-mono text-[11px] text-muted break-all">Tx: {lastRecoveryTxHash}</p>
                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${lastRecoveryTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block text-[10px] font-bold text-greenBright underline underline-offset-4 hover:text-white"
                      >
                        View on Explorer →
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Issue #165: Distribution Pause Control Plane */}
            {wallet.connected && isContractAdmin && (
              <div className="glass-card rounded-[2.5rem] p-8 md:p-10 border border-red-500/10">
                <div className="flex flex-wrap items-start justify-between gap-6 mb-8">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-400/80">
                      Admin — Emergency Controls
                    </p>
                    <h2 className="font-display text-2xl tracking-tight">Distribution Pause Control</h2>
                    <p className="max-w-2xl text-sm text-muted">
                      Pause or resume all distributions across every project. This is a global emergency stop — use with care.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { void refreshAdminStatus(); }}
                    disabled={isLoadingAdminStatus}
                    className="premium-button rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-muted hover:text-ink disabled:opacity-40"
                  >
                    {isLoadingAdminStatus ? "Refreshing..." : "Refresh State"}
                  </button>
                </div>

                <div
                  className="rounded-3xl border p-6 mb-6 flex items-center justify-between gap-4"
                  style={{ borderColor: adminStatus?.isPaused ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.05)" }}
                >
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Current State</p>
                    {adminStatus ? (
                      <p className={`text-2xl font-display ${adminStatus.isPaused ? "text-amber-400" : "text-greenBright"}`}>
                        {adminStatus.isPaused ? "⏸ Paused" : "▶ Active"}
                      </p>
                    ) : (
                      <p className="text-sm text-muted italic">Loading…</p>
                    )}
                    <p className="text-xs text-muted">
                      {adminStatus?.isPaused
                        ? "All distribution calls will be rejected by the contract."
                        : "Distributions are running normally."}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {!adminStatus?.isPaused ? (
                    <button
                      type="button"
                      onClick={() => setShowPauseConfirm(true)}
                      disabled={isSubmittingPause || isLoadingAdminStatus}
                      className="premium-button rounded-2xl border border-amber-400/30 bg-amber-400/10 px-6 py-4 text-[10px] font-black uppercase tracking-[0.3em] text-amber-300 disabled:opacity-30"
                    >
                      Pause Distributions
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowUnpauseConfirm(true)}
                      disabled={isSubmittingPause || isLoadingAdminStatus}
                      className="premium-button rounded-2xl bg-greenBright px-6 py-4 text-[10px] font-black uppercase tracking-[0.3em] text-[#0a0a09] disabled:opacity-30"
                    >
                      Resume Distributions
                    </button>
                  )}
                </div>

                {lastPauseTxHash && (
                  <div className="mt-6 rounded-2xl border border-greenBright/20 bg-greenBright/5 p-5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-greenBright mb-2">Transaction Submitted</p>
                    <p className="font-mono text-[11px] text-muted break-all">Tx: {lastPauseTxHash}</p>
                    <a
                      href={`https://stellar.expert/explorer/testnet/tx/${lastPauseTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-[10px] font-bold text-greenBright underline underline-offset-4 hover:text-white"
                    >
                      View on Explorer →
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* User Earnings Section */}
            {wallet.connected && (
              <div className="glass-card rounded-[2.5rem] p-8 md:p-10 bg-greenMid/5 border-greenBright/10">
                <div className="flex items-center justify-between mb-8">
                  <div className="space-y-1">
                    <h2 className="font-display text-2xl tracking-tight">Your Cumulative Earnings</h2>
                    <p className="text-sm text-muted">Aggregate revenue share across all active contracts.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-4xl font-display text-greenBright">
                      {Object.values(userEarnings).reduce((sum, val) => sum + Number(val), 0).toLocaleString()}
                      <span className="text-sm font-sans opacity-40 ml-2">Stroops</span>
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {dashboardData
                    .filter((p) => p.collaborators.some((c) => c.address === wallet.address))
                    .map((p) => (
                      <div key={p.projectId} className="bg-white/5 rounded-2xl p-5 border border-white/5 flex justify-between items-center">
                        <div className="space-y-1">
                          <p className="font-bold text-xs truncate max-w-[120px]">{p.title}</p>
                          <p className="text-[9px] text-muted uppercase tracking-widest">
                            {(p.collaborators.find((c) => c.address === wallet.address)?.basisPoints ?? 0) / 100}% Share
                          </p>
                        </div>
                        <p className="font-mono text-sm font-bold text-greenBright/80">
                          +{Number(userEarnings[p.projectId] || 0).toLocaleString()}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Performance Rollups */}
            <div className="glass-card rounded-[2.5rem] p-8 md:p-10">
              <h2 className="font-display text-2xl tracking-tight mb-8">Project Performance Rollups</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted border-b border-white/5">
                      <th className="pb-4 pl-4">Project</th>
                      <th className="pb-4">Category</th>
                      <th className="pb-4 text-right">Balance</th>
                      <th className="pb-4 text-right">Distributed</th>
                      <th className="pb-4 text-right pr-4">Rounds</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {dashboardData.map((p) => (
                      <tr key={p.projectId} className="group hover:bg-white/2 transition-colors">
                        <td className="py-4 pl-4">
                          <p className="font-bold text-sm">{p.title}</p>
                          <p className="text-[9px] font-mono text-muted">{p.projectId}</p>
                        </td>
                        <td className="py-4">
                          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-bold uppercase">{p.projectType}</span>
                        </td>
                        <td className="py-4 text-right font-mono text-xs text-greenBright/80">
                          {Number(p.balance).toLocaleString()}
                        </td>
                        <td className="py-4 text-right font-mono text-xs">
                          {Number(p.totalDistributed).toLocaleString()}
                        </td>
                        <td className="py-4 text-right font-mono text-xs pr-4">
                          {p.distributionRound}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeTab === "create" ? (
          <form onSubmit={handleSubmit(onSubmit)} className="glass-card rounded-[2.5rem] p-8 md:p-10 space-y-12">
            <div className="flex items-center justify-between border-b border-white/5 pb-6">
              <h2 className="font-display text-2xl tracking-tight">Project Setup</h2>
              <span className="text-[10px] font-bold uppercase text-muted">Step 01 / 02</span>
            </div>

            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="projectId"
                  className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted px-1"
                >
                  Project Identifier
                </label>
                <input
                  id="projectId"
                  placeholder="e.g. dawn_of_nova_01"
                  className="glass-input w-full rounded-2xl px-5 py-4 text-sm"
                  {...register("projectId", { required: "Project identifier is required." })}
                />
                {createFormErrors.projectId && (
                  <p className="px-1 text-[10px] font-bold text-red-400 uppercase tracking-tighter">
                    {createFormErrors.projectId.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="title"
                  className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted px-1"
                >
                  Display Title
                </label>
                <input
                  id="title"
                  placeholder="e.g. Dawn of Nova"
                  className="glass-input w-full rounded-2xl px-5 py-4 text-sm"
                  {...register("title", { required: "Display title is required." })}
                />
                {createFormErrors.title && (
                  <p className="px-1 text-[10px] font-bold text-red-400 uppercase tracking-tighter">
                    {createFormErrors.title.message}
                  </p>
                )}
              </div>
              <Controller
                control={control}
                name="token"
                rules={{
                  required: "Asset token is required.",
                  validate: (value) =>
                    StrKey.isValidEd25519PublicKey(value) || StrKey.isValidContract(value)
                      ? true
                      : "Enter a valid Stellar token address.",
                }}
                render={({ field }) => (
                  <TokenSelector
                    value={field.value}
                    onChange={field.onChange}
                    network={wallet.network}
                    required
                  />
                )}
              />
              {createFormErrors.token && (
                <p className="px-1 text-[10px] font-bold text-red-400 uppercase tracking-tighter md:col-span-2 -mt-4">
                  {createFormErrors.token.message}
                </p>
              )}
              <div className="space-y-2">
                <label
                  htmlFor="projectType"
                  className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted px-1"
                >
                  Media Category
                </label>
                <input
                  id="projectType"
                  placeholder="e.g. Music, Film"
                  className="glass-input w-full rounded-2xl px-5 py-4 text-sm"
                  {...register("projectType", { required: "Media category is required." })}
                />
                {createFormErrors.projectType && (
                  <p className="px-1 text-[10px] font-bold text-red-400 uppercase tracking-tighter">
                    {createFormErrors.projectType.message}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-12 space-y-8">
              <div className="flex items-center justify-between border-b border-white/5 pb-6">
                <div className="flex items-center gap-4">
                  <h2 className="font-display text-2xl tracking-tight">Recipients</h2>
                  <span className="rounded-lg bg-white/5 px-2.5 py-1 text-[10px] font-bold text-muted">
                    {collaboratorFields.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => appendCollaborator({ address: "", alias: "", basisPoints: "0" })}
                  className="premium-button flex items-center gap-2 rounded-xl bg-greenMid/10 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-greenBright transition-all hover:bg-greenMid/20"
                >
                  + Add Recipient
                </button>
              </div>
              <div className="space-y-4">
                {collaboratorFields.map((field, index) => {
                  const addressError =
                    createFormErrors.collaborators?.[index]?.address?.message ??
                    collaboratorValidationErrors[field.id];
                  const aliasError = createFormErrors.collaborators?.[index]?.alias?.message;
                  const basisPointsError = createFormErrors.collaborators?.[index]?.basisPoints?.message;

                  return (
                    <div
                      key={field.id}
                      className="group relative grid gap-6 rounded-3xl border border-white/5 bg-white/2 p-6 transition-all hover:bg-white/4 md:grid-cols-12 md:items-start"
                    >
                      <div className="md:col-span-5 space-y-2">
                        <label
                          htmlFor={`address-${field.id}`}
                          className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted/60 px-1"
                        >
                          Wallet Address
                        </label>
                        <input
                          id={`address-${field.id}`}
                          placeholder={`Recipient #${index + 1}`}
                          className={clsx(
                            "glass-input w-full rounded-xl px-4 py-3 text-sm",
                            addressError ? "border-red-500/50 bg-red-500/5" : "",
                          )}
                          {...register(`collaborators.${index}.address`, {
                            required: "Wallet address is required.",
                            validate: (value) =>
                              StrKey.isValidEd25519PublicKey(value) || StrKey.isValidContract(value)
                                ? true
                                : "Enter a valid Stellar address or contract ID.",
                          })}
                        />
                        {addressError && (
                          <p className="px-1 text-[10px] font-bold text-red-400 uppercase tracking-tighter">
                            {addressError}
                          </p>
                        )}
                      </div>
                      <div className="md:col-span-3 space-y-2">
                        <label
                          htmlFor={`alias-${field.id}`}
                          className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted/60 px-1"
                        >
                          Alias
                        </label>
                        <input
                          id={`alias-${field.id}`}
                          placeholder="e.g. Lead Vocals"
                          className={clsx(
                            "glass-input w-full rounded-xl px-4 py-3 text-sm",
                            aliasError ? "border-red-500/50 bg-red-500/5" : "",
                          )}
                          {...register(`collaborators.${index}.alias`, {
                            required: "Alias is required.",
                          })}
                        />
                        {aliasError && (
                          <p className="px-1 text-[10px] font-bold text-red-400 uppercase tracking-tighter">
                            {aliasError}
                          </p>
                        )}
                      </div>
                      <div className="md:col-span-3 space-y-2">
                        <label
                          htmlFor={`bp-${field.id}`}
                          className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted/60 px-1"
                        >
                          Share (BP)
                        </label>
                        <input
                          id={`bp-${field.id}`}
                          type="number"
                          min={0}
                          max={10_000}
                          placeholder="5000"
                          className={clsx(
                            "glass-input w-full rounded-xl px-4 py-3 text-sm",
                            basisPointsError ? "border-red-500/50 bg-red-500/5" : "",
                          )}
                          {...register(`collaborators.${index}.basisPoints`, {
                            required: "Share is required.",
                            validate: (value) => {
                              const parsed = Number.parseInt(value, 10);
                              if (!Number.isFinite(parsed) || parsed < 0) return "Share must be a valid number.";
                              if (parsed > 10_000) return "Share cannot exceed 10,000.";
                              return true;
                            },
                          })}
                        />
                        {basisPointsError && (
                          <p className="px-1 text-[10px] font-bold text-red-400 uppercase tracking-tighter">
                            {basisPointsError}
                          </p>
                        )}
                      </div>
                      <div className="md:col-span-1 pt-8 flex justify-center">
                        <button
                          type="button"
                          onClick={() => removeCollaborator(index)}
                          disabled={collaboratorFields.length <= 2}
                          className="flex h-10 w-10 min-w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-400 opacity-0 transition-opacity hover:bg-red-500/20 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-20"
                        >
                          <svg className="h-5 w-5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-col items-end gap-3 px-4 py-6 rounded-3xl bg-white/2 border border-white/5">
                <div className="flex items-center gap-4">
                  <span className="text-[10px] uppercase text-muted">Allocation Matrix</span>
                  <div
                    className={clsx(
                      "rounded-lg px-4 py-2 font-mono text-sm font-bold",
                      totalBasisPoints === 10000
                        ? "bg-greenMid/10 text-greenBright"
                        : "bg-red-500/10 text-red-400",
                    )}
                  >
                    {totalBasisPoints.toLocaleString()} / 10,000 BP
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-12 pt-12 border-t border-white/5">
              <button
                type="submit"
                disabled={!isValid || sorobanSplitFlowBusy}
                className="premium-button w-full rounded-4xl bg-greenMid py-5 text-sm font-extrabold uppercase tracking-[0.25em] text-white shadow-2xl shadow-greenMid/20 disabled:cursor-not-allowed disabled:opacity-20"
              >
                {isSubmitting ? (
                  <div className="flex items-center justify-center gap-3">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {receipt?.lifecycle === "confirming" && receipt.action === "create"
                      ? "Confirming on ledger…"
                      : "Sign in wallet & submit…"}
                  </div>
                ) : (
                  "Create Split Project"
                )}
              </button>
            </div>
            {receipt && receipt.action === "create" && (
              <TransactionReceiptView receipt={receipt} network={wallet.network} />
            )}

            {latestTxHash && (
              <p className="px-4 text-[10px] font-mono text-muted break-all opacity-70">
                Last transaction hash: {latestTxHash}
              </p>
            )}

            {createdProject && (
              <div className="mt-8 glass-card rounded-[2.5rem] p-8 md:p-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex flex-wrap items-center justify-between gap-6 border-b border-white/5 pb-8">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-display text-2xl tracking-tight">{createdProject.title}</h3>
                      <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted border border-white/5">
                        {createdProject.projectType}
                      </span>
                      {createdProject.locked && (
                        <span className="rounded-full bg-red-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-red-400 border border-red-500/20">
                          Locked
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-xs text-muted opacity-60 break-all">{createdProject.projectId}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Available Funds</p>
                    <p className="text-3xl font-display text-greenBright">
                      {Number(createdProject.balance).toLocaleString()}{" "}
                      <span className="text-sm font-sans opacity-40">Stroops</span>
                    </p>
                  </div>
                </div>

                <div className="mt-8 grid gap-8 md:grid-cols-2">
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-muted border-l-2 border-greenBright pl-4">
                      Collaborators
                    </h4>
                    <div className="space-y-2">
                      {createdProject.collaborators.map((collab, idx) => (
                        <div key={idx} className="flex justify-between items-center rounded-2xl bg-white/2 p-3 text-sm border border-white/5 hover:bg-white/4 transition-colors">
                          <div className="space-y-0.5">
                            <p className="font-bold text-xs">{collab.alias}</p>
                            <p className="font-mono text-[9px] text-muted opacity-60 truncate max-w-30">{collab.address}</p>
                          </div>
                          <span className="font-mono font-bold text-greenBright/80 text-xs">
                            {(collab.basisPoints / 100).toFixed(2)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-muted border-l-2 border-greenBright pl-4">
                      Project Metadata
                    </h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center rounded-2xl bg-white/2 p-3 border border-white/5">
                        <span className="text-xs font-bold text-muted">Distribution Round</span>
                        <span className="font-mono font-bold text-sm">{createdProject.distributionRound}</span>
                      </div>
                      <div className="flex justify-between items-center rounded-2xl bg-white/2 p-3 border border-white/5">
                        <span className="text-xs font-bold text-muted">Total Distributed</span>
                        <span className="font-mono font-bold text-sm">
                          {Number(createdProject.totalDistributed).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center rounded-2xl bg-white/2 p-3 border border-white/5">
                        <span className="text-xs font-bold text-muted">Status</span>
                        <span className={`font-mono font-bold text-xs ${createdProject.locked ? "text-red-400" : "text-greenBright"}`}>
                          {createdProject.locked ? "Locked" : "Active"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-white/5">
                  <button
                    onClick={() => {
                      setActiveTab("manage");
                      setSearchProjectId(createdProject.projectId);
                      setFetchedProject(createdProject);
                    }}
                    className="premium-button w-full rounded-2xl bg-white/10 py-4 text-xs font-bold uppercase tracking-widest text-ink border border-white/10 hover:bg-white/20 transition-all"
                  >
                    Manage Project →
                  </button>
                </div>
              </div>
            )}
          </form>
        ) : activeTab === "manage" ? (
          <div className="space-y-10">
            <div className="glass-card rounded-[2.5rem] p-8 md:p-10">
              <h2 className="font-display text-2xl tracking-tight mb-8">Locate Project</h2>
              <div className="flex gap-4">
                <Input
                  value={searchProjectId}
                  onChange={(e) => setSearchProjectId(e.target.value)}
                  placeholder="Enter Project ID"
                  className="flex-1 rounded-2xl"
                />
                <button
                  onClick={onFetchProject}
                  disabled={isFetchingProject || !searchProjectId.trim()}
                  className="premium-button rounded-2xl bg-white px-8 text-[#0a0a09] font-bold"
                >
                  Search
                </button>
              </div>
            </div>

            {fetchedProject && (
              <div className="glass-card rounded-[2.5rem] p-8 md:p-10 animate-in fade-in zoom-in-95 duration-500">
                <div className="flex flex-wrap items-center justify-between gap-6 border-b border-white/5 pb-8">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h2 className="font-display text-3xl">{fetchedProject.title}</h2>
                      <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold text-muted border border-white/5">
                        {fetchedProject.projectType}
                      </span>
                    </div>
                    <p className="font-mono text-xs text-muted opacity-60 break-all">{fetchedProject.projectId}</p>
                  </div>
                  {fetchedProject.locked ? (
                    <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-amber-200">
                      <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                        <span aria-hidden="true">🔒</span>
                        Split locked - immutable
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {isProjectOwner && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditTitle(fetchedProject.title);
                              setEditProjectType(fetchedProject.projectType);
                              setIsEditingMetadata(true);
                            }}
                            className="premium-button rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-ink transition hover:bg-white/10"
                          >
                            Edit Metadata
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditCollaborators(
                                fetchedProject.collaborators.map((c, i) => ({
                                  id: `edit-collab-${i}`,
                                  address: c.address,
                                  alias: c.alias,
                                  basisPoints: String(c.basisPoints),
                                })),
                              );
                              setIsEditingCollaborators(true);
                            }}
                            className="premium-button rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-ink transition hover:bg-white/10"
                          >
                            Edit Collaborators
                          </button>
                        </>
                      )}
                      {canLockProject && (
                        <button
                          type="button"
                          onClick={() => setShowLockModal(true)}
                          disabled={sorobanSplitFlowBusy}
                          className="premium-button rounded-2xl border border-red-400/30 bg-red-500/10 px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Lock Project
                        </button>
                      )}
                    </div>
                  )}
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase text-muted">Available Funds</p>
                    <p className="text-4xl font-display text-greenBright">
                      {Number(fetchedProject.balance).toLocaleString()}{" "}
                      <span className="text-sm opacity-40">Stroops</span>
                    </p>
                  </div>
                </div>

                <div className="mt-10 grid gap-10 md:grid-cols-2">
                  <div className="space-y-6">
                    <h3 className="text-xs font-bold uppercase text-muted border-l-2 border-greenBright pl-4">
                      Distribution Rules
                    </h3>
                    <div className="space-y-3">
                      {fetchedProject.collaborators.map((collab, idx) => (
                        <div key={idx} className="flex justify-between items-center rounded-2xl bg-white/2 p-4 text-sm border border-white/5">
                          <div className="space-y-0.5">
                            <p className="font-bold">{collab.alias}</p>
                            <p className="font-mono text-[10px] text-muted opacity-60 truncate max-w-[150px]">{collab.address}</p>
                          </div>
                          <span className="font-mono font-bold text-greenBright/80">
                            {(collab.basisPoints / 100).toFixed(2)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h3 className="text-xs font-bold uppercase text-muted border-l-2 border-greenBright pl-4">
                      Transparency History
                    </h3>
                    <div className="relative space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {history.map((item) => (
                        <div key={item.id} className="relative pl-10 group">
                          <div
                            className={clsx(
                              "absolute left-0 top-1 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#0a0a09]",
                              item.type === "round" ? "text-greenBright" : "text-ink/60",
                            )}
                          >
                            {item.type === "round" ? "R" : "P"}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold text-ink">
                                {item.type === "round" ? `Round #${item.round}` : "Payout"}
                              </p>
                            </div>
                            <p className="text-[10px] text-muted">
                              <span className="text-ink">{Number(item.amount).toLocaleString()}</span> Stroops
                            </p>
                            <a
                              href={getExplorerUrl(item.txHash, wallet.network)}
                              target="_blank"
                              className="text-[9px] font-bold text-greenBright/40 hover:text-greenBright uppercase"
                            >
                              Verify →
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setShowDistributeModal(true)}
                      disabled={
                        Number(fetchedProject.balance) <= 0 ||
                        !wallet.connected ||
                        sorobanSplitFlowBusy
                      }
                      className="premium-button w-full rounded-2xl bg-greenBright py-6 text-xs font-black uppercase text-[#0a0a09] shadow-xl"
                    >
                      Trigger Distribution
                    </button>
                    {adminStatus?.isPaused && (
                      <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
                          ⚠ Distributions are paused by the contract admin
                        </p>
                      </div>
                    )}
                    {!wallet.connected && (
                      <p className="text-center text-[10px] font-bold text-red-500 uppercase tracking-widest">
                        Connect wallet to distribute
                      </p>
                    )}
                    {Number(fetchedProject.balance) <= 0 && (
                      <p className="text-center text-[10px] font-bold text-muted uppercase tracking-widest">
                        No funds available to distribute
                      </p>
                    )}
                    {receipt && (receipt.action === "distribute" || receipt.action === "lock" || receipt.action === "deposit") && (
                      <TransactionReceiptView receipt={receipt} network={wallet.network} />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Projects Tab */
          <div className="space-y-10">
            {selectedProjectId === null ? (
              <div className="space-y-8">
                <div className="glass-card rounded-[2.5rem] p-8 md:p-10">
                  <h2 className="font-display text-2xl tracking-tight mb-2">Available Projects</h2>
                  <button
                    onClick={() => void onFetchProjectsList()}
                    disabled={isLoadingProjectsList}
                    className="premium-button rounded-2xl bg-greenMid px-8 py-4 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-20"
                  >
                    Refresh Projects
                  </button>
                </div>
                <div className="grid gap-6 md:grid-cols-2 animate-in fade-in">
                  {projectsList.map((p) => (
                    <button
                      key={p.projectId}
                      onClick={() => {
                        setSelectedProjectId(p.projectId);
                        setFetchedProject(p);
                        fetchHistory(p.projectId);
                      }}
                      className="glass-card rounded-[2.5rem] p-8 text-left hover:bg-white/5 transition-all"
                    >
                      <h3 className="font-display text-xl mb-1">{p.title}</h3>
                      <p className="font-mono text-[10px] text-muted mb-4">{p.projectId}</p>
                      <div className="flex justify-between border-t border-white/5 pt-4">
                        <span className="text-xl font-display text-greenBright">
                          {Number(p.balance).toLocaleString()}
                        </span>
                        <span className="text-[10px] uppercase text-muted">Available</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : fetchedProject ? (
              <div className="space-y-8">
                <button
                  onClick={() => {
                    setSelectedProjectId(null);
                    setFetchedProject(null);
                  }}
                  className="premium-button flex items-center gap-2 rounded-2xl bg-white/5 px-6 py-3 text-sm font-bold uppercase tracking-widest text-muted hover:text-ink hover:bg-white/10 transition-all"
                >
                  Back to Projects
                </button>

                <div className="glass-card rounded-[2.5rem] p-8 md:p-10 animate-in fade-in zoom-in-95 duration-500">
                  <div className="flex flex-wrap items-center justify-between gap-6 border-b border-white/5 pb-8">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <h2 className="font-display text-3xl tracking-tight">{fetchedProject.title}</h2>
                        <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted border border-white/5">
                          {fetchedProject.projectType}
                        </span>
                      </div>
                      <p className="font-mono text-xs text-muted opacity-60 break-all">{fetchedProject.projectId}</p>
                    </div>
                    <div className="text-right space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Available Funds</p>
                      <p className="text-4xl font-display text-greenBright">
                        {Number(fetchedProject.balance).toLocaleString()}{" "}
                        <span className="text-sm font-sans opacity-40">Stroops</span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-10 grid gap-10 md:grid-cols-2">
                    <div className="space-y-6">
                      <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted border-l-2 border-greenBright pl-4">
                        Distribution Rules
                      </h3>
                      <div className="space-y-3">
                        {fetchedProject.collaborators.map((collab, idx) => (
                          <div key={idx} className="flex justify-between items-center rounded-2xl bg-white/2 p-4 text-sm border border-white/5 hover:bg-white/4 transition-colors">
                            <div className="space-y-0.5">
                              <p className="font-bold">{collab.alias}</p>
                              <p className="font-mono text-[10px] text-muted opacity-60 truncate max-w-[150px]">{collab.address}</p>
                            </div>
                            <span className="font-mono font-bold text-greenBright/80">
                              {(collab.basisPoints / 100).toFixed(2)}%
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="pt-6 border-t border-white/5">
                        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted mb-6">Internal Ledgers</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="rounded-2xl border border-white/5 bg-white/2 p-4 space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Rounds</p>
                            <p className="text-xl font-display">{fetchedProject.distributionRound}</p>
                          </div>
                          <div className="rounded-2xl border border-white/5 bg-white/2 p-4 space-y-1 text-right">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Total Paid</p>
                            <p className="text-xl font-display">{Number(fetchedProject.totalDistributed).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted border-l-2 border-greenBright pl-4">
                        Transparency History
                      </h3>
                      <div className="relative space-y-4 before:absolute before:left-[19px] before:top-2 before:h-[calc(100%-16px)] before:w-px before:bg-white/10 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                        {isLoadingHistory ? (
                          <div className="flex items-center gap-3 pl-10 text-[10px] font-bold uppercase tracking-widest text-muted">
                            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Syncing on-chain events...
                          </div>
                        ) : history.length > 0 ? (
                          history.map((item) => (
                            <div key={item.id} className="relative pl-10 group">
                              <div className={clsx(
                                "absolute left-0 top-1 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#0a0a09] transition-all group-hover:border-greenBright/30",
                                item.type === "round" ? "text-greenBright" : "text-ink/60",
                              )}>
                                {item.type === "round" ? (
                                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                  </svg>
                                ) : (
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                  </svg>
                                )}
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-bold text-ink">
                                    {item.type === "round" ? `Distribution Round #${item.round}` : "Recipient Payout"}
                                  </p>
                                  <span className="text-[10px] font-mono text-muted tabular-nums opacity-60">
                                    {new Date(item.ledgerCloseTime * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                </div>
                                <p className="text-[10px] font-medium text-muted uppercase tracking-tighter">
                                  {item.type === "round" ? (
                                    <>Total: <span className="text-ink">{Number(item.amount).toLocaleString()}</span> Stroops</>
                                  ) : (
                                    <>To: <span className="text-ink font-mono">{item.recipient?.slice(0, 8) ?? "Unknown"}...</span> Amount: <span className="text-ink">{Number(item.amount).toLocaleString()}</span></>
                                  )}
                                </p>
                                <a
                                  href={getExplorerUrl(item.txHash, wallet.network)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[9px] font-bold text-greenBright/40 hover:text-greenBright transition-colors uppercase tracking-widest mt-1"
                                >
                                  Verify on {getExplorerLabel(wallet.network)} →
                                </a>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="pl-10 text-[10px] font-bold uppercase tracking-widest text-muted opacity-40 italic">
                            {historyError ? "History unavailable. Retry to refresh." : "No verified history found for this project"}
                          </div>
                        )}

                        {historyError && (
                          <div className="pl-10">
                            <button
                              onClick={() => fetchedProject && fetchHistory(fetchedProject.projectId)}
                              disabled={isLoadingHistory}
                              className="text-[10px] font-bold uppercase tracking-widest text-red-300 hover:text-red-200 disabled:opacity-50"
                            >
                              Retry History
                            </button>
                            {isHistoryStale && (
                              <p className="mt-1 text-[10px] uppercase tracking-widest text-amber-300">
                                Showing stale history data.
                              </p>
                            )}
                          </div>
                        )}

                        {historyCursor && (
                          <div className="mt-4 mb-8 flex justify-center">
                            <button
                              onClick={() => fetchedProject && fetchHistory(fetchedProject.projectId, historyCursor)}
                              disabled={isLoadingHistory}
                              className="text-[10px] font-bold uppercase tracking-[0.2em] text-greenBright hover:text-white transition-colors disabled:opacity-50"
                            >
                              {isLoadingHistory ? "Loading..." : "Load More History ↓"}
                            </button>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => setShowDistributeModal(true)}
                        disabled={
                          Number(fetchedProject.balance) <= 0 ||
                          !wallet.connected ||
                          sorobanSplitFlowBusy
                        }
                        className="premium-button w-full rounded-2xl bg-greenBright py-6 text-xs font-black uppercase tracking-[0.3em] text-[#0a0a09] shadow-xl shadow-greenBright/10 disabled:opacity-10 disabled:bg-white"
                      >
                        Trigger Distribution
                      </button>
                      {adminStatus?.isPaused && (
                        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-center">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
                            ⚠ Distributions are paused by the contract admin
                          </p>
                        </div>
                      )}
                      {!wallet.connected && (
                        <p className="text-center text-[10px] font-bold text-red-500 uppercase tracking-widest">
                          Connect wallet to distribute
                        </p>
                      )}
                      {Number(fetchedProject.balance) <= 0 && (
                        <p className="text-center text-[10px] font-bold text-muted uppercase tracking-widest">
                          No funds available to distribute
                        </p>
                      )}
                      {receipt && (receipt.action === "distribute" || receipt.action === "lock" || receipt.action === "deposit") && (
                        <TransactionReceiptView receipt={receipt} network={wallet.network} />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Distribution Confirmation Modal */}
      {showDistributeModal && fetchedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#0a0a09]/80 backdrop-blur-xl animate-in fade-in">
          <div className="glass-card w-full max-w-lg rounded-[2.5rem] p-10 shadow-2xl">
            <h2 className="font-display text-3xl mb-2">Final Confirmation</h2>
            <p className="text-muted text-sm mb-8 leading-relaxed">
              Splitting{" "}
              <span className="text-ink font-bold">
                {Number(fetchedProject.balance).toLocaleString()} stroops
              </span>{" "}
              across{" "}
              <span className="text-ink font-bold">
                {fetchedProject.collaborators.length} collaborators
              </span>
              .
            </p>
            <div className="space-y-3 max-h-75 overflow-y-auto pr-2 custom-scrollbar">
              {fetchedProject.collaborators.map((collab, idx) => {
                const amount = Math.floor(
                  (Number(fetchedProject.balance) * collab.basisPoints) / 10_000,
                );
                return (
                  <div key={idx} className="flex justify-between items-center rounded-2xl bg-white/5 p-5 border border-white/5">
                    <div className="space-y-0.5">
                      <p className="font-bold text-sm">{collab.alias}</p>
                      <p className="text-[10px] text-muted uppercase tracking-widest">
                        {(collab.basisPoints / 100).toFixed(2)}% Share
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-lg text-greenBright">+{amount.toLocaleString()}</p>
                      <p className="text-[10px] text-muted uppercase tracking-tighter">Stroops</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-10 flex flex-col gap-4">
              <button
                onClick={onDistribute}
                disabled={sorobanSplitFlowBusy}
                className="premium-button w-full rounded-2xl bg-greenBright py-5 text-xs font-black uppercase tracking-[0.3em] text-[#0a0a09]"
              >
                {isSubmitting
                  ? receipt?.lifecycle === "confirming" && receipt.action === "distribute"
                    ? "Confirming on ledger…"
                    : "Signing & submitting…"
                  : "Execute Payout"}
              </button>
              <button
                onClick={() => setShowDistributeModal(false)}
                disabled={sorobanSplitFlowBusy}
                className="premium-button w-full rounded-2xl border border-white/10 py-5 text-xs font-bold uppercase tracking-[0.2em] text-muted hover:text-ink hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Metadata Edit Modal */}
      {isEditingMetadata && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          <div className="glass-card w-full max-w-lg rounded-[2.5rem] p-10 animate-in zoom-in-95 duration-200">
            <h2 className="font-display text-2xl mb-8">Edit Project Metadata</h2>
            <div className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="edit-project-title" className="text-[10px] font-bold uppercase tracking-widest text-muted">
                  Project Title
                </label>
                <input
                  id="edit-project-title"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="glass-input w-full rounded-2xl px-5 py-4 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-project-type" className="text-[10px] font-bold uppercase tracking-widest text-muted">
                  Category
                </label>
                <input
                  id="edit-project-type"
                  value={editProjectType}
                  onChange={(e) => setEditProjectType(e.target.value)}
                  className="glass-input w-full rounded-2xl px-5 py-4 text-sm"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setIsEditingMetadata(false)}
                  className="flex-1 rounded-2xl border border-white/10 px-6 py-4 text-xs font-bold uppercase tracking-widest hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={onUpdateMetadata}
                  disabled={isUpdatingMetadata || !editTitle.trim()}
                  className="flex-1 premium-button rounded-2xl bg-white px-6 py-4 text-xs font-bold uppercase tracking-widest text-[#0a0a09] disabled:opacity-50"
                >
                  {isUpdatingMetadata ? "Updating..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lock Modal */}
      {showLockModal && fetchedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a09]/80 p-6 backdrop-blur-xl">
          <div className="glass-card w-full max-w-lg rounded-[2.5rem] p-10 shadow-2xl">
            <h2 className="font-display text-3xl">Lock project?</h2>
            <div className="mt-6 rounded-2xl border border-red-400/40 bg-red-500/10 p-4">
              <p className="text-sm font-semibold text-red-200">
                Once locked, the split configuration can never be changed.
              </p>
            </div>
            <div className="mt-10 flex flex-col gap-4">
              <button
                onClick={onLockProject}
                disabled={sorobanSplitFlowBusy}
                className="premium-button w-full rounded-2xl bg-red-500 py-5 text-xs font-black uppercase tracking-[0.3em] text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLocking
                  ? receipt?.lifecycle === "confirming" && receipt.action === "lock"
                    ? "Confirming on ledger…"
                    : "Signing & locking…"
                  : "Lock Project"}
              </button>
              <button
                onClick={() => setShowLockModal(false)}
                disabled={sorobanSplitFlowBusy}
                className="premium-button w-full rounded-2xl border border-white/10 py-5 text-xs font-bold uppercase tracking-[0.2em] text-muted hover:bg-white/5 hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {showDepositModal && fetchedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a09]/80 p-6 backdrop-blur-xl animate-in fade-in duration-300">
          <div
            ref={depositModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="deposit-title"
            aria-describedby="deposit-description"
            className="glass-card w-full max-w-lg rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-10 duration-500"
          >
            <h2 id="deposit-title" className="font-display text-3xl mb-2">Deposit Funds</h2>
            <p id="deposit-description" className="text-muted text-sm mb-8 leading-relaxed">
              Contribute funds to project{" "}
              <span className="text-ink font-bold italic">&quot;{fetchedProject.title}&quot;</span>.
            </p>
            <div className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="deposit-amount" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
                  Amount (in tokens)
                </label>
                <input
                  id="deposit-amount"
                  type="number"
                  min="0"
                  step="0.0000001"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0.0"
                  disabled={isDepositing}
                  className="glass-input w-full rounded-2xl px-5 py-4 text-sm disabled:opacity-50"
                />
              </div>
              <div className="rounded-2xl border border-blue-400/40 bg-blue-500/10 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-blue-300">Deposit Summary</p>
                <div className="mt-3 space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted">Amount to deposit:</span>
                    <span className="text-ink font-bold">{depositAmount || "0"} tokens</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted">Project:</span>
                    <span className="text-ink font-bold">{fetchedProject.projectId}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm pt-2 border-t border-blue-400/20">
                    <span className="text-muted">Current balance:</span>
                    <span className="text-greenBright font-bold">
                      {Number(fetchedProject.balance).toLocaleString()} Stroops
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-10 flex flex-col gap-4">
              <button
                type="button"
                onClick={onDeposit}
                disabled={sorobanSplitFlowBusy || !depositAmount || Number.parseFloat(depositAmount) <= 0}
                className="premium-button w-full rounded-2xl bg-blue-500 py-5 text-xs font-black uppercase tracking-[0.3em] text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDepositing
                  ? receipt?.lifecycle === "confirming" && receipt.action === "deposit"
                    ? "Confirming on ledger…"
                    : "Signing & submitting…"
                  : "Confirm Deposit"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDepositModal(false);
                  setDepositAmount("");
                }}
                disabled={sorobanSplitFlowBusy}
                className="premium-button w-full rounded-2xl border border-white/10 py-5 text-xs font-bold uppercase tracking-[0.2em] text-muted hover:bg-white/5 hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pause confirmation modal */}
      {showPauseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a09]/80 p-6 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="glass-card w-full max-w-lg rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 duration-300">
            <h2 className="font-display text-3xl text-amber-400">Pause distributions?</h2>
            <p className="mt-4 text-sm text-muted leading-relaxed">
              This will immediately block all distribution calls across every project until you explicitly resume. No funds will be lost — only payouts are halted.
            </p>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-amber-300">
              This action requires your admin wallet signature.
            </p>
            <div className="mt-8 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => { void onTogglePause("pause"); }}
                disabled={isSubmittingPause}
                className="premium-button w-full rounded-2xl border border-amber-400/30 bg-amber-400/10 py-5 text-xs font-black uppercase tracking-[0.3em] text-amber-300 disabled:opacity-40"
              >
                {isSubmittingPause ? "Signing & submitting..." : "Confirm Pause"}
              </button>
              <button
                type="button"
                onClick={() => setShowPauseConfirm(false)}
                disabled={isSubmittingPause}
                className="premium-button w-full rounded-2xl border border-white/10 py-5 text-xs font-bold uppercase tracking-[0.2em] text-muted hover:bg-white/5 hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unpause confirmation modal */}
      {showUnpauseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a09]/80 p-6 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="glass-card w-full max-w-lg rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 duration-300">
            <h2 className="font-display text-3xl text-greenBright">Resume distributions?</h2>
            <p className="mt-4 text-sm text-muted leading-relaxed">
              This will re-enable distribution calls for all projects. Confirm that the emergency condition has been resolved before proceeding.
            </p>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-greenBright/70">
              This action requires your admin wallet signature.
            </p>
            <div className="mt-8 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => { void onTogglePause("unpause"); }}
                disabled={isSubmittingPause}
                className="premium-button w-full rounded-2xl bg-greenBright py-5 text-xs font-black uppercase tracking-[0.3em] text-[#0a0a09] disabled:opacity-40"
              >
                {isSubmittingPause ? "Signing & submitting..." : "Confirm Resume"}
              </button>
              <button
                type="button"
                onClick={() => setShowUnpauseConfirm(false)}
                disabled={isSubmittingPause}
                className="premium-button w-full rounded-2xl border border-white/10 py-5 text-xs font-bold uppercase tracking-[0.2em] text-muted hover:bg-white/5 hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

