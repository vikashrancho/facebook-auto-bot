"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowClockwise,
  Star,
  FlagBanner,
  CheckCircle,
  WarningCircle,
  Copy,
  Check,
  ShieldCheck,
  Power,
  Info,
  Plus,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { PageCache } from "@/lib/types";

export default function PagesPage() {
  const [pages, setPages] = useState<PageCache[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notConnected, setNotConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyPageId, setBusyPageId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addPageIdInput, setAddPageIdInput] = useState("");
  const [addingPage, setAddingPage] = useState(false);

  const load = useCallback(async (refresh: boolean) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setNotConnected(false);
    try {
      const res = await fetch(`/api/facebook/pages${refresh ? "?refresh=1" : ""}`);
      const data = await res.json();
      if (res.status === 409) {
        setNotConnected(true);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Failed to load Pages.");
      setPages(data.pages ?? []);
      setDefaultId(data.defaultPageId ?? null);
      if (data.accountName) setAccountName(data.accountName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Pages.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  async function handleAddPage(e: React.FormEvent) {
    e.preventDefault();
    const pid = addPageIdInput.trim();
    if (!pid) return;
    setAddingPage(true);
    setError(null);
    try {
      const res = await fetch("/api/facebook/pages/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: pid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add Page.");
      setActionMessage(`Page "${data.page.name}" successfully connected and added!`);
      setTimeout(() => setActionMessage(null), 3500);
      setAddPageIdInput("");
      setShowAddForm(false);
      load(false);
    } catch (err: any) {
      setError(err.message || "Failed to add Page.");
    } finally {
      setAddingPage(false);
    }
  }

  async function setDefault(page: PageCache) {
    setBusyPageId(page.page_id);
    setError(null);
    try {
      const res = await fetch("/api/facebook/default-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: page.page_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't set that Page as default.");
      setDefaultId(page.page_id);
      setActionMessage(`"${page.name}" is now your default Facebook Page.`);
      setTimeout(() => setActionMessage(null), 3000);
      load(false);
    } catch (err: any) {
      setError(err.message || "Failed to set default Page.");
    } finally {
      setBusyPageId(null);
    }
  }

  async function handleTogglePageConnection(page: PageCache) {
    setBusyPageId(page.page_id);
    setError(null);
    const isDisconnecting = page.is_active !== false;
    const endpoint = isDisconnecting
      ? `/api/facebook/pages/${page.page_id}/disconnect`
      : `/api/facebook/pages/${page.page_id}/reconnect`;

    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update Page status.");

      setActionMessage(
        isDisconnecting
          ? `"${page.name}" has been disconnected. It will no longer receive new posts.`
          : `"${page.name}" has been reactivated.`
      );
      setTimeout(() => setActionMessage(null), 3500);
      load(false);
    } catch (err: any) {
      setError(err.message || "Failed to update Page connection.");
    } finally {
      setBusyPageId(null);
    }
  }

  function copyPageId(id: string) {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (notConnected) {
    return (
      <Card className="py-12 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
          <FlagBanner size={28} />
        </div>
        <h2 className="mt-4 font-heading text-lg font-bold text-foreground">Facebook Account Not Connected</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Connect your Facebook account in Settings to manage multiple Pages and publish posts automatically.
        </p>
        <div className="mt-6">
          <Link href="/dashboard/settings">
            <Button size="sm">Go to Settings</Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
              Facebook Pages
            </h1>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {pages.length} {pages.length === 1 ? "Page" : "Pages"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your connected Facebook Page destinations. Posts can target any connected Page.
            {accountName && (
              <span className="ml-1 inline-flex items-center gap-1 font-medium text-foreground">
                • Connected via <strong className="font-semibold">{accountName}</strong>
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={showAddForm ? "primary" : "secondary"}
            onClick={() => setShowAddForm((v) => !v)}
          >
            {showAddForm ? <X size={14} /> : <Plus size={14} />}
            {showAddForm ? "Cancel" : "Add Page by ID"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => load(true)} disabled={refreshing}>
            <ArrowClockwise size={14} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Syncing…" : "Sync from Facebook"}
          </Button>
          <a href="/api/facebook/oauth/start">
            <Button size="sm" variant="secondary">
              Reconnect Account
            </Button>
          </a>
        </div>
      </div>

      {/* Add Missing Page by ID card */}
      {showAddForm && (
        <Card className="border-primary/30 bg-primary/5 p-4 animate-in fade-in">
          <form onSubmit={handleAddPage} className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Plus size={16} className="text-primary" />
                Add Missing Page Directly by Page ID
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Meta Business Portfolio and New Pages Experience (NPE) pages sometimes don't appear in the default accounts list.
                Paste your Page ID (e.g. <code>123456789012345</code>) below to connect it directly.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={addPageIdInput}
                onChange={(e) => setAddPageIdInput(e.target.value)}
                placeholder="Enter Facebook Page ID (e.g. 123456789012345)"
                className="flex-1 rounded-xl border border-border bg-background px-3.5 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 font-mono text-xs"
                disabled={addingPage}
                autoFocus
              />
              <Button type="submit" size="sm" disabled={addingPage || !addPageIdInput.trim()}>
                {addingPage ? "Connecting…" : "Add & Connect"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Action Success Notice */}
      {actionMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-300 animate-in fade-in">
          <CheckCircle size={18} weight="fill" className="text-emerald-400 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive">
          <WarningCircle size={18} weight="fill" className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Distinction explanation banner */}
      <div className="rounded-2xl border border-border bg-surface-2/40 p-4 text-xs text-muted-foreground flex items-start gap-3">
        <Info size={18} className="text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-foreground">Multi-Page Destination Architecture</p>
          <p className="leading-relaxed">
            You can target posts to any connected Page during generation or in the Queue.
            Disconnecting an individual Page below safely deactivates that specific destination without logging out your Facebook account.
            To completely disconnect your Meta credentials, visit Settings.
          </p>
        </div>
      </div>

      {/* Pages List */}
      {loading ? (
        <Card className="py-16 text-center text-sm text-muted-foreground">
          <ArrowClockwise size={24} className="mx-auto mb-2 animate-spin text-primary" />
          Loading connected Facebook Pages…
        </Card>
      ) : pages.length === 0 ? (
        <Card className="py-14 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
            <FlagBanner size={26} />
          </div>
          <h3 className="mt-4 font-semibold text-foreground">No Accessible Pages Found</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {accountName ? `Connected as ${accountName}. ` : ""}
            No Pages with content creation permissions were returned by Meta. Ensure you selected your Pages during OAuth login.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button size="sm" variant="secondary" onClick={() => load(true)} disabled={refreshing}>
              <ArrowClockwise size={14} className={refreshing ? "animate-spin" : ""} />
              Retry Sync
            </Button>
            <a href="/api/facebook/oauth/start">
              <Button size="sm">
                Reconnect &amp; Select Pages
              </Button>
            </a>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {pages.map((page) => {
            const isDefault = page.page_id === defaultId;
            const isActive = page.is_active !== false;
            const isBusy = busyPageId === page.page_id;

            return (
              <Card
                key={page.page_id}
                className={`relative flex flex-col justify-between transition-all border ${
                  isDefault
                    ? "border-primary/50 shadow-md shadow-primary/5 bg-card ring-1 ring-primary/20"
                    : isActive
                    ? "border-border bg-card hover:border-border/80"
                    : "border-border/50 bg-surface-2/30 opacity-75"
                }`}
              >
                <div>
                  {/* Top card bar: Badges */}
                  <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isDefault && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-500 border border-amber-500/30">
                          <Star size={12} weight="fill" /> Default Destination
                        </span>
                      )}
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 border border-emerald-500/20">
                          <CheckCircle size={11} weight="fill" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-400 border border-rose-500/20">
                          <WarningCircle size={11} weight="fill" /> Disconnected
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => copyPageId(page.page_id)}
                      className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-surface-2/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                      title="Copy Page ID"
                    >
                      <span>ID: {page.page_id}</span>
                      {copiedId === page.page_id ? (
                        <Check size={11} className="text-emerald-400" />
                      ) : (
                        <Copy size={11} />
                      )}
                    </button>
                  </div>

                  {/* Page Info */}
                  <div className="mt-4 flex items-start gap-3.5">
                    {/* Page Profile Image */}
                    {page.picture_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={page.picture_url}
                        alt={page.name}
                        className="h-12 w-12 rounded-2xl object-cover border border-border/80 shadow-xs shrink-0"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary font-heading font-bold text-lg border border-primary/20">
                        {page.name.charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <h2 className="font-heading text-base font-bold text-foreground leading-snug truncate">
                        {page.name}
                      </h2>
                      {page.category && (
                        <p className="mt-0.5 text-xs text-muted-foreground truncate">{page.category}</p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1 text-emerald-400">
                          <ShieldCheck size={13} weight="fill" /> Content Publishing Authorized
                        </span>
                        {page.account_name && (
                          <span>
                            Account: <strong className="text-foreground">{page.account_name}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="mt-5 pt-3.5 border-t border-border/60 flex items-center justify-between gap-2">
                  <div>
                    {!isDefault && isActive && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setDefault(page)}
                        disabled={isBusy}
                        className="gap-1.5 text-xs font-semibold"
                      >
                        <Star size={13} />
                        Set as Default
                      </Button>
                    )}
                    {isDefault && (
                      <span className="text-xs text-muted-foreground font-medium">
                        Default for new posts &amp; requests
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleTogglePageConnection(page)}
                      disabled={isBusy}
                      className={`text-xs gap-1.5 ${
                        isActive
                          ? "text-muted-foreground hover:text-rose-400"
                          : "text-emerald-400 hover:text-emerald-300"
                      }`}
                      title={isActive ? "Disconnect this Page" : "Reactivate this Page"}
                    >
                      <Power size={13} />
                      {isActive ? "Disconnect Page" : "Reactivate Page"}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
