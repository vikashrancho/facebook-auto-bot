"use client";

import {
  MagnifyingGlass,
  Funnel,
  ArrowCounterClockwise,
  X,
} from "@phosphor-icons/react/dist/ssr";

export type CalendarStatusFilter =
  | "all"
  | "scheduled"
  | "posted"
  | "failed"
  | "draft";

export type CalendarApprovalFilter = "all" | "approved" | "awaiting_approval";

interface CalendarFiltersProps {
  search: string;
  onSearchChange: (val: string) => void;
  statusFilter: CalendarStatusFilter;
  onStatusFilterChange: (val: CalendarStatusFilter) => void;
  approvalFilter: CalendarApprovalFilter;
  onApprovalFilterChange: (val: CalendarApprovalFilter) => void;
  pageFilter: string;
  onPageFilterChange: (val: string) => void;
  availablePages: string[];
  totalPosts: number;
  filteredCount: number;
  onResetFilters: () => void;
}

export function CalendarFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  approvalFilter,
  onApprovalFilterChange,
  pageFilter,
  onPageFilterChange,
  availablePages,
  totalPosts,
  filteredCount,
  onResetFilters,
}: CalendarFiltersProps) {
  const isFiltered =
    Boolean(search.trim()) ||
    statusFilter !== "all" ||
    approvalFilter !== "all" ||
    pageFilter !== "all";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between text-foreground">
      {/* Search Input */}
      <div className="relative min-w-[200px] flex-1">
        <MagnifyingGlass
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search scheduled posts by title or hashtags..."
          className="h-9 w-full rounded-xl border border-border bg-surface-2 px-9 text-xs text-foreground outline-none transition focus:border-primary placeholder:text-muted-foreground"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filter Selectors */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Publication Status */}
        <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-2.5 py-1">
          <Funnel size={14} className="text-muted-foreground shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value as CalendarStatusFilter)}
            className="bg-transparent text-xs font-medium text-foreground outline-none cursor-pointer"
          >
            <option value="all" className="bg-surface text-foreground">All Publication States</option>
            <option value="scheduled" className="bg-surface text-foreground">Scheduled</option>
            <option value="posted" className="bg-surface text-foreground">Published</option>
            <option value="failed" className="bg-surface text-foreground">Failed / Attention</option>
            <option value="draft" className="bg-surface text-foreground">Unscheduled Drafts</option>
          </select>
        </div>

        {/* Approval Status */}
        <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-2.5 py-1">
          <select
            value={approvalFilter}
            onChange={(e) => onApprovalFilterChange(e.target.value as CalendarApprovalFilter)}
            className="bg-transparent text-xs font-medium text-foreground outline-none cursor-pointer"
          >
            <option value="all" className="bg-surface text-foreground">All Approval States</option>
            <option value="approved" className="bg-surface text-foreground">Approved Only</option>
            <option value="awaiting_approval" className="bg-surface text-foreground">Awaiting Approval</option>
          </select>
        </div>

        {/* Facebook Page Filter */}
        {availablePages.length > 1 && (
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-2.5 py-1">
            <select
              value={pageFilter}
              onChange={(e) => onPageFilterChange(e.target.value)}
              className="bg-transparent text-xs font-medium text-foreground outline-none cursor-pointer max-w-[150px] truncate"
            >
              <option value="all" className="bg-surface text-foreground">All Facebook Pages</option>
              {availablePages.map((page) => (
                <option key={page} value={page} className="bg-surface text-foreground">
                  {page}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Reset Filter Button */}
        {isFiltered && (
          <button
            type="button"
            onClick={onResetFilters}
            className="flex h-8 items-center gap-1 rounded-xl border border-border bg-surface-2 px-2.5 text-xs font-medium text-muted-foreground transition hover:bg-surface hover:text-foreground cursor-pointer"
          >
            <ArrowCounterClockwise size={13} />
            <span>Reset</span>
          </button>
        )}

        {/* Results Counter */}
        <div className="text-[11px] font-medium text-muted-foreground hidden sm:block">
          Showing <span className="font-semibold text-foreground">{filteredCount}</span> of {totalPosts}
        </div>
      </div>
    </div>
  );
}
