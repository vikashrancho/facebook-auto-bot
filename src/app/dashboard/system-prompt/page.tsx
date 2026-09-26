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
} from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/text";


export default function SystemPromptPage() {
  const [loading, setLoading] = useState(true);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [savingKeys, setSavingKeys] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Settings State
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [aiProvider, setAiProvider] = useState<"gemini" | "groq" | "openai" | "openrouter" | "auto">("auto");
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

  useEffect(() => {
    fetch("/api/settings")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load settings");
        const data = await res.json();
        if (data.system_prompt) setSystemPrompt(data.system_prompt);
        if (data.ai_provider) setAiProvider(data.ai_provider);
        setGeminiEnabled(data.gemini_enabled ?? true);
        setGroqEnabled(data.groq_enabled ?? true);
        setOpenaiEnabled(data.openai_enabled ?? false);
        setOpenrouterEnabled(data.openrouter_enabled ?? false);

        setGeminiConfigured(Boolean(data.gemini_configured));
        setGroqConfigured(Boolean(data.groq_configured));
        setOpenaiConfigured(Boolean(data.openai_configured));
        setOpenrouterConfigured(Boolean(data.openrouter_configured));
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
      setSuccess("System prompt saved successfully!");
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSavingPrompt(false);
    }
  }

  function handleResetPrompt() {
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
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

      if (geminiKey.trim()) {
        setGeminiConfigured(true);
        setGeminiKey("");
      }
      if (groqKey.trim()) {
        setGroqConfigured(true);
        setGroqKey("");
      }
      if (openaiKey.trim()) {
        setOpenaiConfigured(true);
        setOpenaiKey("");
      }
      if (openrouterKey.trim()) {
        setOpenrouterConfigured(true);
        setOpenrouterKey("");
      }

      setSuccess("AI models and API keys updated successfully!");
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save AI settings.");
    } finally {
      setSavingKeys(false);
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
            Test in Generator
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
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Primary Engine Preference
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {([
              { id: "auto", name: "Auto (Smart Waterfall)", desc: "Tries best enabled model with seamless fallback" },
              { id: "gemini", name: "Google Gemini", desc: "Gemini 2.0 Flash (Fast & creative)" },
              { id: "groq", name: "Groq LLaMA", desc: "Llama 3.3 70B (Ultra fast inference)" },
              { id: "openai", name: "OpenAI", desc: "GPT-4o mini (High quality instruction following)" },
              { id: "openrouter", name: "OpenRouter", desc: "Access open & commercial models via unified API" },
            ] as const).map((p) => (
              <label
                key={p.id}
                onClick={() => setAiProvider(p.id)}
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
                    onChange={() => setAiProvider(p.id)}
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
                    <p className="text-xs text-muted-foreground">gemini-3.8-flash</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={geminiConfigured ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : ""}>
                    {geminiConfigured ? "Configured" : "No Key"}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => setGeminiEnabled(!geminiEnabled)}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition",
                      geminiEnabled
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-surface-2 text-muted-foreground"
                    )}
                  >
                    {geminiEnabled ? "Enabled" : "Disabled"}
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <label className="text-xs font-medium text-muted-foreground">
                  {geminiConfigured ? "Replace API Key" : "Enter Gemini API Key"}
                </label>
                <input
                  type="password"
                  placeholder={geminiConfigured ? "•••••••••••••••• (Key saved)" : "AIzaSy..."}
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                />
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
                    onClick={() => setGroqEnabled(!groqEnabled)}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition",
                      groqEnabled
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-surface-2 text-muted-foreground"
                    )}
                  >
                    {groqEnabled ? "Enabled" : "Disabled"}
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <label className="text-xs font-medium text-muted-foreground">
                  {groqConfigured ? "Replace API Key" : "Enter Groq API Key"}
                </label>
                <input
                  type="password"
                  placeholder={groqConfigured ? "•••••••••••••••• (Key saved)" : "gsk_..."}
                  value={groqKey}
                  onChange={(e) => setGroqKey(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                />
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
                    onClick={() => setOpenaiEnabled(!openaiEnabled)}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition",
                      openaiEnabled
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-surface-2 text-muted-foreground"
                    )}
                  >
                    {openaiEnabled ? "Enabled" : "Disabled"}
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <label className="text-xs font-medium text-muted-foreground">
                  {openaiConfigured ? "Replace API Key" : "Enter OpenAI API Key"}
                </label>
                <input
                  type="password"
                  placeholder={openaiConfigured ? "•••••••••••••••• (Key saved)" : "sk-..."}
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                />
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
                    onClick={() => setOpenrouterEnabled(!openrouterEnabled)}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition",
                      openrouterEnabled
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-surface-2 text-muted-foreground"
                    )}
                  >
                    {openrouterEnabled ? "Enabled" : "Disabled"}
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <label className="text-xs font-medium text-muted-foreground">
                  {openrouterConfigured ? "Replace API Key" : "Enter OpenRouter API Key"}
                </label>
                <input
                  type="password"
                  placeholder={openrouterConfigured ? "•••••••••••••••• (Key saved)" : "sk-or-v1-..."}
                  value={openrouterKey}
                  onChange={(e) => setOpenrouterKey(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                />
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
            <span>{systemPrompt.length} characters</span>
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
            <li>The prompt must instruct the model to return JSON with <code className="rounded bg-surface-2 px-1 text-primary">title</code>, <code className="rounded bg-surface-2 px-1 text-primary">description</code>, and <code className="rounded bg-surface-2 px-1 text-primary">hashtags</code>.</li>
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
    </div>
  );
}
