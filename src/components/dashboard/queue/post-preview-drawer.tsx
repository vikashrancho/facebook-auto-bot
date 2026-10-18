"use client";

import { useEffect } from "react";
import {
  X,
  ShieldCheck,
  Clock,
  Rocket,
  Trash,
  PencilSimple,
  CalendarCheck,
  ArrowSquareOut,
  Hash,
  WarningCircle,
  CheckCircle,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { facebookPostUrl } from "@/lib/types";
import type { Post } from "@/lib/types";

interface PostPreviewDrawerProps {
  post: Post | null;
  isOpen: boolean;
  isBusy: boolean;
  onClose: () => void;
  onApprove: (id: string) => void;
  onRequestPublish: (post: Post) => void;
  onRequestReschedule: (post: Post) => void;
  onRequestDelete: (post: Post) => void;
}

export function PostPreviewDrawer({
  post,
  isOpen,
  isBusy,
  onClose,
  onApprove,
  onRequestPublish,
  onRequestReschedule,
  onRequestDelete,
}: PostPreviewDrawerProps) {
  // Handle ESC key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen && !isBusy) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isBusy, onClose]);

  if (!isOpen || !post) return null;

  const isApproved = Boolean(post.approved_by_user);
  const isPosted = post.status === "posted";
  const isFailed = post.status === "failed";

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={isBusy ? undefined : onClose}
      />

      {/* Drawer Container (Right side on desktop, modal on mobile) */}
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-0 sm:pl-10">
        <div className="w-screen max-w-2xl border-l border-border bg-surface shadow-2xl flex flex-col">
          {/* Drawer Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-2.5">
              <h2 className="font-heading text-lg font-bold text-foreground">
                Post Preview & Details
              </h2>
              <StatusBadge status={post.status} />
              {isApproved && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck size={13} weight="fill" /> Approved
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              disabled={isBusy}
              aria-label="Close drawer"
              className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
            >
              <X size={20} />
            </button>
          </div>

          {/* Drawer Body - Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Error Banner if any */}
            {post.error_message && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                <div className="flex items-start gap-2.5">
                  <WarningCircle size={20} weight="fill" className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Publication Error</p>
                    <p className="mt-0.5 text-xs opacity-90">{post.error_message}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Image Preview Box (Preserves native aspect ratio) */}
            <div className="relative overflow-hidden rounded-2xl border border-border bg-black/30 flex items-center justify-center p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={post.image_url}
                alt={post.title}
                className="max-h-[380px] w-auto max-w-full rounded-xl object-contain shadow-lg"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                  const fallback = document.getElementById("drawer-img-fallback");
                  if (fallback) fallback.style.display = "flex";
                }}
              />
              <div
                id="drawer-img-fallback"
                className="hidden flex-col items-center justify-center py-16 text-muted-foreground"
              >
                <WarningCircle size={36} className="text-warning" />
                <p className="mt-2 text-sm font-medium">Image could not be loaded from storage.</p>
                <p className="text-xs">{post.image_url}</p>
              </div>
            </div>

            {/* Post Information */}
            <div className="space-y-4">
              {/* Title & Topic */}
              <div className="space-y-1.5">
                {post.topic && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Originating Topic:</span>
                    <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-foreground border border-border">
                      {post.topic.startsWith("chatgpt:") ? "ChatGPT Generated" : post.topic}
                    </span>
                  </div>
                )}
                <h3 className="font-heading text-xl font-bold text-foreground leading-snug">
                  {post.title}
                </h3>
              </div>

              {/* Caption */}
              <div className="rounded-xl border border-border/70 bg-surface-2/60 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Post Caption & Body
                </h4>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {post.description}
                </p>

                {/* Hashtags */}
                {post.hashtags && post.hashtags.length > 0 && (
                  <div className="mt-3.5 flex flex-wrap gap-1.5 border-t border-border/50 pt-3">
                    {post.hashtags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                      >
                        <Hash size={12} />
                        {tag.replace(/^#/, "")}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Target Facebook Page */}
                <div className="rounded-xl border border-border bg-surface-2/40 p-3">
                  <p className="font-medium text-muted-foreground">Target Facebook Page</p>
                  <p className="mt-1 font-semibold text-foreground flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1877F2] text-[11px] font-bold text-white">
                      f
                    </span>
                    {post.page_name || "Default Connected Page"}
                  </p>
                </div>

                {/* Schedule / Created Timestamp */}
                <div className="rounded-xl border border-border bg-surface-2/40 p-3">
                  <p className="font-medium text-muted-foreground">
                    {post.scheduled_at ? "Scheduled For" : "Created At"}
                  </p>
                  <p className="mt-1 font-semibold text-foreground flex items-center gap-1.5">
                    <CalendarCheck size={16} className="text-primary" />
                    {new Date(post.scheduled_at ?? post.created_at).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>

                {/* Approval Integrity */}
                <div className="rounded-xl border border-border bg-surface-2/40 p-3">
                  <p className="font-medium text-muted-foreground">Review & Approval State</p>
                  <p className="mt-1 font-semibold flex items-center gap-1.5">
                    {isApproved ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle size={15} weight="fill" />
                        Approved {post.approved_at ? `(${new Date(post.approved_at).toLocaleDateString()})` : ""}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <Clock size={15} weight="bold" />
                        Awaiting Human Approval
                      </span>
                    )}
                  </p>
                </div>

                {/* Internal ID */}
                <div className="rounded-xl border border-border bg-surface-2/40 p-3">
                  <p className="font-medium text-muted-foreground">Internal Post ID</p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground truncate" title={post.id}>
                    {post.id}
                  </p>
                </div>
              </div>

              {/* Facebook Published Link (if already posted) */}
              {isPosted && post.facebook_post_id && (
                <div className="flex items-center justify-between rounded-xl border border-success/30 bg-success/10 p-3.5 text-xs text-success">
                  <span className="font-medium">Published to Facebook</span>
                  <a
                    href={facebookPostUrl(post.facebook_post_id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:opacity-80"
                  >
                    View on Facebook <ArrowSquareOut size={14} />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Drawer Footer - Context Actions */}
          <div className="border-t border-border bg-surface p-4 sm:px-6 flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRequestDelete(post)}
              disabled={isBusy}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <Trash size={16} /> Delete
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onRequestReschedule(post)}
                disabled={isBusy}
              >
                <PencilSimple size={15} /> Reschedule
              </Button>

              {!isApproved && !isPosted && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onApprove(post.id)}
                  disabled={isBusy}
                  className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                >
                  <ShieldCheck size={16} weight="fill" />
                  {isBusy ? "Approving…" : "Approve Post"}
                </Button>
              )}

              {!isPosted && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onRequestPublish(post)}
                  disabled={isBusy}
                  className="gap-2 bg-primary text-primary-foreground hover:bg-primary-hover"
                >
                  <Rocket size={16} weight="fill" />
                  Post now
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
