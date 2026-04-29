"use client";

import { clsx } from "clsx";

interface SkeletonProps {
  className?: string;
  variant?: "line" | "circle" | "rect";
  animated?: boolean;
}

/**
 * Base Skeleton component for displaying loading placeholders
 * Uses Tailwind CSS for styling and animations
 */
export function Skeleton({
  className,
  variant = "rect",
  animated = true,
}: SkeletonProps) {
  const baseClasses = "bg-gray-200 dark:bg-gray-700";
  const animationClasses = animated
    ? "animate-pulse"
    : "";

  const variantClasses = {
    line: "h-4 rounded",
    circle: "rounded-full aspect-square",
    rect: "rounded",
  };

  return (
    <div
      className={clsx(
        baseClasses,
        animationClasses,
        variantClasses[variant],
        className
      )}
    />
  );
}

/**
 * Loading skeleton for project cards
 */
export function ProjectCardSkeleton() {
  return (
    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-4 bg-white dark:bg-gray-900">
      {/* Header with title and badge */}
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4 rounded" />
          <Skeleton className="h-4 w-1/2 rounded" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>

      {/* Project details grid */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Skeleton className="h-3 w-1/2 mb-2 rounded" />
          <Skeleton className="h-5 w-3/4 rounded" />
        </div>
        <div>
          <Skeleton className="h-3 w-1/2 mb-2 rounded" />
          <Skeleton className="h-5 w-3/4 rounded" />
        </div>
      </div>

      {/* Collaborators section */}
      <div>
        <Skeleton className="h-3 w-1/4 mb-2 rounded" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-8 rounded-full" variant="circle" />
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Skeleton className="h-8 flex-1 rounded" />
        <Skeleton className="h-8 flex-1 rounded" />
      </div>
    </div>
  );
}

/**
 * Loading skeleton for transaction history items
 */
export function HistoryItemSkeleton() {
  return (
    <div className="p-3 border border-gray-200 dark:border-gray-700 rounded flex items-center gap-3 bg-white dark:bg-gray-900">
      {/* Icon placeholder */}
      <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" variant="circle" />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="space-y-1">
          <Skeleton className="h-4 w-1/2 rounded" />
          <Skeleton className="h-3 w-2/3 rounded" />
        </div>
      </div>

      {/* Amount */}
      <div className="text-right flex-shrink-0">
        <Skeleton className="h-4 w-16 mb-1 rounded" />
        <Skeleton className="h-3 w-12 rounded" />
      </div>
    </div>
  );
}

/**
 * Loading skeleton for summary cards (stats/metrics)
 */
export function SummaryCardSkeleton() {
  return (
    <div className="p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
      <Skeleton className="h-4 w-1/2 rounded" />
      <Skeleton className="h-6 w-3/4 rounded" />
      <Skeleton className="h-3 w-2/3 rounded" />
    </div>
  );
}

/**
 * Loading skeleton for a list of items
 */
export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <HistoryItemSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Loading skeleton for a detailed project view
 */
export function ProjectDetailSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header section */}
      <div className="p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
        <Skeleton className="h-7 w-1/2 rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-1/2 rounded" />
              <Skeleton className="h-5 w-3/4 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Content tabs skeleton */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-4">
        <div className="flex gap-4">
          <Skeleton className="h-4 w-20 rounded" />
          <Skeleton className="h-4 w-20 rounded" />
          <Skeleton className="h-4 w-20 rounded" />
        </div>
      </div>

      {/* Content area */}
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <HistoryItemSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/**
 * Loading skeleton for dashboard grid
 */
export function DashboardGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <ProjectCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Loading skeleton for a modal/dialog content
 */
export function ModalSkeleton() {
  return (
    <div className="space-y-4">
      {/* Title */}
      <Skeleton className="h-6 w-1/2 rounded" />

      {/* Fields */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-3 w-1/4 rounded" />
            <Skeleton className="h-8 w-full rounded" />
          </div>
        ))}
      </div>

      {/* Buttons */}
      <div className="flex gap-2 pt-4">
        <Skeleton className="h-8 flex-1 rounded" />
        <Skeleton className="h-8 flex-1 rounded" />
      </div>
    </div>
  );
}
