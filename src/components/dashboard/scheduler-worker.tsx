"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, X } from "@phosphor-icons/react/dist/ssr";

export function SchedulerWorker() {
  const [notification, setNotification] = useState<{ message: string } | null>(null);
  const isRunningRef = useRef(false);

  async function checkDueScheduledPosts() {
    if (isRunningRef.current) return;
    isRunningRef.current = true;

    try {
      const res = await fetch("/api/cron/process-queue", {
        method: "POST",
      });

      if (res.ok) {
        const data = await res.json();
        if (data.processedFromQueue && data.processedFromQueue > 0) {
          const count = data.processedFromQueue;
          setNotification({
            message: `Background scheduler successfully published ${count} scheduled post${
              count > 1 ? "s" : ""
            } to Facebook.`,
          });

          // Notify open Calendar and Queue views to refresh
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("pab:posts-updated", { detail: data }));
          }
        }
      }
    } catch {
      // Ignore background network / offline hiccups
    } finally {
      isRunningRef.current = false;
    }
  }

  useEffect(() => {
    // Initial check when dashboard mounts
    const initialTimer = setTimeout(() => {
      checkDueScheduledPosts();
    }, 2000);

    // Periodic check every 60 seconds while dashboard is open
    const interval = setInterval(() => {
      checkDueScheduledPosts();
    }, 60000);

    // Immediate check when returning to this browser tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkDueScheduledPosts();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    };
  }, []);

  // Auto-dismiss notification after 8 seconds
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 8000);
    return () => clearTimeout(timer);
  }, [notification]);

  if (!notification) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex max-w-md items-center gap-3 rounded-2xl border border-emerald-500/30 bg-surface/95 px-4 py-3 text-xs font-medium text-foreground shadow-2xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-2">
      <CheckCircle size={20} weight="fill" className="shrink-0 text-emerald-500" />
      <span className="flex-1 leading-relaxed">{notification.message}</span>
      <button
        onClick={() => setNotification(null)}
        className="rounded-lg p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground cursor-pointer"
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}
