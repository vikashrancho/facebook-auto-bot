"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowsClockwise,
  Plus,
  CheckCircle,
  WarningCircle,
  ArrowSquareOut,
  X,
  Rocket,
} from "@phosphor-icons/react/dist/ssr";

import { facebookPostUrl } from "@/lib/types";
import type { Post } from "@/lib/types";

import { QueueStats, type QueueFilterStatus } from "@/components/dashboard/queue/queue-stats";
import { QueueFilters, type SortOption } from "@/components/dashboard/queue/queue-filters";
import { PostCard } from "@/components/dashboard/queue/post-card";
import { PostPreviewDrawer } from "@/components/dashboard/queue/post-preview-drawer";
import { PublishConfirmDialog } from "@/components/dashboard/queue/publish-confirm-dialog";
import { RescheduleModal } from "@/components/dashboard/queue/reschedule-modal";
import { DeleteConfirmDialog } from "@/components/dashboard/queue/delete-confirm-dialog";
import {
  QueueSkeleton,
  QueueEmptyState,
  QueueNoResultsState,
} from "@/components/dashboard/queue/queue-states";

export default function QueuePage() {
  return (
    <Suspense fallback={<QueueSkeleton />}>
      <QueueContent />
    </Suspense>
  );
}

function QueueContent() {
  const searchParams = useSearchParams();
  const queryPostId = searchParams.get("post");

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<{
    message: string;
    url?: string;
  } | null>(null);

  // Filters & Search State
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<QueueFilterStatus>("all");
  const [pageFilter, setPageFilter] = useState("all");
  const [sortOption, setSortOption] = useState<SortOption>("newest");

  // Interactive Modals & Drawers
  const [previewPost, setPreviewPost] = useState<Post | null>(null);
  const [publishConfirmPost, setPublishConfirmPost] = useState<Post | null>(null);
  const [reschedulePost, setReschedulePost] = useState<Post | null>(null);
  const [deleteConfirmPost, setDeleteConfirmPost] = useState<Post | null>(null);

  // Load posts from API
  const load = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      // Fetch queue items: draft, pending_review, approved, scheduled, publishing, failed
      const res = await fetch("/api/posts?status=draft,pending_review,approved,scheduled,publishing,failed");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load the queue.");
      const loaded: Post[] = data.posts ?? [];
      setPosts(loaded);

      if (queryPostId) {
        const found = loaded.find((p) => p.id === queryPostId);
        if (found) {
          setPreviewPost(found);
        } else {
          // If not in the general queue list, fetch directly
          try {
            const singleRes = await fetch(`/api/posts/${queryPostId}`);
            if (singleRes.ok) {
              const singleData = await singleRes.json();
              if (singleData.post) {
                setPreviewPost(singleData.post);
                setPosts((prev) => [singleData.post, ...prev.filter((p) => p.id !== singleData.post.id)]);
              } else {
                setError(`Post with ID '${queryPostId}' could not be found.`);
              }
            } else {
              setError(`Post with ID '${queryPostId}' could not be found.`);
            }
          } catch {
            setError(`Post with ID '${queryPostId}' could not be found.`);
          }
        }
      } else {
        // Keep previewDrawer post in sync if open
        setPreviewPost((prev) => {
          if (!prev) return null;
          return loaded.find((p) => p.id === prev.id) ?? prev;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the queue.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [queryPostId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handleUpdate = () => {
      load();
    };
    window.addEventListener("pab:posts-updated", handleUpdate);
    return () => window.removeEventListener("pab:posts-updated", handleUpdate);
  }, [load]);


  // Derived Metric Counts
  const totalCount = posts.length;
  const awaitingApprovalCount = useMemo(
    () => posts.filter((p) => !p.approved_by_user && p.status !== "posted").length,
    [posts]
  );
  const scheduledCount = useMemo(
    () => posts.filter((p) => p.status === "scheduled").length,
    [posts]
  );
  const dueCount = useMemo(() => {
    const now = Date.now();
    return posts.filter(
      (p) => p.status === "scheduled" && p.scheduled_at && new Date(p.scheduled_at).getTime() <= now
    ).length;
  }, [posts]);
  const failedCount = useMemo(

    () => posts.filter((p) => p.status === "failed" || Boolean(p.error_message)).length,
    [posts]
  );

  // Fetch connected pages from API to populate filter even if 0 posts exist
  const [connectedPages, setConnectedPages] = useState<{ page_id: string; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/facebook/pages")
      .then((r) => r.json())
      .then((d) => {
        if (d.pages) setConnectedPages(d.pages);
      })
      .catch(() => {});
  }, []);

  // Available unique Facebook pages from loaded posts and connected pages
  const availablePages = useMemo(() => {
    const set = new Set<string>();
    for (const cp of connectedPages) {
      if (cp.name) set.add(cp.name);
    }
    for (const p of posts) {
      if (p.page_name) set.add(p.page_name);
    }
    return Array.from(set).sort();
  }, [posts, connectedPages]);

  // Filtered and Sorted Posts
  const filteredPosts = useMemo(() => {
    return posts
      .filter((post) => {
        // Search text matching
        if (search.trim()) {
          const q = search.toLowerCase();
          const matchesTitle = post.title?.toLowerCase().includes(q);
          const matchesDesc = post.description?.toLowerCase().includes(q);
          const matchesTags = post.hashtags?.some((t) => t.toLowerCase().includes(q));
          if (!matchesTitle && !matchesDesc && !matchesTags) return false;
        }

        // Status Filter
        if (statusFilter === "awaiting_approval") {
          if (post.approved_by_user || post.status === "posted") return false;
        } else if (statusFilter === "scheduled") {
          if (post.status !== "scheduled") return false;
        } else if (statusFilter === "draft") {
          if (post.status !== "draft" && post.status !== "pending_review") return false;
        } else if (statusFilter === "posted") {
          if (post.status !== "posted") return false;
        } else if (statusFilter === "failed") {
          if (post.status !== "failed" && !post.error_message) return false;
        }

        // Page Filter
        if (pageFilter !== "all") {
          if (pageFilter === "unassigned") {
            if (post.page_id) return false;
          } else if (post.page_name !== pageFilter && post.page_id !== pageFilter) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortOption === "oldest") {
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }
        if (sortOption === "scheduled") {
          if (a.scheduled_at && b.scheduled_at) {
            return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
          }
          if (a.scheduled_at) return -1;
          if (b.scheduled_at) return 1;
        }
        // Default newest created
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [posts, search, statusFilter, pageFilter, sortOption]);

  // Reset all filters helper
  function handleResetFilters() {
    setSearch("");
    setStatusFilter("all");
    setPageFilter("all");
    setSortOption("newest");
  }

  // Action: Approve Post (Approve only, does not publish)
  async function handleApprove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${id}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to approve post.");

      setSuccessBanner({
        message: "Post successfully approved for publishing.",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve post.");
    } finally {
      setBusyId(null);
    }
  }

  // Action: Publish Immediately (Triggered from confirmation dialog)
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
      if (previewPost?.id === post.id) {
        setPreviewPost(null);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish post.");
    } finally {
      setBusyId(null);
    }
  }

  // Action: Save Rescheduled Time
  async function handleSaveSchedule(scheduledAt: string | null) {
    if (!reschedulePost) return;
    const post = reschedulePost;
    setBusyId(post.id);
    setError(null);

    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt,
          status: scheduledAt ? "scheduled" : "draft",
          approve: true,
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Failed to update schedule.");

      setSuccessBanner({
        message: scheduledAt
          ? `Post scheduled for ${new Date(scheduledAt).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })}.`
          : "Schedule removed. Post reverted to draft.",
      });

      setReschedulePost(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update schedule.");
      throw err;
    } finally {
      setBusyId(null);
    }
  }

  // Action: Process Due Scheduled Posts Now
  async function handleProcessDuePosts() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/cron/process-queue", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to process due posts.");
      const published = data.processedFromQueue ?? 0;
      setSuccessBanner({
        message:
          published > 0
            ? `Successfully published ${published} due post${published > 1 ? "s" : ""} to Facebook!`
            : "Scheduler executed: no scheduled posts were due at this time.",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run scheduler.");
    } finally {
      setRefreshing(false);
    }
  }

  // Action: Confirm Delete Post
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
      if (previewPost?.id === post.id) {
        setPreviewPost(null);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete post.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Content Queue
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review, organize, and manage your social media posts.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {dueCount > 0 && (
            <button
              type="button"
              onClick={handleProcessDuePosts}
              disabled={refreshing || loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3.5 text-sm font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition cursor-pointer"
            >
              <Rocket size={16} weight="bold" />
              <span>Publish {dueCount} Due Post{dueCount > 1 ? "s" : ""}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => load(true)}

            disabled={refreshing || loading}
            title="Refresh queue items"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-sm font-medium text-muted-foreground transition hover:bg-surface-2 hover:text-foreground disabled:opacity-50 cursor-pointer"
          >
            <ArrowsClockwise
              size={16}
              className={refreshing ? "animate-spin text-primary" : ""}
            />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <Link
            href="/dashboard/generate"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover active:scale-[0.98]"
          >
            <Plus size={16} weight="bold" />
            <span>Create Post</span>
          </Link>
        </div>
      </div>

      {/* 2. Feedback Notifications */}
      {error && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive shadow-sm">
          <div className="flex items-start gap-2.5">
            <WarningCircle size={20} weight="fill" className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Action Failed</p>
              <p className="mt-0.5 opacity-90">{error}</p>
            </div>
          </div>
          <button
            onClick={() => setError(null)}
            className="rounded-lg p-1 text-destructive/70 hover:bg-destructive/20 hover:text-destructive"
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
            className="rounded-lg p-1 text-success/70 hover:bg-success/20 hover:text-success"
            aria-label="Dismiss banner"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* 3. Summary Metric Cards */}
      <QueueStats
        totalCount={totalCount}
        awaitingApprovalCount={awaitingApprovalCount}
        scheduledCount={scheduledCount}
        failedCount={failedCount}
        activeFilter={statusFilter}
        onSelectFilter={setStatusFilter}
      />

      {/* 4. Search & Filter Toolbar */}
      <QueueFilters
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        pageFilter={pageFilter}
        onPageFilterChange={setPageFilter}
        availablePages={availablePages}
        sortOption={sortOption}
        onSortChange={setSortOption}
        totalLoaded={totalCount}
        filteredCount={filteredPosts.length}
        onResetFilters={handleResetFilters}
      />

      {/* 5. Main Post Queue List / States */}
      <div>
        {loading ? (
          <QueueSkeleton />
        ) : posts.length === 0 ? (
          <QueueEmptyState />
        ) : filteredPosts.length === 0 ? (
          <QueueNoResultsState onReset={handleResetFilters} />
        ) : (
          <div className="space-y-3.5">
            {filteredPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                isBusy={busyId === post.id}
                onPreview={(p) => setPreviewPost(p)}
                onApprove={handleApprove}
                onRequestPublish={(p) => setPublishConfirmPost(p)}
                onRequestReschedule={(p) => setReschedulePost(p)}
                onRequestDelete={(p) => setDeleteConfirmPost(p)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 6. Post Detail & Full Preview Drawer */}
      <PostPreviewDrawer
        post={previewPost}
        isOpen={Boolean(previewPost)}
        isBusy={busyId === previewPost?.id}
        onClose={() => setPreviewPost(null)}
        onApprove={handleApprove}
        onRequestPublish={(p) => setPublishConfirmPost(p)}
        onRequestReschedule={(p) => setReschedulePost(p)}
        onRequestDelete={(p) => setDeleteConfirmPost(p)}
        onPostUpdated={(updated) => {
          setPreviewPost(updated);
          setSuccessBanner({
            message: `Destination page updated to '${updated.page_name || updated.page_id}'. Prior approval was reset.`,
          });
          load();
        }}
      />

      {/* 7. Publish Immediate Confirmation Modal */}
      <PublishConfirmDialog
        post={publishConfirmPost}
        isOpen={Boolean(publishConfirmPost)}
        isBusy={busyId === publishConfirmPost?.id}
        onClose={() => setPublishConfirmPost(null)}
        onConfirm={handleConfirmPublish}
      />

      {/* 8. Reschedule Modal */}
      <RescheduleModal
        post={reschedulePost}
        isOpen={Boolean(reschedulePost)}
        isBusy={busyId === reschedulePost?.id}
        onClose={() => setReschedulePost(null)}
        onSave={(iso) => handleSaveSchedule(iso)}
      />

      {/* 9. Delete Confirmation Modal */}
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
