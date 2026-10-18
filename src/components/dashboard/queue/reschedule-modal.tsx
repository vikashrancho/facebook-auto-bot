"use client";

import { useState, useEffect } from "react";
import { CalendarCheck, Clock, X, Check } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import type { Post } from "@/lib/types";

interface RescheduleModalProps {
  post: Post | null;
  isOpen: boolean;
  isBusy: boolean;
  onClose: () => void;
  onSave: (scheduledAt: string | null) => Promise<void>;
}

function toLocalInputValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RescheduleModal({
  post,
  isOpen,
  isBusy,
  onClose,
  onSave,
}: RescheduleModalProps) {
  const [scheduledTime, setScheduledTime] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (post) {
      setScheduledTime(toLocalInputValue(post.scheduled_at));
      setError(null);
    }
  }, [post]);

  if (!isOpen || !post) return null;

  function applyPreset(hoursFromNow: number, targetHour?: number) {
    const d = new Date();
    d.setHours(d.getHours() + hoursFromNow);
    if (targetHour !== undefined) {
      d.setHours(targetHour, 0, 0, 0);
    }
    setScheduledTime(toLocalInputValue(d.toISOString()));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const iso = scheduledTime ? new Date(scheduledTime).toISOString() : null;
      await onSave(iso);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reschedule post.");
    }
  }

  async function handleClearSchedule() {
    setError(null);
    try {
      await onSave(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear schedule.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={isBusy ? undefined : onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl transition-all">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isBusy}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground transition hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
          aria-label="Close dialog"
        >
          <X size={18} />
        </button>

        {/* Header with Icon */}
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CalendarCheck size={24} weight="bold" />
          </div>
          <div>
            <h3 className="font-heading text-lg font-bold text-foreground">
              Schedule or Postpone Publication
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Set the exact date and time this post should automatically publish.
            </p>
          </div>
        </div>

        {/* Post title preview */}
        <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground line-clamp-1">{post.title}</span>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Quick Preset Buttons */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Quick Schedule Presets
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => applyPreset(1)}
                className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
              >
                In 1 hour
              </button>
              <button
                type="button"
                onClick={() => applyPreset(24, 9)}
                className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
              >
                Tomorrow 9 AM
              </button>
              <button
                type="button"
                onClick={() => applyPreset(24, 18)}
                className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
              >
                Tomorrow 6 PM
              </button>
              <button
                type="button"
                onClick={() => applyPreset(48, 9)}
                className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
              >
                In 2 days
              </button>
            </div>
          </div>

          {/* Date Picker Input */}
          <div>
            <label htmlFor="schedule-datetime" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Select Date & Time
            </label>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
              <Clock size={18} className="text-muted-foreground" />
              <input
                id="schedule-datetime"
                type="datetime-local"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full bg-transparent text-sm text-foreground outline-none"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Leave blank to keep or revert post to an unscheduled Draft.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            {post.scheduled_at ? (
              <button
                type="button"
                onClick={handleClearSchedule}
                disabled={isBusy}
                className="text-xs font-medium text-muted-foreground hover:text-destructive transition disabled:opacity-50"
              >
                Remove Schedule (Keep Draft)
              </button>
            ) : <div />}

            <div className="flex items-center gap-2 sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onClose}
                disabled={isBusy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isBusy}
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary-hover"
              >
                <Check size={16} weight="bold" />
                {isBusy ? "Saving…" : "Save Schedule"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
