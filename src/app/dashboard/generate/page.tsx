"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Sparkle,
  Copy,
  Check,
  ArrowSquareOut,
  ArrowClockwise,
  Robot,
  WarningCircle,
  CheckCircle,
  Clock,
  FacebookLogo,
  Gear,
  X,
  Plus,
} from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { ContentRequest, ContentRequestStatus, PageCache } from "@/lib/types";

const CONTENT_TYPES = [
  "Motivational",
  "Educational",
  "Investing Tips",
  "Stock Market Analysis",
  "Custom",
] as const;

const TONE_PRESETS = [
  "Inspiring & Uplifting",
  "Professional & Analytical",
  "Direct & Actionable",
  "Casual & Story-driven",
  "Urgent & Cautionary",
];

const AUDIENCE_PRESETS = [
  "Beginner retail investors",
  "Long-term wealth builders",
  "Young professionals & entrepreneurs",
  "Active traders & market watchers",
  "General public",
];

const IMAGE_STYLES = [
  { id: "Modern Photorealistic", label: "Modern Photorealistic", desc: "Clean studio lighting, authentic subjects" },
  { id: "Minimalist 3D Illustration", label: "3D Illustration", desc: "Sleek geometric shapes, soft pastel gradients" },
  { id: "Dark Aesthetic Cinematic", label: "Cinematic Dark", desc: "Moody lighting, deep charcoal tones, dramatic focus" },
  { id: "Editorial Graphic", label: "Editorial", desc: "Magazine-style visual hierarchy, clean textures" },
];

const ASPECT_RATIOS = [
  { id: "1:1", label: "1:1 Square (Recommended)", desc: "Best for Facebook feeds & Instagram" },
  { id: "4:5", label: "4:5 Portrait", desc: "Vertical feed coverage" },
  { id: "16:9", label: "16:9 Landscape", desc: "Wide desktop & article style" },
];

export default function GeneratePage() {
  // Form inputs
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("facebook");
  const [contentType, setContentType] = useState<string>("Motivational");
  const [tone, setTone] = useState("Inspiring & Uplifting");
  const [audience, setAudience] = useState("Long-term wealth builders");
  const [imageStyle, setImageStyle] = useState("Modern Photorealistic");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [pageId, setPageId] = useState("");

  // Metadata & system settings
  const [pages, setPages] = useState<PageCache[]>([]);
  const [ownTopics, setOwnTopics] = useState<string[]>([]);
  const [trendingTopics, setTrendingTopics] = useState<string[]>([]);
  const [customGptUrl, setCustomGptUrl] = useState<string | null>(null);
  const [editingGptUrl, setEditingGptUrl] = useState(false);
  const [tempGptUrl, setTempGptUrl] = useState("");

  // State management
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [copiedInstructions, setCopiedInstructions] = useState(false);
  const [copiedRequestId, setCopiedRequestId] = useState(false);

  // Active request and history
  const [activeRequest, setActiveRequest] = useState<ContentRequest | null>(null);
  const [recentRequests, setRecentRequests] = useState<ContentRequest[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Polling ref
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load initial data
  const loadRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/content-requests?limit=20");
      const data = await res.json();
      if (res.status === 409 || data.ready === false) {
        setMigrationMissing(true);
        return;
      }
      if (res.ok && data.requests) {
        setRecentRequests(data.requests);
      }
    } catch {
      // non-fatal
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    // Check URL params for prefilled topic or request ID
    const searchParams = new URLSearchParams(window.location.search);
    const fromTopic = searchParams.get("topic");
    const fromRequest = searchParams.get("request");
    if (fromTopic) setTopic(fromTopic);

    // Load settings, pages, topics, and initial requests
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.chatgpt_custom_gpt_url) {
          setCustomGptUrl(d.chatgpt_custom_gpt_url);
        }
      })
      .catch(() => {});

    fetch("/api/facebook/pages")
      .then((r) => r.json())
      .then((d) => {
        setPages(d.pages ?? []);
        if (d.defaultPageId) setPageId(d.defaultPageId);
      })
      .catch(() => {});

    fetch("/api/topics")
      .then((r) => r.json())
      .then((d) => {
        setOwnTopics(
          (d.topics ?? [])
            .filter((t: { enabled: boolean }) => t.enabled)
            .map((t: { text: string }) => t.text)
        );
      })
      .catch(() => {});

    fetch("/api/trends")
      .then((r) => r.json())
      .then((d) => setTrendingTopics(d.topics ?? []))
      .catch(() => {});

    loadRequests();

    if (fromRequest) {
      fetch(`/api/content-requests/${fromRequest}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.request) setActiveRequest(d.request);
        })
        .catch(() => {});
    }
  }, [loadRequests]);

  // Poll active request status if pending or processing
  useEffect(() => {
    if (!activeRequest) return;
    if (activeRequest.status === "draft_created" || activeRequest.status === "failed" || activeRequest.status === "cancelled") {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/content-requests/${activeRequest.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.request) {
            setActiveRequest(data.request);
            // Refresh history table too
            loadRequests();
          }
        }
      } catch {
        // ignore polling network errors
      }
    };

    pollingTimerRef.current = setInterval(poll, 3000);
    return () => {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    };
  }, [activeRequest?.id, activeRequest?.status, loadRequests]);

  const selectedPage = useMemo(() => pages.find((p) => p.page_id === pageId), [pages, pageId]);

  // Build the copyable handoff instructions for ChatGPT
  const handoffPrompt = useMemo(() => {
    if (!activeRequest) return "";
    return `Process my queued content request ${activeRequest.id}. Retrieve the request details using your configured getChatGPTContentRequest Action with requestId "${activeRequest.id}". Create a compelling social media caption and generate the image using ChatGPT's built-in Image Generation capability. Import the exact generated image using importChatGPTImage with openaiFileIdRefs. Create an unpublished draft using createChatGPTPost with the verified hosted imageUrl and requestId "${activeRequest.id}". Return the review URL. Do not use Pollinations.ai or another image generator. Do not approve or publish the post.`;
  }, [activeRequest]);

  // Submit new content request
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (topic.trim().length < 2) {
      setError("Please enter a topic or concept (at least 2 characters).");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/content-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          platform,
          contentType,
          tone: tone || undefined,
          audience: audience || undefined,
          imageStyle: imageStyle || undefined,
          aspectRatio,
          targetPageId: pageId || undefined,
          targetPageName: selectedPage?.name || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 || data.error?.includes("content_requests")) {
          setMigrationMissing(true);
        }
        throw new Error(data.error ?? "Failed to create content request.");
      }

      setActiveRequest(data.request);
      loadRequests();

      // Update URL with active request for recovery
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("request", data.request.id);
        window.history.replaceState({}, "", url.toString());
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setSubmitting(false);
    }
  }

  // Cancel active request
  async function handleCancelRequest(id: string) {
    try {
      const res = await fetch(`/api/content-requests/${id}/cancel`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setActiveRequest(data.request);
        loadRequests();
      }
    } catch {
      // ignore
    }
  }

  // Save custom GPT URL
  async function handleSaveGptUrl() {
    if (!tempGptUrl.trim()) return;
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatgpt_custom_gpt_url: tempGptUrl.trim() }),
      });
      if (res.ok) {
        setCustomGptUrl(tempGptUrl.trim());
        setEditingGptUrl(false);
      }
    } catch {
      // ignore
    }
  }

  function handleCopyInstructions() {
    if (!handoffPrompt) return;
    navigator.clipboard.writeText(handoffPrompt);
    setCopiedInstructions(true);
    setTimeout(() => setCopiedInstructions(false), 2500);
  }

  function handleCopyRequestId() {
    if (!activeRequest) return;
    navigator.clipboard.writeText(activeRequest.id);
    setCopiedRequestId(true);
    setTimeout(() => setCopiedRequestId(false), 2000);
  }

  function resetToNewRequest() {
    setActiveRequest(null);
    setTopic("");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("request");
      window.history.replaceState({}, "", url.toString());
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Robot size={22} weight="duotone" />
          </div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Create with ChatGPT
          </h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Enter an idea, then use your connected ChatGPT assistant to create the post and image.
        </p>
      </div>

      {/* Database migration alert if table missing */}
      {migrationMissing && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-200">
          <div className="flex items-start gap-3">
            <WarningCircle size={22} className="shrink-0 text-amber-400 mt-0.5" />
            <div className="space-y-2">
              <h3 className="font-semibold text-amber-300">Database Table Migration Required</h3>
              <p className="text-sm text-amber-200/90 leading-relaxed">
                The <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs">content_requests</code> table has not been created in your Supabase database yet. Please run the migration query in your Supabase SQL editor:
              </p>
              <div className="rounded-xl border border-amber-500/20 bg-black/50 p-3 font-mono text-xs text-amber-100 overflow-x-auto">
                supabase/migrations/20261018_content_requests.sql
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE REQUEST CARD */}
      {activeRequest && (
        <Card className="relative overflow-hidden border-primary/30 bg-card shadow-lg shadow-primary/5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-5">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Active Content Request
                </span>
                <button
                  type="button"
                  onClick={handleCopyRequestId}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-background/80 px-2 py-0.5 font-mono text-xs text-foreground transition-colors hover:border-primary/50"
                  title="Click to copy Request ID"
                >
                  <span>{activeRequest.id.slice(0, 8)}…{activeRequest.id.slice(-4)}</span>
                  {copiedRequestId ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
                <StatusBadge status={activeRequest.status} />
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                &ldquo;{activeRequest.topic}&rdquo;
              </h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Type: <strong className="text-foreground">{activeRequest.content_type}</strong></span>
                <span>Style: <strong className="text-foreground">{activeRequest.image_style || "Default"}</strong></span>
                <span>Ratio: <strong className="text-foreground">{activeRequest.aspect_ratio}</strong></span>
                {activeRequest.target_page_name && (
                  <span>Page: <strong className="text-foreground">{activeRequest.target_page_name}</strong></span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={resetToNewRequest}
                className="gap-1.5 text-xs"
              >
                <Plus size={14} />
                New Request
              </Button>
            </div>
          </div>

          {/* DRAFT CREATED SUCCESS BANNER */}
          {activeRequest.status === "draft_created" && (
            <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                    <CheckCircle size={22} weight="fill" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-emerald-300">Draft Successfully Created by ChatGPT!</h3>
                    <p className="text-xs text-emerald-200/80">
                      The generated post copy and verified Supabase image are now waiting in your Content Queue for human review.
                    </p>
                  </div>
                </div>

                <Link
                  href={activeRequest.review_url || `/dashboard/queue?post=${activeRequest.post_id}`}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-black transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span>Review in Queue</span>
                  <ArrowSquareOut size={15} weight="bold" />
                </Link>
              </div>
            </div>
          )}

          {/* FAILED BANNER */}
          {activeRequest.status === "failed" && (
            <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
              <div className="flex items-start gap-3 text-rose-300">
                <WarningCircle size={20} className="mt-0.5 shrink-0 text-rose-400" />
                <div className="space-y-1 text-xs">
                  <span className="font-semibold">Processing Failed:</span>
                  <p className="text-rose-200/90 leading-relaxed">
                    {activeRequest.error_message || "ChatGPT reported an issue while generating or importing the image."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* CHATGPT HANDOFF INSTRUCTION SECTION */}
          {activeRequest.status !== "draft_created" && (
            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Copy Instructions for your Custom GPT
                </label>
                <div className="mt-1.5 relative rounded-xl border border-border/80 bg-background/90 p-4 font-mono text-xs text-foreground/90 leading-relaxed select-all">
                  {handoffPrompt}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={handleCopyInstructions}
                  className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                  size="sm"
                >
                  {copiedInstructions ? (
                    <>
                      <Check size={16} className="text-emerald-300" />
                      <span>Copied to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={16} />
                      <span>Copy ChatGPT Instructions</span>
                    </>
                  )}
                </Button>

                {customGptUrl ? (
                  <a
                    href={customGptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-accent"
                  >
                    <Robot size={16} className="text-primary" />
                    <span>Open Custom GPT</span>
                    <ArrowSquareOut size={14} className="text-muted-foreground" />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingGptUrl(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  >
                    <Gear size={15} />
                    <span>Set Custom GPT URL</span>
                  </button>
                )}

                {activeRequest.status === "pending_chatgpt" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancelRequest(activeRequest.id)}
                    className="text-xs text-muted-foreground hover:text-rose-400"
                  >
                    Cancel Request
                  </Button>
                )}
              </div>

              {/* Inline Custom GPT URL Config Dialog */}
              {editingGptUrl && (
                <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Configure Custom GPT Link</span>
                    <button type="button" onClick={() => setEditingGptUrl(false)} className="text-muted-foreground hover:text-foreground">
                      <X size={16} />
                    </button>
                  </div>
                  <input
                    type="url"
                    value={tempGptUrl}
                    onChange={(e) => setTempGptUrl(e.target.value)}
                    placeholder="https://chatgpt.com/g/g-..."
                    className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditingGptUrl(false)} className="text-xs">
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveGptUrl} className="text-xs">
                      Save URL
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* CREATE NEW REQUEST FORM */}
      <Card className="border-border bg-card">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300">
              {error}
            </div>
          )}

          {/* Topic text area */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="topic" className="text-sm font-semibold text-foreground">
                Topic or Post Idea <span className="text-primary">*</span>
              </label>
              <span className="text-xs text-muted-foreground">{topic.length}/500</span>
            </div>
            <textarea
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="E.g. Why patience and dollar-cost averaging beat emotional market timing every single decade..."
              rows={3}
              maxLength={500}
              className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>

          {/* Suggested topics / Quick pills */}
          {(ownTopics.length > 0 || trendingTopics.length > 0) && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Quick Idea Suggestions
              </label>
              <div className="flex flex-wrap gap-2">
                {[...ownTopics.slice(0, 4), ...trendingTopics.slice(0, 3)].map((t, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setTopic(t)}
                    className="rounded-lg border border-border/80 bg-background/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Grid of preferences */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Platform & Page */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Publishing Platform
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPlatform("facebook")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-xl border p-2.5 text-sm font-medium transition-all",
                    platform === "facebook"
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border bg-background text-muted-foreground hover:border-border/80"
                  )}
                >
                  <FacebookLogo size={18} weight="fill" />
                  <span>Facebook</span>
                </button>
              </div>

              {pages.length > 0 && (
                <div className="mt-3">
                  <label className="text-xs font-medium text-muted-foreground">Target Facebook Page</label>
                  <select
                    value={pageId}
                    onChange={(e) => setPageId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
                  >
                    {pages.map((p) => (
                      <option key={p.page_id} value={p.page_id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Content Type */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Content Category
              </label>
              <select
                value={contentType}
                onChange={(e) => setContentType(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                {CONTENT_TYPES.map((ct) => (
                  <option key={ct} value={ct}>
                    {ct}
                  </option>
                ))}
              </select>
            </div>

            {/* Tone */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Tone of Voice (Optional)
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                {TONE_PRESETS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Audience */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Target Audience (Optional)
              </label>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                {AUDIENCE_PRESETS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            {/* Visual Style */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Image Style
              </label>
              <select
                value={imageStyle}
                onChange={(e) => setImageStyle(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                {IMAGE_STYLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} — {s.desc}
                  </option>
                ))}
              </select>
            </div>

            {/* Aspect Ratio */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Image Aspect Ratio
              </label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                {ASPECT_RATIOS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Primary Action Button */}
          <div className="pt-2">
            <Button
              type="submit"
              disabled={submitting}
              className="w-full gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 sm:w-auto sm:px-8"
            >
              {submitting ? (
                <>
                  <ArrowClockwise size={18} className="animate-spin" />
                  <span>Preparing Content Request…</span>
                </>
              ) : (
                <>
                  <Sparkle size={18} weight="fill" />
                  <span>Prepare for ChatGPT</span>
                </>
              )}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              This safely stages a request in your database without invoking any external AI API. You then hand the Request ID to your Custom GPT assistant to generate copy &amp; image.
            </p>
          </div>
        </form>
      </Card>

      {/* RECENT REQUESTS HISTORY */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading text-lg font-bold text-foreground">Recent Content Requests</h2>
            <p className="text-xs text-muted-foreground">
              Track requests handed off to your Custom GPT assistant.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadRequests}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowClockwise size={14} />
            <span>Refresh</span>
          </Button>
        </div>

        {loadingHistory ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-card border border-border/50" />
            ))}
          </div>
        ) : recentRequests.length === 0 ? (
          <Card className="text-center py-8 text-muted-foreground">
            <Robot size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No content requests yet.</p>
            <p className="text-xs mt-1">Submit your first idea above to start generating posts with ChatGPT.</p>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {recentRequests.map((req) => (
              <div
                key={req.id}
                className={cn(
                  "flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-4 transition-colors",
                  activeRequest?.id === req.id
                    ? "border-primary/50 bg-primary/5"
                    : "border-border bg-card hover:border-border/80"
                )}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {req.id.slice(0, 8)}…
                    </span>
                    <StatusBadge status={req.status} />
                    <span className="text-xs text-muted-foreground">
                      {new Date(req.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground line-clamp-1">
                    {req.topic}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {req.status === "draft_created" && req.post_id ? (
                    <Link
                      href={req.review_url || `/dashboard/queue?post=${req.post_id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20"
                    >
                      <span>Review in Queue</span>
                      <ArrowSquareOut size={13} />
                    </Link>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setActiveRequest(req)}
                      className="text-xs gap-1.5"
                    >
                      <span>View Handoff</span>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ContentRequestStatus }) {
  switch (status) {
    case "pending_chatgpt":
      return (
        <Badge className="gap-1.5 border-amber-500/30 bg-amber-500/10 text-amber-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span>Waiting for ChatGPT</span>
        </Badge>
      );
    case "processing":
      return (
        <Badge className="gap-1.5 border-sky-500/30 bg-sky-500/10 text-sky-300">
          <ArrowClockwise size={12} className="animate-spin text-sky-400" />
          <span>ChatGPT Processing</span>
        </Badge>
      );
    case "draft_created":
      return (
        <Badge className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
          <CheckCircle size={12} weight="fill" className="text-emerald-400" />
          <span>Draft Created</span>
        </Badge>
      );
    case "failed":
      return (
        <Badge className="gap-1.5 border-rose-500/30 bg-rose-500/10 text-rose-300">
          <WarningCircle size={12} weight="fill" className="text-rose-400" />
          <span>Failed</span>
        </Badge>
      );
    case "cancelled":
      return (
        <Badge className="gap-1.5 border-neutral-700 bg-neutral-800 text-neutral-400">
          <Clock size={12} />
          <span>Cancelled</span>
        </Badge>
      );
    default:
      return <Badge>{status}</Badge>;
  }
}
