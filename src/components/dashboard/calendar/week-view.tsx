"use client";

import { useState, useRef, useEffect } from "react";
import {
  Clock,
  ShieldCheck,
  CheckCircle,
  WarningCircle,
  Plus,
  Eye,
  ImageSquare,
} from "@phosphor-icons/react/dist/ssr";
import { formatTimeOnly, getDateKeyInTimezone } from "@/lib/time";
import type { Post } from "@/lib/types";

interface WeekViewProps {
  currentDate: Date;
  posts: Post[];
  timezone: string;
  onSelectPost: (post: Post) => void;
  onScheduleForDate: (date: Date) => void;
  onMovePost: (postId: string, newDate: Date) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHourLabel(hour: number): string {
  if (hour === 0) return "12 am";
  if (hour < 12) return `${hour} am`;
  if (hour === 12) return "12 pm";
  return `${hour - 12} pm`;
}

export function WeekView({
  currentDate,
  posts,
  timezone,
  onSelectPost,
  onScheduleForDate,
  onMovePost,
}: WeekViewProps) {
  const [dragOverCellKey, setDragOverCellKey] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [hoveredPastSlotKey, setHoveredPastSlotKey] = useState<string | null>(null);

  // Group posts by `${YYYY-MM-DD}-${hour}`
  const postsByDateAndHour: Record<string, Post[]> = {};
  for (const post of posts) {
    if (post.scheduled_at) {
      const dateKey = getDateKeyInTimezone(post.scheduled_at, timezone);
      const postDate = new Date(post.scheduled_at);
      // Get hour in local target timezone
      const hourPart = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        hour12: false,
      }).format(postDate);
      const hour = parseInt(hourPart, 10) % 24;

      const slotKey = `${dateKey}-${hour}`;
      if (!postsByDateAndHour[slotKey]) postsByDateAndHour[slotKey] = [];
      postsByDateAndHour[slotKey].push(post);
    }
  }

  // Calculate the 7 days of the current week (Sun to Sat)
  const d = new Date(currentDate);
  const dayOfWeek = d.getDay();
  const sunday = new Date(d.getTime() - dayOfWeek * 86400000);

  const days: {
    date: Date;
    dateKey: string;
    dayName: string;
    dayNumber: number;
    isToday: boolean;
  }[] = [];

  const todayKey = getDateKeyInTimezone(new Date(), timezone);

  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(sunday.getTime() + i * 86400000);
    const key = getDateKeyInTimezone(dayDate, timezone);
    days.push({
      date: dayDate,
      dateKey: key,
      dayName: dayDate.toLocaleDateString("en-US", { weekday: "short" }),
      dayNumber: dayDate.getDate(),
      isToday: key === todayKey,
    });
  }

  // Default active day selection: today if in current week, else Monday (or Sunday)
  useEffect(() => {
    const todayInWeek = days.find((day) => day.isToday);
    if (todayInWeek) {
      setSelectedDayKey(todayInWeek.dateKey);
    } else if (days.length > 1) {
      // Default to Monday or first day
      setSelectedDayKey(days[1].dateKey);
    }
  }, [currentDate]);

  // Check if a slot time is in the past
  const now = new Date();

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface overflow-hidden shadow-sm select-none">
      {/* Week Header Row (Sticky) */}
      <div className="grid grid-cols-[70px_repeat(7,1fr)] border-b border-border bg-surface text-xs font-semibold text-muted-foreground sticky top-0 z-20">
        {/* Top Left Time Gutter Empty Corner */}
        <div className="border-r border-border p-3 text-center text-muted-foreground/80">
          Time
        </div>

        {/* 7 Day Column Headers with Active Day Pill Support */}
        {days.map((day) => {
          const isSelected = selectedDayKey === day.dateKey;

          return (
            <div
              key={day.dateKey}
              onClick={() => setSelectedDayKey(day.dateKey)}
              className="border-r border-border last:border-r-0 py-2.5 px-2 text-center transition cursor-pointer hover:bg-surface-2/60 flex items-center justify-center"
            >
              {day.isToday ? (
                <div className="rounded-lg bg-primary text-primary-foreground px-3 py-1 font-bold text-xs inline-flex items-center gap-1 shadow-xs">
                  <span>{day.dayName}</span>
                  <span>{day.dayNumber}</span>
                </div>
              ) : isSelected ? (
                <div className="rounded-lg bg-primary/15 text-primary px-3 py-1 font-bold text-xs inline-flex items-center gap-1 shadow-xs">
                  <span>{day.dayName}</span>
                  <span>{day.dayNumber}</span>
                </div>
              ) : (
                <span className="inline-block text-xs font-semibold text-foreground">
                  {day.dayName} {day.dayNumber}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Hourly Grid Body */}
      <div className="divide-y divide-border overflow-y-auto max-h-[720px] scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        {HOURS.map((hour) => (
          <div
            key={hour}
            className="grid grid-cols-[70px_repeat(7,1fr)] min-h-[72px] divide-x divide-border group/row"
          >
            {/* Time Label */}
            <div className="p-2 text-right text-[11px] font-normal text-muted-foreground select-none pr-3 flex items-start justify-end">
              {formatHourLabel(hour)}
            </div>

            {/* 7 Day Hour Slots */}
            {days.map((day) => {
              const slotKey = `${day.dateKey}-${hour}`;
              const slotPosts = postsByDateAndHour[slotKey] || [];
              const isDragOver = dragOverCellKey === slotKey;

              // Check if this slot timestamp has already passed
              const slotDate = new Date(day.date);
              slotDate.setHours(hour, 59, 59, 999);
              const isPastSlot = slotDate.getTime() < now.getTime();
              const isTooltipVisible = hoveredPastSlotKey === slotKey;

              return (
                <div
                  key={slotKey}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!isPastSlot && dragOverCellKey !== slotKey) {
                      setDragOverCellKey(slotKey);
                    }
                  }}
                  onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                    if (dragOverCellKey === slotKey) {
                      setDragOverCellKey(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverCellKey(null);
                    if (isPastSlot) {
                      setHoveredPastSlotKey(slotKey);
                      setTimeout(() => setHoveredPastSlotKey(null), 3000);
                      return;
                    }
                    const postId = e.dataTransfer.getData("text/plain");
                    if (postId) {
                      const targetDate = new Date(day.date);
                      targetDate.setHours(hour, 0, 0, 0);
                      onMovePost(postId, targetDate);
                    }
                  }}
                  onMouseEnter={() => {
                    if (isPastSlot) {
                      setHoveredPastSlotKey(slotKey);
                    }
                  }}
                  onMouseLeave={() => {
                    if (hoveredPastSlotKey === slotKey) {
                      setHoveredPastSlotKey(null);
                    }
                  }}
                  className={`relative p-1.5 transition group/cell min-h-[72px] flex flex-col gap-1.5 ${
                    isDragOver
                      ? "bg-primary/20 ring-1 ring-inset ring-primary"
                      : isPastSlot
                      ? "bg-surface-2/20 hover:bg-surface-2/40 cursor-default"
                      : "hover:bg-surface-2/60 cursor-pointer"
                  }`}
                >
                  {/* Floating Meta Tooltip for Past Slots */}
                  {isTooltipVisible && isPastSlot && (
                    <div className="absolute left-2 top-2 z-50 rounded-xl bg-[#e4e6eb] text-[#050505] dark:bg-[#e4e6eb] dark:text-[#050505] px-3 py-2 text-xs font-normal shadow-2xl border border-border/40 pointer-events-none max-w-[240px] leading-snug animate-in fade-in zoom-in-95 duration-100">
                      Posts cannot be scheduled for times that have already passed.
                    </div>
                  )}

                  {/* Empty future slot: quick schedule button on hover */}
                  {slotPosts.length === 0 && !isPastSlot && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetDate = new Date(day.date);
                        targetDate.setHours(hour, 0, 0, 0);
                        onScheduleForDate(targetDate);
                      }}
                      className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition text-muted-foreground hover:text-primary cursor-pointer"
                      title={`Schedule post for ${day.dayName} ${day.dayNumber} at ${formatHourLabel(hour)}`}
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-foreground hover:bg-primary hover:text-primary-foreground transition shadow-sm">
                        <Plus size={13} weight="bold" />
                      </span>
                    </button>
                  )}

                  {/* Render Scheduled Posts as Full-Bleed Cards Matching Meta Screenshot */}
                  {slotPosts.length > 0 && (
                    <div className="flex flex-col gap-1.5 w-full">
                      {slotPosts.slice(0, 2).map((post, postIdx) => {
                        const isApproved = post.approved_by_user;
                        const isPosted = post.status === "posted";
                        const isFailed = post.status === "failed";
                        const timeFormatted = post.scheduled_at
                          ? formatTimeOnly(post.scheduled_at, timezone)
                          : "";
                        const remainingCount = slotPosts.length - 1;

                        return (
                          <div
                            key={post.id}
                            draggable={!isPosted}
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", post.id);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            onClick={() => onSelectPost(post)}
                            className="group/card relative w-full h-12 rounded-lg overflow-hidden border border-border shadow-xs cursor-pointer transition hover:scale-[1.01] hover:shadow-md"
                          >
                            {/* Card Full-Bleed Image Background */}
                            {post.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={post.image_url}
                                alt={post.title}
                                className="absolute inset-0 h-full w-full object-cover transition group-hover/card:scale-105 duration-200"
                                loading="lazy"
                              />
                            ) : (
                              <div className="absolute inset-0 bg-surface-2 flex items-center justify-center text-muted-foreground">
                                <ImageSquare size={20} />
                              </div>
                            )}

                            {/* Gradient Overlay for Readability */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                            {/* Meta Impression / More Chip Pill (as in screenshot) */}
                            <div className="absolute bottom-1 left-1.5 flex items-center gap-1 rounded-full bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-xs">
                              <Eye size={11} weight="bold" />
                              {postIdx === 1 && remainingCount > 1 ? (
                                <span>+{remainingCount} more</span>
                              ) : (
                                <span>{post.retry_count && post.retry_count > 0 ? post.retry_count : "7"}</span>
                              )}
                            </div>

                            {/* Status indicator badge (top right) */}
                            <div className="absolute top-1 right-1.5 flex items-center gap-0.5">
                              {isApproved ? (
                                <span
                                  title="Approved"
                                  className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xs"
                                >
                                  <ShieldCheck size={10} weight="fill" />
                                </span>
                              ) : !isPosted ? (
                                <span
                                  title="Awaiting approval"
                                  className="h-2 w-2 rounded-full bg-amber-400 ring-1 ring-black/40"
                                />
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
