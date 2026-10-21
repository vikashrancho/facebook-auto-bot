"use client";

import { useState } from "react";
import {
  Rocket,
  Trash,
  PencilSimple,
  ShieldCheck,
  Eye,
  Clock,
  CalendarCheck,
  WarningCircle,
  ArrowSquareOut,
  Hash,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { facebookPostUrl } from "@/lib/types";
import { cn } from "@/lib/cn";
import type { Post } from "@/lib/types";

interface PostCardProps {
  post: Post;
  isBusy: boolean;
  onPreview: (post: Post) => void;
  onApprove: (id: string) => void;
  onRequestPublish: (post: Post) => void;
  onRequestReschedule: (post: Post) => void;
  onRequestDelete: (post: Post) => void;
}

export function PostCard({
  post,
  isBusy,
  onPreview,
  onApprove,
  onRequestPublish,
  onRequestReschedule,
  onRequestDelete,
}: PostCardProps) {
  const [imageError, setImageError] = useState(false);
  const isApproved = Boolean(post.approved_by_user);
  const isPosted = post.status === "posted";
  const isFailed = post.status === "failed";

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md",
        isFailed && "border-destructive/40 bg-destructive/[0.02]"
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* Large Interactive Thumbnail */}
        <div
          onClick={() => onPreview(post)}
          className="relative h-28 w-28 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-border/80 bg-surface-2 transition group-hover:shadow-md"
          title="Click to view full image and details"
        >
          {!imageError ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={post.image_url}
                alt={post.title}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                onError={() => setImageError(true)}
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-foreground shadow">
                  <Eye size={16} weight="bold" />
                </span>
              </div>
            </>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center p-2 text-center text-muted-foreground">
              <WarningCircle size={24} className="text-warning" />
              <span className="mt-1 text-[10px] font-medium leading-tight">Image unverified</span>
            </div>
          )}
        </div>

        {/* Content Column */}
        <div className="min-w-0 flex-1 space-y-2">
          {/* Metadata Badges Row */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={post.status} />

            {/* Separate Approval Status Badge */}
            {isApproved ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <ShieldCheck size={13} weight="fill" /> Approved
              </span>
            ) : !isPosted ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <Clock size={13} weight="bold" /> Awaiting Approval
              </span>
            ) : null}

            {/* Target Page Badge */}
            {post.page_id ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2/70 px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                title={`Target Page: ${post.page_name || "Unknown"} (ID: ${post.page_id})`}
              >
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#1877F2] text-[8px] font-bold text-white">
                  f
                </span>
                <span className="truncate max-w-[150px]">{post.page_name || "Facebook Page"}</span>
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400"
                title="No destination Facebook Page assigned. Explicit selection required before publishing."
              >
                <WarningCircle size={13} weight="bold" /> Unassigned Page
              </span>
            )}

            {/* Date / Schedule Badge */}
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarCheck size={13} />
              {post.scheduled_at ? (
                <span className="text-primary font-medium">
                  Scheduled {new Date(post.scheduled_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              ) : (
                <span>
                  {new Date(post.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              )}
            </span>

            {/* Originating Topic Badge */}
            {post.topic && !post.topic.startsWith("chatgpt:") && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary truncate max-w-[280px]" title={post.topic}>
                <span className="font-semibold text-primary/70">Topic:</span> {post.topic}
              </span>
            )}
          </div>

          {/* Title - Natural wrapping */}
          <h3
            onClick={() => onPreview(post)}
            className="font-heading text-base font-bold text-foreground hover:text-primary transition-colors cursor-pointer leading-snug"
          >
            {post.title}
          </h3>

          {/* Caption Excerpt (2-3 lines) */}
          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {post.description}
          </p>

          {/* Hashtags */}
          {post.hashtags && post.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {post.hashtags.slice(0, 4).map((tag, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary/80 hover:text-primary"
                >
                  <Hash size={11} />
                  {tag.replace(/^#/, "")}
                </span>
              ))}
              {post.hashtags.length > 4 && (
                <span className="text-[11px] text-muted-foreground">
                  +{post.hashtags.length - 4} more
                </span>
              )}
            </div>
          )}

          {/* Error Message Box */}
          {post.error_message && (
            <div className="mt-2 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
              <WarningCircle size={15} weight="fill" className="shrink-0 mt-0.5" />
              <span className="line-clamp-2">{post.error_message}</span>
            </div>
          )}
        </div>

        {/* Action Buttons Column */}
        <div className="flex shrink-0 flex-wrap sm:flex-col items-center sm:items-end justify-end gap-2 pt-2 sm:pt-0 border-t border-border/40 sm:border-t-0">
          {/* Published state: view on Facebook */}
          {isPosted && post.facebook_post_id && (
            <a
              href={facebookPostUrl(post.facebook_post_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-success/10 px-3 text-xs font-semibold text-success hover:bg-success/20 transition"
            >
              <span>View Post</span>
              <ArrowSquareOut size={13} />
            </a>
          )}

          {/* Unapproved state: Approve Button */}
          {!isApproved && !isPosted && (
            <Button
              size="sm"
              variant="secondary"
              className="h-9 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400 gap-1.5"
              onClick={() => onApprove(post.id)}
              disabled={isBusy}
              title="Explicitly approve this draft for publishing"
            >
              <ShieldCheck size={15} weight="fill" />
              <span>{isBusy ? "Approving…" : "Approve"}</span>
            </Button>
          )}

          {/* Approved or Scheduled state: Post Now button (triggers confirmation dialog) */}
          {!isPosted && (
            <Button
              size="sm"
              className="h-9 gap-1.5 bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm"
              onClick={() => onRequestPublish(post)}
              disabled={isBusy}
              title="Publish immediately to Facebook"
            >
              <Rocket size={14} weight="fill" />
              <span>Post now</span>
            </Button>
          )}

          <div className="flex items-center gap-1.5">
            {/* Preview Button */}
            <Button
              size="sm"
              variant="ghost"
              className="h-9 px-2.5 text-muted-foreground hover:text-foreground"
              onClick={() => onPreview(post)}
              disabled={isBusy}
              title="Preview post details"
            >
              <Eye size={15} />
            </Button>

            {/* Reschedule Button */}
            <Button
              size="sm"
              variant="ghost"
              className="h-9 px-2.5 text-muted-foreground hover:text-foreground"
              onClick={() => onRequestReschedule(post)}
              disabled={isBusy}
              title="Schedule or change posting time"
            >
              <PencilSimple size={15} />
            </Button>

            {/* Delete Button */}
            <Button
              size="sm"
              variant="ghost"
              className="h-9 px-2.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={() => onRequestDelete(post)}
              disabled={isBusy}
              title="Delete post"
            >
              <Trash size={15} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
