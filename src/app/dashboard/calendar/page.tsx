"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  WarningCircle,
  CheckCircle,
  X,
  ArrowSquareOut,
} from "@phosphor-icons/react/dist/ssr";
import { facebookPostUrl } from "@/lib/types";
import { DEFAULT_TIMEZONE, toUtcIsoString } from "@/lib/time";
import type { Post, CalendarView } from "@/lib/types";

import { CalendarHeader } from "@/components/dashboard/calendar/calendar-header";
import { CalendarSummary, type CalendarSummaryMetrics } from "@/components/dashboard/calendar/calendar-summary";
import {
  CalendarFilters,
  type CalendarStatusFilter,
  type CalendarApprovalFilter,
} from "@/components/dashboard/calendar/calendar-filters";
import { MonthView } from "@/components/dashboard/calendar/month-view";
import { WeekView } from "@/components/dashboard/calendar/week-view";
import { DayView } from "@/components/dashboard/calendar/day-view";
import { AgendaView } from "@/components/dashboard/calendar/agenda-view";
import { PostDetailModal } from "@/components/dashboard/calendar/post-detail-modal";
import { SchedulePostModal } from "@/components/dashboard/calendar/schedule-post-modal";
import { PublishConfirmDialog } from "@/components/dashboard/queue/publish-confirm-dialog";
import { DeleteConfirmDialog } from "@/components/dashboard/queue/delete-confirm-dialog";
import {
  CalendarSkeleton,
  CalendarEmptyState,
  CalendarNoResultsState,
} from "@/components/dashboard/calendar/calendar-states";

export default function ContentCalendarPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<{
    message: string;
    url?: string;
  } | null>(null);

  // Timezone & Navigation state
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [view, setView] = useState<CalendarView>("week");
  const [showFilters, setShowFilters] = useState(false);

  // Filters state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CalendarStatusFilter>("all");
  const [approvalFilter, setApprovalFilter] = useState<CalendarApprovalFilter>("all");
  const [pageFilter, setPageFilter] = useState("all");
  const [summaryFilter, setSummaryFilter] = useState<string>("all");

  // Interactive Modals
  const [detailPost, setDetailPost] = useState<Post | null>(null);
  const [scheduleModalPost, setScheduleModalPost] = useState<Post | null>(null);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleDefaultDate, setScheduleDefaultDate] = useState<Date | null>(null);
  const [publishConfirmPost, setPublishConfirmPost] = useState<Post | null>(null);
  const [deleteConfirmPost, setDeleteConfirmPost] = useState<Post | null>(null);

  // Metrics state
  const [summaryMetrics, setSummaryMetrics] = useState<CalendarSummaryMetrics>({
    scheduledToday: 0,
    scheduledThisWeek: 0,
    awaitingApproval: 0,
    published: 0,
    failedOrAttention: 0,
  });

  // Load calendar posts and settings
  const loadData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/calendar");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load content calendar.");

      setPosts(data.posts ?? []);
      setAllPosts(data.allPosts ?? data.posts ?? []);
      if (data.summary) {
        setSummaryMetrics(data.summary);
      }
      if (data.timeZone) {
        setTimezone(data.timeZone);
      }

      // Synchronize open detail modal post if active
      setDetailPost((prev) => {
        if (!prev) return null;
        const fresh = (data.posts as Post[]).find((p) => p.id === prev.id);
        return fresh ?? prev;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load content calendar.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Unique pages from loaded posts
  const availablePages = useMemo(() => {
    const set = new Set<string>();
    for (const p of allPosts) {
      if (p.page_name) set.add(p.page_name);
    }
    return Array.from(set).sort();
  }, [allPosts]);

  // Available unscheduled draft posts eligible for scheduling
  const availableDrafts = useMemo(() => {
    return allPosts.filter((p) => p.status !== "posted" && p.status !== "publishing");
  }, [allPosts]);

  // Filtered posts for calendar display
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      // 1. Text Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesTitle = post.title?.toLowerCase().includes(q);
        const matchesDesc = post.description?.toLowerCase().includes(q);
        const matchesTags = post.hashtags?.some((t) => t.toLowerCase().includes(q));
        if (!matchesTitle && !matchesDesc && !matchesTags) return false;
      }

      // 2. Publication Status Filter
      if (statusFilter === "scheduled" && post.status !== "scheduled") return false;
      if (statusFilter === "posted" && post.status !== "posted") return false;
      if (statusFilter === "failed" && post.status !== "failed" && !post.error_message) return false;
      if (statusFilter === "draft" && post.status !== "draft") return false;

      // 3. Approval Filter
      if (approvalFilter === "approved" && !post.approved_by_user) return false;
      if (approvalFilter === "awaiting_approval" && (post.approved_by_user || post.status === "posted")) {
        return false;
      }

      // 4. Page Filter
      if (pageFilter !== "all" && post.page_name !== pageFilter) return false;

      // 5. Summary Card Quick Filter
      if (summaryFilter === "awaiting_approval" && (post.approved_by_user || post.status === "posted")) {
        return false;
      }
      if (summaryFilter === "published" && post.status !== "posted") return false;
      if (summaryFilter === "failed_or_attention" && post.status !== "failed" && !post.error_message) {
        return false;
      }

      return true;
    });
  }, [posts, search, statusFilter, approvalFilter, pageFilter, summaryFilter]);

  // Reset all filters helper
  function handleResetFilters() {
    setSearch("");
    setStatusFilter("all");
    setApprovalFilter("all");
    setPageFilter("all");
    setSummaryFilter("all");
  }

  // Navigation handlers
  function handleNavigatePrev() {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (view === "month") d.setMonth(d.getMonth() - 1);
      else if (view === "week") d.setDate(d.getDate() - 7);
      else if (view === "day") d.setDate(d.getDate() - 1);
      return d;
    });
  }

  function handleNavigateNext() {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (view === "month") d.setMonth(d.getMonth() + 1);
      else if (view === "week") d.setDate(d.getDate() + 7);
      else if (view === "day") d.setDate(d.getDate() + 1);
      return d;
    });
  }

  function handleNavigateToday() {
    setCurrentDate(new Date());
  }

  // Action: Open scheduling modal for a specific date
  function handleScheduleForDate(date: Date) {
    setScheduleDefaultDate(date);
    setScheduleModalPost(null);
    setIsScheduleModalOpen(true);
  }

  // Action: Open scheduling modal from calendar header or card
  function handleOpenScheduleModal(post?: Post | null) {
    setScheduleDefaultDate(null);
    setScheduleModalPost(post ?? null);
    setIsScheduleModalOpen(true);
  }

  // Action: Save schedule via API
  async function handleSaveSchedule(
    postId: string,
    scheduledAt: string,
    scheduleNotes?: string
  ) {
    setBusyId(postId);
    setError(null);

    try {
      const res = await fetch(`/api/posts/${postId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt,
          scheduleNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to schedule post.");

      setSuccessBanner({
        message: `Post successfully scheduled for ${new Date(scheduledAt).toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        })} (${timezone}).`,
      });

      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule post.");
      throw err;
    } finally {
      setBusyId(null);
    }
  }

  // Action: Drag-and-drop reschedule to a new calendar day
  async function handleMovePost(postId: string, targetDate: Date) {
    const post = posts.find((p) => p.id === postId);
    if (!post || !post.scheduled_at) return;

    if (post.status === "posted" || post.status === "publishing") {
      setError("Cannot move a post that has already published or is currently publishing.");
      return;
    }

    setBusyId(postId);
    setError(null);

    try {
      // Retain the existing hours and minutes in target timezone, changing only the calendar date
      const existingDate = new Date(post.scheduled_at);
      const hours = existingDate.getUTCHours();
      const minutes = existingDate.getUTCMinutes();

      const newDate = new Date(Date.UTC(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate(),
        hours,
        minutes,
        0
      ));

      const newIso = newDate.toISOString();

      if (newDate.getTime() <= Date.now()) {
        throw new Error("Cannot reschedule a post to a past date or time.");
      }

      const res = await fetch(`/api/posts/${postId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt: newIso,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reschedule post.");

      setSuccessBanner({
        message: `Post moved to ${targetDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}.`,
      });

      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reschedule post.");
    } finally {
      setBusyId(null);
    }
  }

  // Action: Cancel schedule (revert to draft)
  async function handleCancelSchedule(post: Post) {
    setBusyId(post.id);
    setError(null);

    try {
      const res = await fetch(`/api/posts/${post.id}/cancel-schedule`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to cancel schedule.");

      setSuccessBanner({
        message: "Schedule removed. Post returned to draft in Queue.",
      });

      if (detailPost?.id === post.id) {
        setDetailPost(null);
      }

      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel schedule.");
    } finally {
      setBusyId(null);
    }
  }

  // Action: Approve post
  async function handleApprove(id: string) {
    setBusyId(id);
    setError(null);

    try {
      const res = await fetch(`/api/posts/${id}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to approve post.");

      setSuccessBanner({
        message: "Post successfully approved by human review.",
      });

      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve post.");
    } finally {
      setBusyId(null);
    }
  }

  // Action: Publish Now (from confirm dialog)
  async function handleConfirmPublish() {
    if (!publishConfirmPost) return;
    const post = publishConfirmPost;
    setBusyId(post.id);
    setError(null);

    try {
      const res = await fetch(`/api/posts/${post.id}/post-now`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to publish post.");
      if (data.post?.status === "failed") {
        throw new Error(data.post.error_message ?? "Facebook publishing failed.");
      }

      const fbUrl = data.post?.facebook_post_id
        ? facebookPostUrl(data.post.facebook_post_id)
        : undefined;

      setSuccessBanner({
        message: "Post successfully published to Facebook 🎉",
        url: fbUrl,
      });

      setPublishConfirmPost(null);
      if (detailPost?.id === post.id) {
        setDetailPost(null);
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish post.");
    } finally {
      setBusyId(null);
    }
  }

  // Action: Delete post draft
  async function handleConfirmDelete() {
    if (!deleteConfirmPost) return;
    const post = deleteConfirmPost;
    setBusyId(post.id);
    setError(null);

    try {
      const res = await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete post.");
      }

      setSuccessBanner({
        message: "Post draft successfully deleted.",
      });

      setDeleteConfirmPost(null);
      if (detailPost?.id === post.id) {
        setDetailPost(null);
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete post.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Calendar Header (Meta-style) */}
      <CalendarHeader
        currentDate={currentDate}
        view={view}
        timezone={timezone}
        isRefreshing={refreshing}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters((prev) => !prev)}
        onViewChange={setView}
        onNavigatePrev={handleNavigatePrev}
        onNavigateNext={handleNavigateNext}
        onNavigateToday={handleNavigateToday}
        onDateSelect={(d) => setCurrentDate(d)}
        onOpenScheduleModal={() => handleOpenScheduleModal(null)}
        onRefresh={() => loadData(true)}
      />

      {/* 2. Notifications & Feedback */}
      {error && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive shadow-sm">
          <div className="flex items-start gap-2.5">
            <WarningCircle size={20} weight="fill" className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Action Halted</p>
              <p className="mt-0.5 opacity-90">{error}</p>
            </div>
          </div>
          <button
            onClick={() => setError(null)}
            className="rounded-lg p-1 text-destructive/70 hover:bg-destructive/20 hover:text-destructive cursor-pointer"
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {successBanner && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-success/30 bg-success/10 p-4 text-sm text-success shadow-sm">
          <div className="flex items-center gap-2.5">
            <CheckCircle size={20} weight="fill" className="shrink-0" />
            <span>{successBanner.message}</span>
            {successBanner.url && (
              <a
                href={successBanner.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:opacity-80"
              >
                View on Facebook <ArrowSquareOut size={14} />
              </a>
            )}
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="rounded-lg p-1 text-success/70 hover:bg-success/20 hover:text-success cursor-pointer"
            aria-label="Dismiss banner"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* 3. Filter Toolbar (Toggled by Header Filter Button or Active Filters) */}
      {(showFilters ||
        Boolean(search.trim()) ||
        statusFilter !== "all" ||
        approvalFilter !== "all" ||
        pageFilter !== "all") && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-150">
          <CalendarFilters
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            approvalFilter={approvalFilter}
            onApprovalFilterChange={setApprovalFilter}
            pageFilter={pageFilter}
            onPageFilterChange={setPageFilter}
            availablePages={availablePages}
            totalPosts={posts.length}
            filteredCount={filteredPosts.length}
            onResetFilters={handleResetFilters}
          />
        </div>
      )}

      {/* 4. Summary Indicators (Counts from database) */}
      <CalendarSummary
        metrics={summaryMetrics}
        activeFilter={summaryFilter}
        onSelectFilter={setSummaryFilter}
      />

      {/* 5. Main Calendar View */}
      <div>
        {loading ? (
          <CalendarSkeleton />
        ) : posts.length === 0 ? (
          <CalendarEmptyState
            onOpenScheduleModal={() => handleOpenScheduleModal(null)}
          />
        ) : filteredPosts.length === 0 ? (
          <CalendarNoResultsState onReset={handleResetFilters} />
        ) : view === "month" ? (
          <MonthView
            currentDate={currentDate}
            posts={filteredPosts}
            timezone={timezone}
            onSelectPost={(p) => setDetailPost(p)}
            onScheduleForDate={handleScheduleForDate}
            onMovePost={handleMovePost}
          />
        ) : view === "week" ? (
          <WeekView
            currentDate={currentDate}
            posts={filteredPosts}
            timezone={timezone}
            onSelectPost={(p) => setDetailPost(p)}
            onScheduleForDate={handleScheduleForDate}
            onMovePost={handleMovePost}
          />
        ) : view === "day" ? (
          <DayView
            currentDate={currentDate}
            posts={filteredPosts}
            timezone={timezone}
            onSelectPost={(p) => setDetailPost(p)}
            onScheduleForDate={handleScheduleForDate}
            onApprove={handleApprove}
            onRequestPublish={(p) => setPublishConfirmPost(p)}
            onRequestReschedule={(p) => handleOpenScheduleModal(p)}
            onRequestCancelSchedule={handleCancelSchedule}
          />
        ) : (
          <AgendaView
            posts={filteredPosts}
            timezone={timezone}
            onSelectPost={(p) => setDetailPost(p)}
            onApprove={handleApprove}
            onRequestPublish={(p) => setPublishConfirmPost(p)}
            onRequestReschedule={(p) => handleOpenScheduleModal(p)}
            onRequestCancelSchedule={handleCancelSchedule}
          />
        )}
      </div>

      {/* 6. Post Detail Modal / Drawer */}
      <PostDetailModal
        post={detailPost}
        isOpen={Boolean(detailPost)}
        isBusy={busyId === detailPost?.id}
        timezone={timezone}
        onClose={() => setDetailPost(null)}
        onApprove={handleApprove}
        onRequestPublish={(p) => setPublishConfirmPost(p)}
        onRequestReschedule={(p) => handleOpenScheduleModal(p)}
        onRequestCancelSchedule={handleCancelSchedule}
        onRequestDelete={(p) => setDeleteConfirmPost(p)}
      />

      {/* 7. Schedule Post Modal */}
      <SchedulePostModal
        post={scheduleModalPost}
        availableDrafts={availableDrafts}
        isOpen={isScheduleModalOpen}
        isBusy={Boolean(busyId)}
        timezone={timezone}
        defaultDate={scheduleDefaultDate}
        onClose={() => {
          setIsScheduleModalOpen(false);
          setScheduleModalPost(null);
          setScheduleDefaultDate(null);
        }}
        onSaveSchedule={handleSaveSchedule}
      />

      {/* 8. Publish Confirmation Dialog */}
      <PublishConfirmDialog
        post={publishConfirmPost}
        isOpen={Boolean(publishConfirmPost)}
        isBusy={busyId === publishConfirmPost?.id}
        onClose={() => setPublishConfirmPost(null)}
        onConfirm={handleConfirmPublish}
      />

      {/* 9. Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        post={deleteConfirmPost}
        isOpen={Boolean(deleteConfirmPost)}
        isBusy={busyId === deleteConfirmPost?.id}
        onClose={() => setDeleteConfirmPost(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
