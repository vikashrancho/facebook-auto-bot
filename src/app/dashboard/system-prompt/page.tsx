"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  SlidersHorizontal,
  Sparkle,
  FloppyDisk,
  ArrowCounterClockwise,
  CheckCircle,
  WarningCircle,
  Lightning,
  Cpu,
  Globe,
  ArrowSquareOut,
  Trash,
  Key,
  PaperPlaneRight,
  ArrowClockwise,
} from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/text";
import type { GeneratedContent } from "@/lib/types";

type ProviderId = "gemini" | "groq" | "openai" | "openrouter" | "auto";

export default function SystemPromptPage() {
  const [loading, setLoading] = useState(true);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [savingKeys, setSavingKeys] = useState(false);
  const [togglingProvider, setTogglingProvider] = useState<string | null>(null);
  const [clearingKey, setClearingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Settings State
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [aiProvider, setAiProvider] = useState<ProviderId>("auto");
  const [geminiEnabled, setGeminiEnabled] = useState(true);
  const [groqEnabled, setGroqEnabled] = useState(true);
  const [openaiEnabled, setOpenaiEnabled] = useState(false);
  const [openrouterEnabled, setOpenrouterEnabled] = useState(false);

  // Configured flags (from server)
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [groqConfigured, setGroqConfigured] = useState(false);
  const [openaiConfigured, setOpenaiConfigured] = useState(false);
  const [openrouterConfigured, setOpenrouterConfigured] = useState(false);

  // Key Input fields
  const [geminiKey, setGeminiKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");

  // Key visibility toggles
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showOpenrouterKey, setShowOpenrouterKey] = useState(false);

  // Live Test State
  const [testTopic, setTestTopic] = useState("Investing for Beginners");
  const [testingAi, setTestingAi] = useState(false);
  const [testResult, setTestResult] = useState<GeneratedContent | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  function syncFromData(data: Record<string, unknown>) {
    if (typeof data.system_prompt === "string") setSystemPrompt(data.system_prompt);
    if (typeof data.ai_provider === "string") setAiProvider(data.ai_provider as ProviderId);
    setGeminiEnabled((data.gemini_enabled as boolean) ?? true);
    setGroqEnabled((data.groq_enabled as boolean) ?? true);
    setOpenaiEnabled((data.openai_enabled as boolean) ?? false);
    setOpenrouterEnabled((data.openrouter_enabled as boolean) ?? false);

    setGeminiConfigured(Boolean(data.gemini_configured));
    setGroqConfigured(Boolean(data.groq_configured));
    setOpenaiConfigured(Boolean(data.openai_configured));
    setOpenrouterConfigured(Boolean(data.openrouter_configured));
  }

  useEffect(() => {
    fetch("/api/settings")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load settings");
        const data = await res.json();
        syncFromData(data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load settings."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSavePrompt() {
    setError(null);
    setSuccess(null);
    setSavingPrompt(true);

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_prompt: systemPrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save system prompt.");
      syncFromData(data);
      setSuccess("System prompt saved successfully!");
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save system prompt.");
    } finally {
      setSavingPrompt(false);
    }
  }

  function handleResetPrompt() {
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
  }

  async function handleToggleProvider(
    provider: "gemini" | "groq" | "openai" | "openrouter",
    currentValue: boolean
  ) {
    const nextValue = !currentValue;
    setTogglingProvider(provider);
    setError(null);

    // Optimistically update
    if (provider === "gemini") setGeminiEnabled(nextValue);
    if (provider === "groq") setGroqEnabled(nextValue);
    if (provider === "openai") setOpenaiEnabled(nextValue);
    if (provider === "openrouter") setOpenrouterEnabled(nextValue);

    try {
      const payload: Record<string, unknown> = {
        [`${provider}_enabled`]: nextValue,
      };
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update provider status.");
      syncFromData(data);
    } catch (err) {
      // Revert on error
      if (provider === "gemini") setGeminiEnabled(currentValue);
      if (provider === "groq") setGroqEnabled(currentValue);
      if (provider === "openai") setOpenaiEnabled(currentValue);
      if (provider === "openrouter") setOpenrouterEnabled(currentValue);
      setError(err instanceof Error ? err.message : "Failed to update provider status.");
    } finally {
      setTogglingProvider(null);
    }
  }

  async function handleSelectAiProvider(id: ProviderId) {
    setAiProvider(id);
    setError(null);

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai_provider: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to set primary engine preference.");
      syncFromData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set primary engine.");
    }
  }

  async function handleClearKey(provider: "gemini" | "groq" | "openai" | "openrouter") {
    if (!confirm(`Are you sure you want to remove the custom API key for ${provider.toUpperCase()}?`)) {
      return;
    }

    setClearingKey(provider);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        [`${provider}_api_key`]: null,
      };
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to clear API key.");
      syncFromData(data);
      if (provider === "gemini") setGeminiKey("");
      if (provider === "groq") setGroqKey("");
      if (provider === "openai") setOpenaiKey("");
      if (provider === "openrouter") setOpenrouterKey("");
      setSuccess(`${provider.toUpperCase()} API key removed.`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear API key.");
    } finally {
      setClearingKey(null);
    }
  }

  async function handleSaveAIConfig() {
    setError(null);
    setSuccess(null);
    setSavingKeys(true);

    const payload: Record<string, unknown> = {
      ai_provider: aiProvider,
      gemini_enabled: geminiEnabled,
      groq_enabled: groqEnabled,
      openai_enabled: openaiEnabled,
      openrouter_enabled: openrouterEnabled,
    };

    if (geminiKey.trim()) payload.gemini_api_key = geminiKey.trim();
    if (groqKey.trim()) payload.groq_api_key = groqKey.trim();
    if (openaiKey.trim()) payload.openai_api_key = openaiKey.trim();
    if (openrouterKey.trim()) payload.openrouter_api_key = openrouterKey.trim();

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save AI configuration.");

      syncFromData(data);
      if (geminiKey.trim()) setGeminiKey("");
      if (groqKey.trim()) setGroqKey("");
      if (openaiKey.trim()) setOpenaiKey("");
      if (openrouterKey.trim()) setOpenrouterKey("");

      setSuccess("AI models and API keys updated successfully!");
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save AI settings.");
    } finally {
      setSavingKeys(false);
    }
  }

  async function handleRunTest() {
    if (!testTopic.trim()) return;
    setTestingAi(true);
    setTestError(null);
    setTestResult(null);

    try {
      const res = await fetch("/api/generate/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: testTopic.trim(),
          prompt: systemPrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test generation failed.");
      setTestResult(data as GeneratedContent);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setTestingAi(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-6 lg:p-10">
        <p className="text-sm text-muted-foreground">Loading AI configuration…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6 lg:p-10">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight">
            <SlidersHorizontal size={28} className="text-primary" />
            System Prompt &amp; AI Engine
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure how the AI writes your Facebook posts and manage API keys for Gemini, Groq, OpenAI, and OpenRouter.
          </p>
        </div>
        <Link href="/dashboard/generate">
          <Button variant="secondary" size="sm" className="gap-2">
            <Sparkle size={16} />
            Open Post Generator
          </Button>
        </Link>
      </div>

      {/* Notifications */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          <WarningCircle size={20} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle size={20} className="shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Section 1: AI Provider Selection & Keys */}
      <Card className="space-y-6 p-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">1. Active AI Engine &amp; API Keys</h2>
          <p className="text-xs text-muted-foreground">
            Choose which AI model handles content generation. Toggle any provider on/off or set a specific engine as primary.
          </p>
        </div>

        {/* Primary Selection */}
        <div className="rounded-xl border border-border bg-surface-2/40 p-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Primary Engine Preference
            </label>
            <span className="text-[11px] text-muted-foreground">Auto-saved on click</span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {([
              { id: "auto", name: "Auto (Smart Waterfall)", desc: "Tries best enabled model with seamless fallback" },
              { id: "gemini", name: "Google Gemini", desc: "Gemini Flash (Fast, creative, latest model)" },
              { id: "groq", name: "Groq LLaMA", desc: "Llama 3.3 70B (Ultra fast inference)" },
              { id: "openai", name: "OpenAI", desc: "GPT-4o mini (High quality instruction following)" },
              { id: "openrouter", name: "OpenRouter", desc: "Access open & commercial models via unified API" },
            ] as const).map((p) => (
              <label
                key={p.id}
                onClick={() => handleSelectAiProvider(p.id)}
                className={cn(
                  "flex cursor-pointer flex-col justify-between rounded-xl border p-3.5 transition",
                  aiProvider === p.id
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border bg-surface hover:border-muted-foreground/30"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{p.name}</span>
                  <input
                    type="radio"
                    name="ai_provider"
                    checked={aiProvider === p.id}
                    onChange={() => handleSelectAiProvider(p.id)}
                    className="accent-primary"
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{p.desc}</p>
              </label>
            ))}
          </div>
        </div>

        {/* Providers Grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Gemini */}
          <div className="flex flex-col justify-between rounded-xl border border-border bg-surface p-4">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                    <Sparkle size={18} weight="fill" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">Google Gemini</h3>
                    <p className="text-xs text-muted-foreground">gemini-flash-latest</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={geminiConfigured ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : ""}>
                    {geminiConfigured ? "Configured" : "No Key"}
                  </Badge>
                  <button
                    type="button"
                    disabled={togglingProvider === "gemini"}
                    onClick={() => handleToggleProvider("gemini", geminiEnabled)}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-50",
                      geminiEnabled
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
                        : "bg-surface-2 text-muted-foreground hover:bg-surface-2/80"
                    )}
                  >
                    {togglingProvider === "gemini" ? "Saving…" : geminiEnabled ? "Enabled" : "Disabled"}
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">
                    {geminiConfigured ? "Update API Key" : "Enter Gemini API Key"}
                  </label>
                  {geminiConfigured && (
                    <button
                      type="button"
                      disabled={clearingKey === "gemini"}
                      onClick={() => handleClearKey("gemini")}
                      className="flex items-center gap-1 text-[11px] text-destructive hover:underline disabled:opacity-50"
                    >
                      <Trash size={12} />
                      {clearingKey === "gemini" ? "Removing…" : "Remove Saved Key"}
                    </button>
                  )}
                </div>
                <div className="relative mt-1.5">
                  <input
                    type={showGeminiKey ? "text" : "password"}
                    placeholder={geminiConfigured ? "•••••••••••••••• (Key saved)" : "AIzaSy..."}
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 pr-16 text-xs font-mono focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    {showGeminiKey ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Free tier available</span>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
              >
                Get Gemini Key <ArrowSquareOut size={12} />
              </a>
            </div>
          </div>

          {/* Groq */}
          <div className="flex flex-col justify-between rounded-xl border border-border bg-surface p-4">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                    <Lightning size={18} weight="fill" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">Groq</h3>
                    <p className="text-xs text-muted-foreground">llama-3.3-70b-versatile</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={groqConfigured ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : ""}>
                    {groqConfigured ? "Configured" : "No Key"}
                  </Badge>
                  <button
                    type="button"
                    disabled={togglingProvider === "groq"}
                    onClick={() => handleToggleProvider("groq", groqEnabled)}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-50",
                      groqEnabled
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
                        : "bg-surface-2 text-muted-foreground hover:bg-surface-2/80"
                    )}
                  >
                    {togglingProvider === "groq" ? "Saving…" : groqEnabled ? "Enabled" : "Disabled"}
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">
                    {groqConfigured ? "Update API Key" : "Enter Groq API Key"}
                  </label>
                  {groqConfigured && (
                    <button
                      type="button"
                      disabled={clearingKey === "groq"}
                      onClick={() => handleClearKey("groq")}
                      className="flex items-center gap-1 text-[11px] text-destructive hover:underline disabled:opacity-50"
                    >
                      <Trash size={12} />
                      {clearingKey === "groq" ? "Removing…" : "Remove Saved Key"}
                    </button>
                  )}
                </div>
                <div className="relative mt-1.5">
                  <input
                    type={showGroqKey ? "text" : "password"}
                    placeholder={groqConfigured ? "•••••••••••••••• (Key saved)" : "gsk_..."}
                    value={groqKey}
                    onChange={(e) => setGroqKey(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 pr-16 text-xs font-mono focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGroqKey(!showGroqKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    {showGroqKey ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Free tier available</span>
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
              >
                Get Groq Key <ArrowSquareOut size={12} />
              </a>
            </div>
          </div>

          {/* OpenAI */}
          <div className="flex flex-col justify-between rounded-xl border border-border bg-surface p-4">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                    <Cpu size={18} weight="fill" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">OpenAI</h3>
                    <p className="text-xs text-muted-foreground">gpt-4o-mini</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={openaiConfigured ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : ""}>
                    {openaiConfigured ? "Configured" : "No Key"}
                  </Badge>
                  <button
                    type="button"
                    disabled={togglingProvider === "openai"}
                    onClick={() => handleToggleProvider("openai", openaiEnabled)}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-50",
                      openaiEnabled
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
                        : "bg-surface-2 text-muted-foreground hover:bg-surface-2/80"
                    )}
                  >
                    {togglingProvider === "openai" ? "Saving…" : openaiEnabled ? "Enabled" : "Disabled"}
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">
                    {openaiConfigured ? "Update API Key" : "Enter OpenAI API Key"}
                  </label>
                  {openaiConfigured && (
                    <button
                      type="button"
                      disabled={clearingKey === "openai"}
                      onClick={() => handleClearKey("openai")}
                      className="flex items-center gap-1 text-[11px] text-destructive hover:underline disabled:opacity-50"
                    >
                      <Trash size={12} />
                      {clearingKey === "openai" ? "Removing…" : "Remove Saved Key"}
                    </button>
                  )}
                </div>
                <div className="relative mt-1.5">
                  <input
                    type={showOpenaiKey ? "text" : "password"}
                    placeholder={openaiConfigured ? "•••••••••••••••• (Key saved)" : "sk-..."}
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 pr-16 text-xs font-mono focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    {showOpenaiKey ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Standard API Key</span>
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
              >
                Get OpenAI Key <ArrowSquareOut size={12} />
              </a>
            </div>
          </div>

          {/* OpenRouter */}
          <div className="flex flex-col justify-between rounded-xl border border-border bg-surface p-4">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
                    <Globe size={18} weight="fill" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">OpenRouter</h3>
                    <p className="text-xs text-muted-foreground">Llama 3.3 / Multi-Model</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={openrouterConfigured ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : ""}>
                    {openrouterConfigured ? "Configured" : "No Key"}
                  </Badge>
                  <button
                    type="button"
                    disabled={togglingProvider === "openrouter"}
                    onClick={() => handleToggleProvider("openrouter", openrouterEnabled)}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-50",
                      openrouterEnabled
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
                        : "bg-surface-2 text-muted-foreground hover:bg-surface-2/80"
                    )}
                  >
                    {togglingProvider === "openrouter" ? "Saving…" : openrouterEnabled ? "Enabled" : "Disabled"}
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">
                    {openrouterConfigured ? "Update API Key" : "Enter OpenRouter API Key"}
                  </label>
                  {openrouterConfigured && (
                    <button
                      type="button"
                      disabled={clearingKey === "openrouter"}
                      onClick={() => handleClearKey("openrouter")}
                      className="flex items-center gap-1 text-[11px] text-destructive hover:underline disabled:opacity-50"
                    >
                      <Trash size={12} />
                      {clearingKey === "openrouter" ? "Removing…" : "Remove Saved Key"}
                    </button>
                  )}
                </div>
                <div className="relative mt-1.5">
                  <input
                    type={showOpenrouterKey ? "text" : "password"}
                    placeholder={openrouterConfigured ? "•••••••••••••••• (Key saved)" : "sk-or-v1-..."}
                    value={openrouterKey}
                    onChange={(e) => setOpenrouterKey(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 pr-16 text-xs font-mono focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenrouterKey(!showOpenrouterKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    {showOpenrouterKey ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Universal AI routing</span>
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
              >
                Get OpenRouter Key <ArrowSquareOut size={12} />
              </a>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSaveAIConfig} disabled={savingKeys} className="gap-2">
            <FloppyDisk size={16} />
            {savingKeys ? "Saving AI Settings..." : "Save AI Providers & Keys"}
          </Button>
        </div>
      </Card>

      {/* Section 2: Custom System Prompt Editor */}
      <Card className="space-y-6 p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">2. Custom System Prompt</h2>
            <p className="text-xs text-muted-foreground">
              Customize the instructions provided to the AI. The AI must return a valid JSON object matching the expected schema.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleResetPrompt}
            className="gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowCounterClockwise size={14} />
            Reset to Tested Default
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Editor (Strict JSON format required)</span>
            <span className={systemPrompt.length > 9000 ? "text-destructive font-semibold" : ""}>
              {systemPrompt.length} / 10,000 characters
            </span>
          </div>

          <textarea
            rows={15}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface-2/60 p-4 font-mono text-xs leading-relaxed text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Enter custom copywriting system instructions..."
          />
        </div>

        {/* Prompt Format Rules Box */}
        <div className="rounded-xl border border-border bg-surface-2/30 p-4 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Crucial Output Format Rules:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>The prompt must instruct the model to return JSON with <code className="rounded bg-surface-2 px-1 text-primary">title</code>, <code className="rounded bg-surface-2 px-1 text-primary">description</code>, <code className="rounded bg-surface-2 px-1 text-primary">hashtags</code>, and <code className="rounded bg-surface-2 px-1 text-primary">image_prompt</code>.</li>
            <li>No markdown fences (e.g. ```json) should surround the final output.</li>
            <li>Facebook reaches highest engagement when descriptions end with a comment-provoking question.</li>
          </ul>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSavePrompt} disabled={savingPrompt} className="gap-2">
            <FloppyDisk size={16} />
            {savingPrompt ? "Saving System Prompt..." : "Save System Prompt"}
          </Button>
        </div>
      </Card>

      {/* Section 3: Live Output & API Verification Tester */}
      <Card className="space-y-6 p-6">
        <div>
          <div className="flex items-center gap-2">
            <PaperPlaneRight size={20} className="text-primary" />
            <h2 className="text-lg font-semibold tracking-tight">3. Live AI &amp; Prompt Tester</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Verify right now whether your active AI engine, API keys, and prompt instructions work together smoothly.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <input
              type="text"
              value={testTopic}
              onChange={(e) => setTestTopic(e.target.value)}
              placeholder="Enter a test topic (e.g. Stock Market, Real Estate, Morning Fitness)..."
              className="w-full rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <Button
            onClick={handleRunTest}
            disabled={testingAi || !testTopic.trim()}
            className="gap-2 shrink-0"
          >
            {testingAi ? (
              <>
                <ArrowClockwise size={16} className="animate-spin" />
                Testing AI Engine…
              </>
            ) : (
              <>
                <PaperPlaneRight size={16} />
                Run AI Test
              </>
            )}
          </Button>
        </div>

        {testError && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive">
            <p className="font-semibold">Test Generation Error:</p>
            <p className="mt-1">{testError}</p>
          </div>
        )}

        {testResult && (
          <div className="space-y-4 rounded-xl border border-border bg-surface-2/40 p-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Live Output Preview
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Responding Engine:</span>
                <Badge className="border-primary/30 bg-primary/10 text-primary font-mono text-xs uppercase">
                  {testResult.provider || "Unknown"}
                </Badge>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <span className="font-medium text-muted-foreground">Title (Opening Hook):</span>
                <p className="mt-0.5 rounded-lg border border-border bg-surface p-2.5 font-semibold text-foreground">
                  {testResult.title}
                </p>
              </div>

              <div>
                <span className="font-medium text-muted-foreground">Description (Body copy):</span>
                <p className="mt-0.5 whitespace-pre-wrap rounded-lg border border-border bg-surface p-2.5 text-foreground leading-relaxed">
                  {testResult.description}
                </p>
              </div>

              <div>
                <span className="font-medium text-muted-foreground">Hashtags:</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {testResult.hashtags.map((h, i) => (
                    <span key={i} className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary">
                      #{h}
                    </span>
                  ))}
                </div>
              </div>

              {testResult.image_prompt && (
                <div>
                  <span className="font-medium text-muted-foreground">AI Image Generation Scene Prompt:</span>
                  <p className="mt-0.5 rounded-lg border border-border bg-surface p-2.5 italic text-muted-foreground text-[11px]">
                    &ldquo;{testResult.image_prompt}&rdquo;
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
