"use client";

import {
  Clock,
  ShieldCheck,
  CheckCircle,
  WarningCircle,
  CalendarCheck,
  Rocket,
  X,
  ImageSquare,
  ArrowSquareOut,
} from "@phosphor-icons/react/dist/ssr";
import { formatFullDateTime, getDateKeyInTimezone } from "@/lib/time";
import { facebookPostUrl } from "@/lib/types";
import type { Post } from "@/lib/types";

interface AgendaViewProps {
  posts: Post[];
  timezone: string;
  onSelectPost: (post: Post) => void;
  onApprove: (id: string) => void;
  onRequestPublish: (post: Post) => void;
  onRequestReschedule: (post: Post) => void;
  onRequestCancelSchedule: (post: Post) => void;
}

export function AgendaView({
  posts,
  timezone,
  onSelectPost,
  onApprove,
  onRequestPublish,
  onRequestReschedule,
  onRequestCancelSchedule,
}: AgendaViewProps) {
  // Sort posts chronologically: oldest upcoming first, then past
  const sorted = [...posts].sort((a, b) => {
    const timeA = a.scheduled_at ? new Date(a.scheduled_at).getTime() : new Date(a.created_at).getTime();
    const timeB = b.scheduled_at ? new Date(b.scheduled_at).getTime() : new Date(b.created_at).getTime();
    return timeA - timeB;
  });

  const todayKey = getDateKeyInTimezone(new Date(), timezone);
  const tomorrowKey = getDateKeyInTimezone(new Date(Date.now() + 86400000), timezone);

  // Group into categories
  const groups: { label: string; items: Post[] }[] = [];
  const todayItems: Post[] = [];
  const tomorrowItems: Post[] = [];
  const upcomingItems: Post[] = [];
  const pastItems: Post[] = [];
  const unscheduledDrafts: Post[] = [];

  for (const p of sorted) {
    if (!p.scheduled_at) {
      unscheduledDrafts.push(p);
      continue;
    }
    const key = getDateKeyInTimezone(p.scheduled_at, timezone);
    const postTime = new Date(p.scheduled_at).getTime();
    if (key === todayKey) {
      todayItems.push(p);
    } else if (key === tomorrowKey) {
      tomorrowItems.push(p);
    } else if (postTime > Date.now()) {
      upcomingItems.push(p);
    } else {
      pastItems.push(p);
    }
  }

  if (todayItems.length > 0) groups.push({ label: "Today", items: todayItems });
  if (tomorrowItems.length > 0) groups.push({ label: "Tomorrow", items: tomorrowItems });
  if (upcomingItems.length > 0) groups.push({ label: "Upcoming Schedule", items: upcomingItems });
  if (unscheduledDrafts.length > 0) groups.push({ label: "Unscheduled Drafts", items: unscheduledDrafts });
  if (pastItems.length > 0) groups.push({ label: "Past Scheduled / Published", items: pastItems });

  if (groups.length === 0) {
    return (
      <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface p-6 text-center text-muted-foreground shadow-sm">
        <Clock size={36} className="text-muted-foreground/50 mb-2" />
        <h4 className="font-semibold text-base text-foreground">No posts found in calendar</h4>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          No scheduled posts match your active filters. Try adjusting your search query or reset filters.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.label} className="space-y-2.5">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </h3>
            <span className="flex h-5 items-center justify-center rounded-full bg-surface-2 px-2 text-[10px] font-bold text-foreground">
              {group.items.length}
            </span>
          </div>

          <div className="space-y-2">
            {group.items.map((post) => {
              const isApproved = Boolean(post.approved_by_user);
              const isPosted = post.status === "posted";
              const isFailed = post.status === "failed";
              const isPublishing = post.status === "publishing";
              const scheduledFormatted = post.scheduled_at
                ? formatFullDateTime(post.scheduled_at, timezone)
                : "Unscheduled Draft";

              return (
                <div
                  key={post.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-xl border border-border bg-surface p-3.5 transition hover:border-primary/40 hover:shadow-sm"
                >
                  {/* Left: Thumbnail & Content */}
                  <div
                    onClick={() => onSelectPost(post)}
                    className="flex items-start gap-3 min-w-0 flex-1 cursor-pointer"
                  >
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-black/10">
                      {post.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={post.image_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImageSquare size={18} />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                          <Clock size={12} />
                          {scheduledFormatted}
                        </span>

                        {isApproved ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <ShieldCheck size={11} weight="fill" /> Approved
                          </span>
                        ) : !isPosted ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            <Clock size={11} weight="bold" /> Awaiting Approval
                          </span>
                        ) : null}

                        {isPosted && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle size={11} weight="fill" /> Published
                          </span>
                        )}

                        {isFailed && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive border border-destructive/20">
                            <WarningCircle size={11} weight="fill" /> Failed / Attention
                          </span>
                        )}
                      </div>

                      <h4 className="font-semibold text-xs text-foreground line-clamp-1">
                        {post.title}
                      </h4>

                      <p className="text-[11px] text-muted-foreground line-clamp-1">
                        {post.description}
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
                        <ShieldCheck size={13} weight="bold" />
                        <span>Approve</span>
                      </button>
                    )}

                    {!isPosted && (
                      <button
                        type="button"
                        onClick={() => onRequestPublish(post)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary/10 px-2.5 text-xs font-semibold text-primary hover:bg-primary/20 transition cursor-pointer"
                      >
                        <Rocket size={13} weight="bold" />
                        <span>Publish</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onRequestReschedule(post)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-surface transition cursor-pointer"
                    >
                      <CalendarCheck size={13} />
                      <span>{post.scheduled_at ? "Reschedule" : "Schedule"}</span>
                    </button>

                    {post.scheduled_at && !isPosted && (
                      <button
                        type="button"
                        onClick={() => onRequestCancelSchedule(post)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 text-xs font-semibold text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                      >
                        <X size={13} />
                        <span>Cancel</span>
                      </button>
                    )}

                    {isPosted && post.facebook_post_id && (
                      <a
                        href={facebookPostUrl(post.facebook_post_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 text-xs font-semibold text-foreground hover:border-primary/50 transition"
                      >
                        <span>View</span>
                        <ArrowSquareOut size={12} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
