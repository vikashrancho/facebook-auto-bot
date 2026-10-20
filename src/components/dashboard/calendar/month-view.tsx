"use client";

import { useState } from "react";
import {
  Clock,
  ShieldCheck,
  CheckCircle,
  WarningCircle,
  Plus,
  ImageSquare,
} from "@phosphor-icons/react/dist/ssr";
import { formatTimeOnly, getDateKeyInTimezone } from "@/lib/time";
import type { Post } from "@/lib/types";

interface MonthViewProps {
  currentDate: Date;
  posts: Post[];
  timezone: string;
  onSelectPost: (post: Post) => void;
  onScheduleForDate: (date: Date) => void;
  onMovePost: (postId: string, newDate: Date) => void;
}

export function MonthView({
  currentDate,
  posts,
  timezone,
  onSelectPost,
  onScheduleForDate,
  onMovePost,
}: MonthViewProps) {
  const [dragOverDateKey, setDragOverDateKey] = useState<string | null>(null);

  // Group posts by YYYY-MM-DD date key in target timezone
  const postsByDate: Record<string, Post[]> = {};
  for (const post of posts) {
    if (post.scheduled_at) {
      const key = getDateKeyInTimezone(post.scheduled_at, timezone);
      if (!postsByDate[key]) postsByDate[key] = [];
      postsByDate[key].push(post);
    }
  }

  // Calculate calendar grid days
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // First day of current month
  const firstDayOfMonth = new Date(year, month, 1);
  const startDayOfWeek = firstDayOfMonth.getDay(); // 0 is Sunday

  // Last day of current month
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInCurrentMonth = lastDayOfMonth.getDate();

  // Days from previous month to fill the first row
  const prevMonthLastDay = new Date(year, month, 0).getDate();

  const cells: {
    date: Date;
    isCurrentMonth: boolean;
    dateKey: string;
    isToday: boolean;
  }[] = [];

  const todayKey = getDateKeyInTimezone(new Date(), timezone);

  // Previous month trailing days
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthLastDay - i);
    const key = getDateKeyInTimezone(d, timezone);
    cells.push({
      date: d,
      isCurrentMonth: false,
      dateKey: key,
      isToday: key === todayKey,
    });
  }

  // Current month days
  for (let day = 1; day <= daysInCurrentMonth; day++) {
    const d = new Date(year, month, day);
    const key = getDateKeyInTimezone(d, timezone);
    cells.push({
      date: d,
      isCurrentMonth: true,
      dateKey: key,
      isToday: key === todayKey,
    });
  }

  // Next month leading days to complete the 35 or 42 grid
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let day = 1; day <= remaining; day++) {
    const d = new Date(year, month + 1, day);
    const key = getDateKeyInTimezone(d, timezone);
    cells.push({
      date: d,
      isCurrentMonth: false,
      dateKey: key,
      isToday: key === todayKey,
    });
  }

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface overflow-hidden shadow-sm">
      {/* Weekday Header */}
      <div className="grid grid-cols-7 border-b border-border bg-surface-2/60 text-center text-xs font-semibold text-muted-foreground py-2.5">
        {weekDays.map((w, idx) => (
          <div key={w} className={idx === 0 || idx === 6 ? "opacity-75" : ""}>
            {w}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-border bg-border/20">
        {cells.map((cell) => {
          const dayPosts = postsByDate[cell.dateKey] || [];
          const isDragTarget = dragOverDateKey === cell.dateKey;

          return (
            <div
              key={cell.dateKey}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverDateKey !== cell.dateKey) {
                  setDragOverDateKey(cell.dateKey);
                }
              }}
              onDragLeave={(e) => {
                // If leaving the cell container, clear drag target
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                if (dragOverDateKey === cell.dateKey) {
                  setDragOverDateKey(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverDateKey(null);
                const postId = e.dataTransfer.getData("text/plain");
                if (postId) {
                  onMovePost(postId, cell.date);
                }
              }}
              className={`group relative flex flex-col min-h-[120px] sm:min-h-[140px] p-2 transition-colors ${
                cell.isCurrentMonth ? "bg-surface" : "bg-surface-2/40 text-muted-foreground/50"
              } ${isDragTarget ? "ring-2 ring-primary ring-inset bg-primary/10" : ""}`}
            >
              {/* Day Header Row */}
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    cell.isToday
                      ? "bg-primary font-bold text-primary-foreground shadow-sm"
                      : cell.isCurrentMonth
                      ? "text-foreground"
                      : "text-muted-foreground/50"
                  }`}
                >
                  {cell.date.getDate()}
                </span>

                {/* Quick Add Button on Hover */}
                <button
                  type="button"
                  onClick={() => onScheduleForDate(cell.date)}
                  title={`Schedule post for ${cell.dateKey}`}
                  className="opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-2 hover:text-foreground transition cursor-pointer"
                >
                  <Plus size={14} weight="bold" />
                </button>
              </div>

              {/* Event Cards Inside Day Cell */}
              <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[110px] sm:max-h-[130px] pr-0.5">
                {dayPosts.map((post) => {
                  const isApproved = Boolean(post.approved_by_user);
                  const isPosted = post.status === "posted";
                  const isFailed = post.status === "failed";
                  const isPublishing = post.status === "publishing";
                  const timeFormatted = formatTimeOnly(post.scheduled_at, timezone);

                  return (
                    <div
                      key={post.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", post.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={() => onSelectPost(post)}
                      className={`group/card relative flex items-center gap-2 rounded-lg border p-1.5 text-left text-xs transition cursor-grab active:cursor-grabbing hover:shadow-sm ${
                        isPosted
                          ? "border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40 text-emerald-950 dark:text-emerald-200"
                          : isFailed
                          ? "border-destructive/30 bg-destructive/5 hover:border-destructive/50 text-destructive"
                          : isPublishing
                          ? "border-blue-500/30 bg-blue-500/5 hover:border-blue-500/50 text-blue-500 animate-pulse"
                          : "border-border bg-surface-2 hover:border-primary/50 text-foreground"
                      }`}
                    >
                      {/* Thumbnail Preview */}
                      <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded bg-black/10">
                        {post.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={post.image_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <ImageSquare size={14} />
                          </div>
                        )}
                      </div>

                      {/* Info snippet */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock size={11} className="shrink-0" />
                          <span className="font-semibold">{timeFormatted}</span>
                          {isApproved ? (
                            <span title="Approved by user" className="inline-flex items-center">
                              <ShieldCheck
                                size={12}
                                weight="fill"
                                className="text-emerald-500 shrink-0"
                              />
                            </span>
                          ) : !isPosted ? (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"
                              title="Awaiting approval"
                            />
                          ) : null}
                        </div>
                        <div className="truncate font-medium text-[11px] leading-tight">
                          {post.title}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
