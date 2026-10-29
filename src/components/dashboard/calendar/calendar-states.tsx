"use client";

import Link from "next/link";
import {
  CalendarBlank,
  Plus,
  MagnifyingGlass,
  ArrowCounterClockwise,
} from "@phosphor-icons/react/dist/ssr";

export function CalendarSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Metrics skeleton */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-surface border border-border" />
        ))}
      </div>

      {/* Grid skeleton */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="h-10 bg-surface-2 border-b border-border" />
        <div className="grid grid-cols-7 gap-px bg-border/40">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-28 bg-surface p-2 space-y-2">
              <div className="h-4 w-4 rounded-full bg-surface-2" />
              {i % 4 === 0 && <div className="h-6 rounded-lg bg-surface-2" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CalendarEmptyState({
  onOpenScheduleModal,
}: {
  onOpenScheduleModal: () => void;
}) {
  return (
    <div className="flex min-h-[380px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface p-8 text-center shadow-sm text-foreground">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <CalendarBlank size={32} weight="bold" />
      </div>
      <h3 className="mt-4 font-heading text-lg font-bold text-foreground">
        Your Content Calendar is Empty
      </h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground leading-relaxed">
        Start scheduling Facebook posts to see them arranged visually across days, weeks, and months.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onOpenScheduleModal}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 active:scale-[0.98] cursor-pointer"
        >
          <CalendarBlank size={16} weight="bold" />
          <span>Schedule Existing Draft</span>
        </button>

        <Link
          href="/dashboard/templates"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 px-4 text-sm font-semibold text-foreground transition hover:bg-surface"
        >
          <Plus size={16} weight="bold" />
          <span>Browse Templates</span>
        </Link>
      </div>
    </div>
  );
}

export function CalendarNoResultsState({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface p-8 text-center shadow-sm text-foreground">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface-2 text-muted-foreground">
        <MagnifyingGlass size={26} />
      </div>
      <h3 className="mt-3 font-heading text-base font-bold text-foreground">
        No Matching Calendar Events
      </h3>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground leading-relaxed">
        We could not find any posts matching your selected filters or search terms.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3.5 text-xs font-semibold text-foreground transition hover:bg-surface cursor-pointer"
      >
        <ArrowCounterClockwise size={14} />
        <span>Reset Filters</span>
      </button>
    </div>
  );
}
