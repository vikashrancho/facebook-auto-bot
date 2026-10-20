"use client";

import {
  Clock,
  ShieldCheck,
  CheckCircle,
  WarningCircle,
  Plus,
  ImageSquare,
  Rocket,
  CalendarCheck,
  X,
  ArrowSquareOut,
} from "@phosphor-icons/react/dist/ssr";
import { formatTimeOnly, formatFullDateTime, getDateKeyInTimezone } from "@/lib/time";
import { facebookPostUrl } from "@/lib/types";
import type { Post } from "@/lib/types";

interface DayViewProps {
  currentDate: Date;
  posts: Post[];
  timezone: string;
  onSelectPost: (post: Post) => void;
  onScheduleForDate: (date: Date) => void;
  onApprove: (id: string) => void;
  onRequestPublish: (post: Post) => void;
  onRequestReschedule: (post: Post) => void;
  onRequestCancelSchedule: (post: Post) => void;
}

export function DayView({
  currentDate,
  posts,
  timezone,
  onSelectPost,
  onScheduleForDate,
  onApprove,
  onRequestPublish,
  onRequestReschedule,
  onRequestCancelSchedule,
}: DayViewProps) {
  const dayKey = getDateKeyInTimezone(currentDate, timezone);

  // Filter posts scheduled on this exact day
  const dayPosts = posts.filter(
    (p) => p.scheduled_at && getDateKeyInTimezone(p.scheduled_at, timezone) === dayKey
  ).sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime());

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-6 shadow-sm text-foreground">
      {/* Day Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4 gap-3">
        <div>
          <h3 className="text-xl font-bold text-foreground">
            {currentDate.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {dayPosts.length} post{dayPosts.length === 1 ? "" : "s"} scheduled for this day
          </p>
        </div>

        <button
          type="button"
          onClick={() => onScheduleForDate(currentDate)}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 active:scale-[0.98] cursor-pointer"
        >
          <Plus size={15} weight="bold" />
          <span>Schedule Post for this Day</span>
        </button>
      </div>

      {/* Posts Listing */}
      {dayPosts.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
          <Clock size={32} className="text-muted-foreground/60 mb-2" />
          <h4 className="font-semibold text-sm text-foreground">No posts scheduled for this date</h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Select an existing draft from your Queue to schedule it for publication on this day.
          </p>
          <button
            type="button"
            onClick={() => onScheduleForDate(currentDate)}
            className="mt-4 rounded-xl border border-border bg-surface-2 px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-surface transition cursor-pointer"
          >
            Schedule Post
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {dayPosts.map((post) => {
            const isApproved = Boolean(post.approved_by_user);
            const isPosted = post.status === "posted";
            const isFailed = post.status === "failed";
            const isPublishing = post.status === "publishing";
            const timeFormatted = formatTimeOnly(post.scheduled_at, timezone);

            return (
              <div
                key={post.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border bg-surface-2/60 p-4 transition hover:border-primary/50 hover:shadow-sm"
              >
                {/* Left: Thumbnail & Details */}
                <div
                  onClick={() => onSelectPost(post)}
                  className="flex items-start gap-3.5 min-w-0 flex-1 cursor-pointer"
                >
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-black/10">
                    {post.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.image_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ImageSquare size={20} />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary border border-primary/20">
                        <Clock size={12} />
                        {timeFormatted} ({timezone})
                      </span>

                      {isApproved ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <ShieldCheck size={12} weight="fill" /> Approved
                        </span>
                      ) : !isPosted ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          <Clock size={12} weight="bold" /> Awaiting Approval
                        </span>
                      ) : null}

                      {isPosted && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle size={12} weight="fill" /> Published
                        </span>
                      )}

                      {isFailed && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive border border-destructive/20">
                          <WarningCircle size={12} weight="fill" /> Failed / Attention
                        </span>
                      )}
                    </div>

                    <h4 className="font-semibold text-sm text-foreground line-clamp-1">
                      {post.title}
                    </h4>

                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {post.description}
                    </p>

                    <p className="text-[11px] text-muted-foreground/80 font-medium">
                      Target: {post.page_name || "Connected Page"}
                    </p>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex flex-wrap items-center gap-2 shrink-0 sm:self-center">
                  {!isApproved && !isPosted && (
                    <button
                      type="button"
                      onClick={() => onApprove(post.id)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-600/10 px-2.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600/20 transition cursor-pointer"
                    >
                      <ShieldCheck size={14} weight="bold" />
                      <span>Approve</span>
                    </button>
                  )}

                  {!isPosted && (
                    <button
                      type="button"
                      onClick={() => onRequestPublish(post)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary/10 px-2.5 text-xs font-semibold text-primary hover:bg-primary/20 transition cursor-pointer"
                    >
                      <Rocket size={14} weight="bold" />
                      <span>Publish Now</span>
                    </button>
                  )}

                  {!isPosted && (
                    <button
                      type="button"
                      onClick={() => onRequestReschedule(post)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-surface px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-surface-2 transition cursor-pointer"
                    >
                      <CalendarCheck size={14} />
                      <span>Reschedule</span>
                    </button>
                  )}

                  {!isPosted && (
                    <button
                      type="button"
                      onClick={() => onRequestCancelSchedule(post)}
                      title="Cancel schedule and keep as draft"
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-surface px-2.5 text-xs font-semibold text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                    >
                      <X size={14} />
                      <span>Cancel</span>
                    </button>
                  )}

                  {isPosted && post.facebook_post_id && (
                    <a
                      href={facebookPostUrl(post.facebook_post_id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-surface px-2.5 text-xs font-semibold text-foreground hover:border-primary/50 transition"
                    >
                      <span>View on Facebook</span>
                      <ArrowSquareOut size={13} />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
