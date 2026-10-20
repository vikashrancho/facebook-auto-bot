"use client";

import { useState, useEffect } from "react";
import {
  CalendarCheck,
  Clock,
  X,
  Check,
  FlagBanner,
  ImageSquare,
  WarningCircle,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import { toTimezoneInputValue, toUtcIsoString, formatFullDateTime } from "@/lib/time";
import type { Post } from "@/lib/types";

interface SchedulePostModalProps {
  post: Post | null;
  availableDrafts?: Post[];
  isOpen: boolean;
  isBusy: boolean;
  timezone: string;
  defaultDate?: Date | null;
  onClose: () => void;
  onSaveSchedule: (
    postId: string,
    scheduledAt: string,
    scheduleNotes?: string
  ) => Promise<void>;
}

export function SchedulePostModal({
  post: initialPost,
  availableDrafts = [],
  isOpen,
  isBusy,
  timezone,
  defaultDate,
  onClose,
  onSaveSchedule,
}: SchedulePostModalProps) {
  const [selectedPostId, setSelectedPostId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [scheduleNotes, setScheduleNotes] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // Active post to be scheduled
  const activePost =
    initialPost || availableDrafts.find((p) => p.id === selectedPostId) || null;

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsConfirming(false);

      if (initialPost) {
        setSelectedPostId(initialPost.id);
        const { dateStr, timeStr } = toTimezoneInputValue(initialPost.scheduled_at, timezone);
        setSelectedDate(dateStr || (defaultDate ? defaultDate.toISOString().slice(0, 10) : ""));
        setSelectedTime(timeStr || "09:00");
        setScheduleNotes(initialPost.schedule_notes || "");
      } else {
        const firstDraft = availableDrafts[0];
        if (firstDraft) {
          setSelectedPostId(firstDraft.id);
          const { dateStr, timeStr } = toTimezoneInputValue(firstDraft.scheduled_at, timezone);
          setSelectedDate(dateStr || (defaultDate ? defaultDate.toISOString().slice(0, 10) : ""));
          setSelectedTime(timeStr || "09:00");
          setScheduleNotes(firstDraft.schedule_notes || "");
        } else {
          setSelectedPostId("");
          setSelectedDate(defaultDate ? defaultDate.toISOString().slice(0, 10) : "");
          setSelectedTime("09:00");
          setScheduleNotes("");
        }
      }
    }
  }, [isOpen, initialPost, availableDrafts, defaultDate, timezone]);

  if (!isOpen) return null;

  // Quick schedule presets
  function applyPreset(daysFromNow: number, targetHour: number, targetMinute = 0) {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    const pad = (n: number) => String(n).padStart(2, "0");
    setSelectedDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setSelectedTime(`${pad(targetHour)}:${pad(targetMinute)}`);
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!activePost) {
      setError("Please select an existing post draft to schedule.");
      return;
    }

    if (!selectedDate || !selectedTime) {
      setError("Please choose both a publication date and time.");
      return;
    }

    // Validate image presence
    if (!activePost.image_url || activePost.image_url.trim() === "") {
      setError(
        "This post does not have a valid image. An image is required before scheduling for Facebook publication."
      );
      return;
    }

    // Validate target page
    if (!activePost.page_id && !activePost.page_name) {
      setError(
        "This post has no target Facebook Page assigned. Please ensure your Facebook Page is configured in Settings."
      );
      return;
    }

    // Validate future timestamp
    try {
      const utcIso = toUtcIsoString(selectedDate, selectedTime, timezone);
      const targetTimeMs = new Date(utcIso).getTime();
      if (targetTimeMs <= Date.now()) {
        setError(
          `Cannot schedule a post for a past or invalid time. Please choose a future time in ${timezone}.`
        );
        return;
      }

      // Transition to confirmation view
      setIsConfirming(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid date or time entered.");
    }
  }

  async function handleCommitSchedule() {
    if (!activePost || !selectedDate || !selectedTime) return;
    setError(null);

    try {
      const utcIso = toUtcIsoString(selectedDate, selectedTime, timezone);
      await onSaveSchedule(activePost.id, utcIso, scheduleNotes.trim() || undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save post schedule.");
      setIsConfirming(false);
    }
  }

  const plannedUtcIso = (() => {
    try {
      if (selectedDate && selectedTime) {
        return toUtcIsoString(selectedDate, selectedTime, timezone);
      }
    } catch {}
    return null;
  })();

  const plannedFormatted = plannedUtcIso
    ? formatFullDateTime(plannedUtcIso, timezone)
    : `${selectedDate} at ${selectedTime} (${timezone})`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={isBusy ? undefined : onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-xl max-h-[92vh] flex flex-col rounded-2xl border border-border bg-surface shadow-2xl transition-all overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarCheck size={22} weight="bold" />
            </div>
            <div>
              <h3 className="font-heading text-lg font-bold text-foreground">
                {isConfirming ? "Confirm Publication Schedule" : "Schedule Facebook Post"}
              </h3>
              <p className="text-xs text-muted-foreground">
                Target Timezone: <span className="font-semibold text-foreground">{timezone} (IST)</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isBusy}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-surface-2 hover:text-foreground disabled:opacity-50 cursor-pointer"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <WarningCircle size={16} weight="fill" className="shrink-0 mt-0.5" />
              <p className="leading-relaxed">{error}</p>
            </div>
          )}

          {/* Draft Post Selector (when initialPost was not preselected) */}
          {!initialPost && availableDrafts.length > 0 && !isConfirming && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Select Existing Queue Draft
              </label>
              <select
                value={selectedPostId}
                onChange={(e) => setSelectedPostId(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-xs font-medium text-foreground outline-none transition focus:border-primary cursor-pointer"
              >
                {availableDrafts.map((d) => (
                  <option key={d.id} value={d.id} className="bg-surface text-foreground">
                    {d.title} (Status: {d.status})
                  </option>
                ))}
              </select>
            </div>
          )}

          {!activePost ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              No draft posts available in queue. Create a post first in Generate or Queue.
            </div>
          ) : isConfirming ? (
            /* Confirmation Screen */
            <div className="space-y-4">
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Review Planned Schedule
                </span>
                <p className="text-sm font-bold text-foreground">
                  {plannedFormatted}
                </p>
                <p className="text-xs text-muted-foreground">
                  Target Page: <span className="font-semibold text-foreground">{activePost.page_name || "Default Page"}</span>
                </p>
              </div>

              {/* Approval Notice */}
              {!activePost.approved_by_user ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
                  <Clock size={16} weight="bold" className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Human Approval Separation:</span>
                    <p className="mt-0.5 opacity-90 leading-relaxed">
                      This post is currently <strong>awaiting approval</strong>. It will be placed on the calendar at this scheduled time, but the server scheduler will <strong>never publish</strong> it until you review and approve the post.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400 flex items-start gap-2">
                  <ShieldCheck size={16} weight="fill" className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Approved Post:</span>
                    <p className="mt-0.5 opacity-90 leading-relaxed">
                      This post is approved. When its scheduled time arrives, the background server scheduler will automatically publish it to Facebook.
                    </p>
                  </div>
                </div>
              )}

              {/* Summary Post Preview Card */}
              <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-3 text-xs">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-black/10">
                  {activePost.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activePost.image_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ImageSquare size={16} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-foreground line-clamp-1">{activePost.title}</h4>
                  <p className="text-muted-foreground line-clamp-2 mt-0.5">{activePost.description}</p>
                </div>
              </div>
            </div>
          ) : (
            /* Editing Form Screen */
            <form id="schedule-form" onSubmit={handleFormSubmit} className="space-y-4">
              {/* Post Preview Card */}
              <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-3 text-xs">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-black/10">
                  {activePost.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activePost.image_url}
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
                  <h4 className="font-bold text-foreground line-clamp-1">{activePost.title}</h4>
                  <p className="text-muted-foreground line-clamp-2">{activePost.description}</p>
                  <p className="text-[11px] text-primary font-medium flex items-center gap-1">
                    <FlagBanner size={12} />
                    {activePost.page_name || "Connected Page"}
                  </p>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Quick Presets
                </label>
                <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => applyPreset(1, 9)}
                    className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/50 hover:text-primary cursor-pointer"
                  >
                    Tomorrow 9 AM
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(1, 13)}
                    className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/50 hover:text-primary cursor-pointer"
                  >
                    Tomorrow 1 PM
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(1, 18)}
                    className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/50 hover:text-primary cursor-pointer"
                  >
                    Tomorrow 6 PM
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(2, 9)}
                    className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/50 hover:text-primary cursor-pointer"
                  >
                    In 2 days 9 AM
                  </button>
                </div>
              </div>

              {/* Date & Time Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sched-date" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Publication Date
                  </label>
                  <input
                    id="sched-date"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-xs font-medium text-foreground outline-none transition focus:border-primary cursor-pointer"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="sched-time" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Publication Time ({timezone})
                  </label>
                  <input
                    id="sched-time"
                    type="time"
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-xs font-medium text-foreground outline-none transition focus:border-primary cursor-pointer"
                    required
                  />
                </div>
              </div>

              {/* Optional Notes */}
              <div>
                <label htmlFor="sched-notes" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Scheduling Notes (Optional)
                </label>
                <input
                  id="sched-notes"
                  type="text"
                  value={scheduleNotes}
                  onChange={(e) => setScheduleNotes(e.target.value)}
                  placeholder="e.g. Morning market open post, Weekend financial tips"
                  maxLength={500}
                  className="mt-1.5 h-9 w-full rounded-xl border border-border bg-surface-2 px-3 text-xs text-foreground outline-none transition focus:border-primary placeholder:text-muted-foreground"
                />
              </div>

              {/* Unapproved Note */}
              {!activePost.approved_by_user && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-600 dark:text-amber-400">
                  <strong>Notice:</strong> This post is unapproved. It can be scheduled, but will NOT be published automatically until approved by human administrator.
                </div>
              )}
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border bg-surface-2/40 p-4 sm:px-6">
          <button
            type="button"
            onClick={isConfirming ? () => setIsConfirming(false) : onClose}
            disabled={isBusy}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-surface-2 hover:text-foreground transition disabled:opacity-50 cursor-pointer"
          >
            {isConfirming ? "Back to Edit" : "Cancel"}
          </button>

          {isConfirming ? (
            <button
              type="button"
              onClick={handleCommitSchedule}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              <Check size={16} weight="bold" />
              <span>{isBusy ? "Saving Schedule…" : "Confirm & Save Schedule"}</span>
            </button>
          ) : (
            <button
              type="submit"
              form="schedule-form"
              disabled={isBusy || !activePost}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              <span>Continue to Confirmation</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
