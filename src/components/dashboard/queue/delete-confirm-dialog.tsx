"use client";

import { Trash, WarningCircle, X } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import type { Post } from "@/lib/types";

interface DeleteConfirmDialogProps {
  post: Post | null;
  isOpen: boolean;
  isBusy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({
  post,
  isOpen,
  isBusy,
  onClose,
  onConfirm,
}: DeleteConfirmDialogProps) {
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
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <Trash size={24} weight="bold" />
          </div>
          <div>
            <h3 className="font-heading text-lg font-bold text-foreground">
              Delete Post Draft?
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Are you sure you want to permanently delete this post from your queue?
            </p>
          </div>
        </div>

        {/* Post Preview Box */}
        <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3 text-sm text-foreground">
          <p className="font-medium line-clamp-2">{post.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Status: <span className="capitalize">{post.status}</span>
          </p>
        </div>

        {/* Warning Note */}
        <div className="mt-3 flex items-start gap-2 text-xs text-destructive">
          <WarningCircle size={16} weight="fill" className="shrink-0 mt-0.5" />
          <span>This action cannot be undone.</span>
        </div>

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
            variant="danger"
            size="sm"
            onClick={onConfirm}
            disabled={isBusy}
            className="gap-2"
          >
            <Trash size={16} />
            {isBusy ? "Deleting…" : "Delete Post"}
          </Button>
        </div>
      </div>
    </div>
  );
}
