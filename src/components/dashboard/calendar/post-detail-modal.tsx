"use client";

import { useEffect } from "react";
import {
  X,
  ShieldCheck,
  Clock,
  Rocket,
  Trash,
  CalendarCheck,
  ArrowSquareOut,
  Hash,
  WarningCircle,
  CheckCircle,
  FlagBanner,
  Link as LinkIcon,
} from "@phosphor-icons/react/dist/ssr";
import { StatusBadge } from "@/components/ui/badge";
import { formatFullDateTime } from "@/lib/time";
import { facebookPostUrl } from "@/lib/types";
import type { Post } from "@/lib/types";

interface PostDetailModalProps {
  post: Post | null;
  isOpen: boolean;
  isBusy: boolean;
  timezone: string;
  onClose: () => void;
  onApprove: (id: string) => void;
  onRequestPublish: (post: Post) => void;
  onRequestReschedule: (post: Post) => void;
  onRequestCancelSchedule: (post: Post) => void;
  onRequestDelete: (post: Post) => void;
}

export function PostDetailModal({
  post,
  isOpen,
  isBusy,
  timezone,
  onClose,
  onApprove,
  onRequestPublish,
  onRequestReschedule,
  onRequestCancelSchedule,
  onRequestDelete,
}: PostDetailModalProps) {
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
  const isPublishing = post.status === "publishing";
  const scheduledFormatted = post.scheduled_at
    ? formatFullDateTime(post.scheduled_at, timezone)
    : "Unscheduled Draft";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={isBusy ? undefined : onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-surface shadow-2xl transition-all overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={post.status} />

            {isApproved ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <ShieldCheck size={13} weight="fill" /> Approved
              </span>
            ) : !isPosted ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <Clock size={13} weight="bold" /> Awaiting Approval
              </span>
            ) : null}

            <span className="text-xs text-muted-foreground">
              ID: {post.id.slice(0, 8)}…
            </span>
          </div>

          <button
            onClick={onClose}
            disabled={isBusy}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-surface-2 hover:text-foreground disabled:opacity-50 cursor-pointer"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Failure / Attention Notice if any */}
          {(isFailed || post.error_message) && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive flex items-start gap-2.5">
              <WarningCircle size={18} weight="fill" className="shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Attention Required:</span>
                <p className="mt-0.5 opacity-90 leading-relaxed">{post.error_message}</p>
              </div>
            </div>
          )}

          {/* Stored Image Preview */}
          <div className="relative aspect-square max-h-72 w-full overflow-hidden rounded-xl border border-border bg-black/20 flex items-center justify-center">
            {post.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.image_url}
                alt={post.title}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="text-center text-xs text-muted-foreground">
                No image stored for this post
              </div>
            )}
          </div>

          {/* Schedule & Destination Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-border bg-surface-2 p-3.5 text-xs">
            <div>
              <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                Scheduled Time
              </span>
              <p className="mt-1 font-bold text-foreground flex items-center gap-1.5">
                <Clock size={14} className="text-primary" />
                {scheduledFormatted}
              </p>
            </div>

            <div>
              <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                Target Facebook Page
              </span>
              <p className="mt-1 font-bold text-foreground flex items-center gap-1.5 truncate">
                <FlagBanner size={14} className="text-primary shrink-0" />
                {post.page_name || "Connected Page"}
              </p>
            </div>
          </div>

          {/* Post Content */}
          <div className="space-y-3">
            <div>
              <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                Post Title
              </span>
              <h3 className="mt-1 text-base font-bold text-foreground leading-snug">
                {post.title}
              </h3>
            </div>

            <div>
              <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                Caption Description
              </span>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90 leading-relaxed rounded-xl border border-border bg-surface-2/60 p-3">
                {post.description}
              </p>
            </div>

            {post.link_url && (
              <div>
                <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                  Link Attachment
                </span>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-primary truncate">
                  <LinkIcon size={14} />
                  <a href={post.link_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {post.link_url}
                  </a>
                </p>
              </div>
            )}

            {post.hashtags && post.hashtags.length > 0 && (
              <div>
                <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                  Hashtags
                </span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {post.hashtags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-2 px-2 py-0.5 text-xs font-medium text-foreground"
                    >
                      <Hash size={11} className="text-muted-foreground" />
                      {tag.replace(/^#/, "")}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Content Hash & Security Fingerprint */}
            {post.approval_content_hash && (
              <div className="pt-2 border-t border-border/80">
                <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                  Approval Security Hash
                </span>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground truncate">
                  {post.approval_content_hash}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 border-t border-border bg-surface-2/40 p-4 sm:px-6">
          <div className="flex items-center gap-2">
            {!isPosted && (
              <button
                type="button"
                onClick={() => onRequestDelete(post)}
                disabled={isBusy}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-destructive/20 bg-destructive/5 px-3 text-xs font-semibold text-destructive hover:bg-destructive/15 transition disabled:opacity-50 cursor-pointer"
              >
                <Trash size={15} />
                <span>Delete</span>
              </button>
            )}

            {isPosted && post.facebook_post_id && (
              <a
                href={facebookPostUrl(post.facebook_post_id)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground hover:border-primary/50 transition"
              >
                <span>View on Facebook</span>
                <ArrowSquareOut size={14} />
              </a>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {!isApproved && !isPosted && (
              <button
                type="button"
                onClick={() => onApprove(post.id)}
                disabled={isBusy}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50 cursor-pointer"
              >
                <ShieldCheck size={16} weight="bold" />
                <span>Approve Post</span>
              </button>
            )}

            {!isPosted && (
              <button
                type="button"
                onClick={() => onRequestReschedule(post)}
                disabled={isBusy}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground hover:bg-surface-2 transition disabled:opacity-50 cursor-pointer"
              >
                <CalendarCheck size={15} />
                <span>{post.scheduled_at ? "Reschedule" : "Schedule"}</span>
              </button>
            )}

            {post.scheduled_at && !isPosted && (
              <button
                type="button"
                onClick={() => onRequestCancelSchedule(post)}
                disabled={isBusy}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-rose-500 hover:bg-rose-500/10 transition disabled:opacity-50 cursor-pointer"
              >
                <X size={15} />
                <span>Cancel Schedule</span>
              </button>
            )}

            {!isPosted && (
              <button
                type="button"
                onClick={() => onRequestPublish(post)}
                disabled={isBusy}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover shadow-sm transition disabled:opacity-50 cursor-pointer"
              >
                <Rocket size={15} weight="bold" />
                <span>Publish Now</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
