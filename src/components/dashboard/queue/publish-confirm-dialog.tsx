"use client";

import { Rocket, WarningCircle, X } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import type { Post } from "@/lib/types";

interface PublishConfirmDialogProps {
  post: Post | null;
  isOpen: boolean;
  isBusy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function PublishConfirmDialog({
  post,
  isOpen,
  isBusy,
  onClose,
  onConfirm,
}: PublishConfirmDialogProps) {
  if (!isOpen || !post) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={isBusy ? undefined : onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl transition-all">
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
            <Rocket size={24} weight="fill" />
          </div>
          <div>
            <h3 className="font-heading text-lg font-bold text-foreground">
              Publish to Facebook Now?
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              This will immediately publish this post to your live Facebook audience.
            </p>
          </div>
        </div>

        {/* Post Summary Card */}
        <div className="mt-5 overflow-hidden rounded-xl border border-border bg-surface-2 p-3.5">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.image_url}
              alt=""
              className="h-16 w-16 shrink-0 rounded-lg object-cover"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-semibold text-foreground">
                {post.title}
              </p>
              <div className="mt-1 text-xs text-muted-foreground">
                <span>Target Page: </span>
                {post.page_id ? (
                  <span className="font-medium text-foreground">
                    {post.page_name || "Unknown"} <span className="font-mono text-[11px] text-muted-foreground">(ID: {post.page_id})</span>
                  </span>
                ) : (
                  <span className="font-semibold text-destructive">
                    None (Unassigned)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Warning Note */}
        {!post.page_id ? (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <WarningCircle size={18} weight="fill" className="shrink-0" />
            <span>
              <strong>Publishing Blocked:</strong> No destination Facebook Page is assigned to this post. You must select a destination Page in Post Details before publishing.
            </span>
          </div>
        ) : (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
            <WarningCircle size={18} weight="fill" className="shrink-0" />
            <span>
              Immediate publication sends live data to the Meta Graph API for <strong>{post.page_name || post.page_id}</strong>. Published posts cannot be automatically unposted.
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-end gap-3">
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
            type="button"
            size="sm"
            onClick={onConfirm}
            disabled={isBusy || !post.page_id}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          >
            <Rocket size={16} weight="fill" className={isBusy ? "animate-spin" : ""} />
            {isBusy ? "Publishing to Facebook…" : "Confirm & Publish Now"}
          </Button>
        </div>
      </div>
    </div>
  );
}
