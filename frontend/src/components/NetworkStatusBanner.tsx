"use client";

/**
 * Visible network status banners for slow/failed API requests (#293).
 *
 * Replaces silent failures by surfacing three states that the split-app
 * currently swallows:
 *  - **Loading**  — skeleton/spinner placeholder shown while data is absent.
 *  - **Stale**    — subtle "Refreshing…" pill shown when prior data is visible
 *                   but a background refresh is running.
 *  - **Error**    — dismissible alert with a Retry CTA so operators can
 *                   recover without reloading the entire page.
 */

import * as React from "react";
import { AlertTriangle, Loader2, RefreshCw, X } from "lucide-react";

// ── Stale indicator ───────────────────────────────────────────────────────────

interface StaleIndicatorProps {
  className?: string;
}

export function StaleIndicator({ className }: Readonly<StaleIndicatorProps>) {
  return (
    <span
      aria-live="polite"
      aria-label="Refreshing data in the background"
      className={`inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ${className ?? ""}`}
    >
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      Refreshing…
    </span>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

interface LoadingSkeletonProps {
  rows?: number;
  className?: string;
}

export function LoadingSkeleton({
  rows = 3,
  className,
}: Readonly<LoadingSkeletonProps>) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`space-y-3 ${className ?? ""}`}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-10 w-full animate-pulse rounded-lg bg-zinc-100"
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

// ── Error banner ──────────────────────────────────────────────────────────────

interface NetworkErrorBannerProps {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function NetworkErrorBanner({
  message,
  onRetry,
  onDismiss,
  className,
}: Readonly<NetworkErrorBannerProps>) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm ${className ?? ""}`}
    >
      <AlertTriangle
        className="mt-0.5 h-5 w-5 shrink-0 text-red-500"
        aria-hidden="true"
      />

      <div className="flex-1">
        <p className="font-semibold text-red-800">Request failed</p>
        <p className="mt-0.5 text-red-700">{message}</p>

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-200 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </button>
        )}
      </div>

      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss error"
          onClick={onDismiss}
          className="ml-auto shrink-0 rounded-md p-1 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ── Compound component for typical fetch state ─────────────────────────────────

interface AsyncStateViewProps<T> {
  isLoading: boolean;
  isStale: boolean;
  error: string | null;
  data: T | null;
  onRetry?: () => void;
  skeletonRows?: number;
  children: (data: T) => React.ReactNode;
  className?: string;
}

/**
 * All-in-one component that renders the right UI for each async state,
 * including the stale overlay when a background refresh is in progress.
 *
 * @example
 * <AsyncStateView {...useAsyncState(fetchProjects, [wallet])}>
 *   {(projects) => <ProjectList items={projects} />}
 * </AsyncStateView>
 */
export function AsyncStateView<T>({
  isLoading,
  isStale,
  error,
  data,
  onRetry,
  skeletonRows = 3,
  children,
  className,
}: Readonly<AsyncStateViewProps<T>>) {
  const [dismissed, setDismissed] = React.useState(false);

  // Reset dismissed state when a new error appears
  React.useEffect(() => {
    if (error) setDismissed(false);
  }, [error]);

  if (isLoading && data === null) {
    return <LoadingSkeleton rows={skeletonRows} className={className} />;
  }

  return (
    <div className={className}>
      {/* Stale indicator — shown while a refresh runs but old data is visible */}
      {isStale && (
        <div className="mb-3">
          <StaleIndicator />
        </div>
      )}

      {/* Error banner — dismissed per session, won't clear existing data */}
      {error && !dismissed && (
        <NetworkErrorBanner
          message={error}
          onRetry={onRetry}
          onDismiss={() => setDismissed(true)}
          className="mb-4"
        />
      )}

      {/* Render children with the last-known-good data even when errored */}
      {data !== null && children(data)}
    </div>
  );
}
