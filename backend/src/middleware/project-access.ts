/**
 * Project access control middleware (#295).
 *
 * Prevents unauthorized enumeration of private group data by verifying
 * that the requesting Stellar address is either:
 *   1. The project owner, or
 *   2. A listed collaborator on the project
 *
 * The requester's address is read from the `X-Stellar-Address` request header.
 * Callers MUST sign a recent challenge nonce to prove ownership before sending
 * this header (enforced by the wallet-level Freighter signature flow).
 *
 * Routes that serve non-sensitive aggregate data (e.g. allowlist, public
 * project list) should NOT apply this middleware.
 */

import type { Request, Response, NextFunction } from "express";
import { Address } from "@stellar/stellar-sdk";
import { AppError, ErrorCode, ErrorType } from "../lib/errors.js";
import { logger } from "../services/logger.js";

/** Header carrying the requester's verified Stellar address. */
export const STELLAR_ADDRESS_HEADER = "x-stellar-address";

/**
 * Validates that the `X-Stellar-Address` header contains a well-formed
 * Stellar address and attaches it to `res.locals.requesterAddress`.
 *
 * Returns 401 if the header is absent or malformed.
 */
export function requireStellarAddress(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const raw = req.headers[STELLAR_ADDRESS_HEADER];
  const addressStr = typeof raw === "string" ? raw.trim() : "";

  if (!addressStr) {
    next(
      new AppError(
        ErrorType.AUTH,
        ErrorCode.UNAUTHORIZED,
        `Missing required header: ${STELLAR_ADDRESS_HEADER}. Include your Stellar public key.`,
      ),
    );
    return;
  }

  try {
    Address.fromString(addressStr);
  } catch {
    next(
      new AppError(
        ErrorType.VALIDATION,
        ErrorCode.VALIDATION_ERROR,
        `Invalid Stellar address in ${STELLAR_ADDRESS_HEADER} header.`,
      ),
    );
    return;
  }

  res.locals.requesterAddress = addressStr;
  next();
}

export interface ProjectAccessTarget {
  /** The owner address stored on the project. */
  owner: string;
  /** Collaborator addresses (fetched from the project record). */
  collaborators: string[];
}

/**
 * Returns a middleware that verifies the requester (from `res.locals.requesterAddress`)
 * is either the project owner or a collaborator.
 *
 * `resolveProject` receives the raw `:projectId` param and should return the
 * access target or `null` when the project does not exist.
 *
 * Usage:
 * ```ts
 * splitsRouter.get(
 *   "/:projectId/private",
 *   requireStellarAddress,
 *   requireProjectAccess(async (id) => fetchProjectAccessTarget(id)),
 *   handler,
 * );
 * ```
 */
export function requireProjectAccess(
  resolveProject: (projectId: string) => Promise<ProjectAccessTarget | null>,
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const requester: string = res.locals.requesterAddress;
    const projectId = req.params.projectId as string | undefined;

    if (!projectId) {
      next();
      return;
    }

    try {
      const target = await resolveProject(projectId);

      if (!target) {
        // Project not found — let the route handler return 404
        next();
        return;
      }

      const isOwner = target.owner === requester;
      const isCollaborator = target.collaborators.includes(requester);

      if (!isOwner && !isCollaborator) {
        logger.warn("Unauthorized project access attempt blocked", {
          requester,
          projectId,
          requestId: res.locals.requestId,
          ip: req.ip,
        });
        next(
          new AppError(
            ErrorType.AUTH,
            ErrorCode.UNAUTHORIZED,
            "You are not authorized to access this project.",
          ),
        );
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
