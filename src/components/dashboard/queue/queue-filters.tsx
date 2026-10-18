"use client";

import {
  MagnifyingGlass,
  X,
  Funnel,
  SortAscending,
  SortDescending,
  ArrowCounterClockwise,
} from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";
import type { QueueFilterStatus } from "./queue-stats";

export type SortOption = "newest" | "oldest" | "scheduled";

interface QueueFiltersProps {
  search: string;
  onSearchChange: (val: string) => void;
  statusFilter: QueueFilterStatus;
  onStatusFilterChange: (val: QueueFilterStatus) => void;
  pageFilter: string;
  onPageFilterChange: (val: string) => void;
  availablePages: string[];
  sortOption: SortOption;
  onSortChange: (val: SortOption) => void;
  totalLoaded: number;
  filteredCount: number;
  onResetFilters: () => void;
}

export function QueueFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  pageFilter,
  onPageFilterChange,
  availablePages,
  sortOption,
  onSortChange,
  totalLoaded,
  filteredCount,
  onResetFilters,
}: QueueFiltersProps) {
  const isFiltered = Boolean(
    search.trim() ||
    statusFilter !== "all" ||
    pageFilter !== "all" ||
    sortOption !== "newest"
  );

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Search Bar */}
        <div className="relative flex-1 min-w-0">
          <MagnifyingGlass
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Search posts by title, caption, hashtags..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-background pl-10 pr-9 text-sm text-foreground placeholder:text-muted-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filters Group */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status Dropdown */}
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs">
            <Funnel size={14} className="text-muted-foreground" />
            <span className="text-muted-foreground">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value as QueueFilterStatus)}
              className="bg-transparent font-semibold text-foreground outline-none cursor-pointer"
            >
              <option value="all" className="bg-surface text-foreground">All Posts</option>
              <option value="awaiting_approval" className="bg-surface text-foreground">Awaiting Approval</option>
              <option value="draft" className="bg-surface text-foreground">Drafts</option>
              <option value="scheduled" className="bg-surface text-foreground">Scheduled</option>
              <option value="posted" className="bg-surface text-foreground">Published</option>
              <option value="failed" className="bg-surface text-foreground">Failed</option>
            </select>
          </div>

          {/* Facebook Page Dropdown */}
          {availablePages.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs">
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#1877F2] text-[9px] font-bold text-white">
                f
              </span>
              <span className="text-muted-foreground">Page:</span>
              <select
                value={pageFilter}
                onChange={(e) => onPageFilterChange(e.target.value)}
                className="max-w-[130px] truncate bg-transparent font-semibold text-foreground outline-none cursor-pointer"
              >
                <option value="all" className="bg-surface text-foreground">All Pages</option>
                {availablePages.map((page) => (
                  <option key={page} value={page} className="bg-surface text-foreground truncate">
                    {page}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs">
            {sortOption === "oldest" ? (
              <SortAscending size={14} className="text-muted-foreground" />
            ) : (
              <SortDescending size={14} className="text-muted-foreground" />
            )}
            <span className="text-muted-foreground">Sort:</span>
            <select
              value={sortOption}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              className="bg-transparent font-semibold text-foreground outline-none cursor-pointer"
            >
              <option value="newest" className="bg-surface text-foreground">Newest Created</option>
              <option value="oldest" className="bg-surface text-foreground">Oldest Created</option>
              <option value="scheduled" className="bg-surface text-foreground">Scheduled Time</option>
            </select>
          </div>

          {/* Reset Filters Button */}
          {isFiltered && (
            <button
              onClick={onResetFilters}
              className="inline-flex items-center gap-1 rounded-xl border border-border/80 bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive cursor-pointer"
              title="Reset all filters"
            >
              <ArrowCounterClockwise size={13} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Status Text */}
      <div className="flex items-center justify-between border-t border-border/60 pt-2 text-xs text-muted-foreground">
        <span>
          Showing <strong className="text-foreground">{filteredCount}</strong> of{" "}
          <strong className="text-foreground">{totalLoaded}</strong> posts
        </span>
        {isFiltered && (
          <span className="text-primary font-medium">Filtered results active</span>
        )}
      </div>
    </div>
  );
}
