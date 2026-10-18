"use client";

import Link from "next/link";
import {
  ClockCountdown,
  Plus,
  MagnifyingGlass,
  ArrowCounterClockwise,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";

export function QueueSkeleton() {
  return (
    <div className="space-y-3.5">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex flex-col sm:flex-row items-start gap-4 rounded-2xl border border-border bg-surface p-5 animate-pulse"
        >
          {/* Skeleton Thumbnail */}
          <div className="h-28 w-28 shrink-0 rounded-xl bg-surface-2" />

          {/* Skeleton Content */}
          <div className="flex-1 space-y-3 w-full">
            <div className="flex items-center gap-2">
              <div className="h-5 w-16 rounded-full bg-surface-2" />
              <div className="h-5 w-24 rounded-full bg-surface-2" />
              <div className="h-5 w-32 rounded-full bg-surface-2" />
            </div>
            <div className="h-5 w-3/4 rounded-lg bg-surface-2" />
            <div className="h-4 w-full rounded-lg bg-surface-2" />
            <div className="h-4 w-2/3 rounded-lg bg-surface-2" />
          </div>

          {/* Skeleton Actions */}
          <div className="flex sm:flex-col items-center gap-2 shrink-0">
            <div className="h-9 w-24 rounded-xl bg-surface-2" />
            <div className="h-9 w-24 rounded-xl bg-surface-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function QueueEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-surface/60 py-16 px-6 text-center shadow-sm">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner">
        <ClockCountdown size={32} weight="bold" />
      </div>
      <h3 className="mt-4 font-heading text-lg font-bold text-foreground">
        Your Content Queue is Empty
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Generate AI copywriting and images or stage draft posts to schedule them for publishing to your Facebook Page.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link
          href="/dashboard/generate"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover"
        >
          <Plus size={16} weight="bold" />
          Create New Post
        </Link>
      </div>
    </div>
  );
}

export function QueueNoResultsState({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface py-14 px-6 text-center shadow-sm">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
        <MagnifyingGlass size={26} />
      </div>
      <h3 className="mt-3.5 font-heading text-base font-bold text-foreground">
        No posts match your filters
      </h3>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        Try adjusting your search terms, changing the status filter, or reset your search criteria.
      </p>
      <div className="mt-5">
        <Button
          variant="secondary"
          size="sm"
          onClick={onReset}
          className="gap-2"
        >
          <ArrowCounterClockwise size={14} />
          Reset All Filters
        </Button>
      </div>
    </div>
  );
}
