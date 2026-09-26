import { env } from "@/lib/env";
import { getSettings } from "@/lib/db/settings";
import type { ContentProvider, GeneratedContent } from "@/lib/types";

/**
 * Facebook copy generation across LLM providers (Gemini, Groq, OpenAI, OpenRouter, Pollinations),
 * tried in order until one returns usable JSON.
 */

export const DEFAULT_SYSTEM_PROMPT = `You are an expert Facebook Page copywriter and visual director. Given a topic, write a single
high-performing Facebook photo post and an accompanying photographic scene prompt in strict JSON with this exact shape and nothing else:
{"title": string, "description": string, "hashtags": string[], "image_prompt": string}

The three copy parts are joined into one caption, in that order, so they must read as
one post rather than three fragments.

Rules:
- title: the opening hook, <= 80 characters. Conversational, scroll-stopping, specific. At most one emoji. No hashtags.
- description: 2-4 short sentences, <= 400 characters, written to be read on a phone. Plain language, no marketing cliches. End with a question or a soft call to action that invites comments, since engagement drives Facebook reach.
- hashtags: 3 to 5 short, highly relevant hashtags, lowercase, no "#" symbol, no spaces. Facebook rewards a few precise tags, not a wall of them.
- image_prompt: 15-30 words describing a concrete, high-aesthetic photographic scene that visually represents the topic. Specify clear physical subjects, objects, setting, and atmosphere (e.g. for finance/stocks: "A modern stock trader desk with dual monitors displaying green candlestick charts, financial data, and city view at sunset"). Never use abstract words like tips, advice, ideas, or message.
- Output ONLY the JSON object. No markdown fences, no commentary.`;

const TIMEOUT_MS = 20_000;

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object in response");
  return JSON.parse(text.slice(start, end + 1));
}

function parseContent(raw: string): GeneratedContent {
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("Malformed generation payload");
  const o = parsed as Record<string, unknown>;
  if (
    typeof o.title !== "string" ||
    typeof o.description !== "string" ||
    !Array.isArray(o.hashtags) ||
    !o.hashtags.every((h) => typeof h === "string")
  ) {
    throw new Error("Malformed generation payload");
  }
  return {
    title: o.title.trim(),
    description: o.description.trim(),
    hashtags: (o.hashtags as string[]).map((h) => h.replace(/^#/, "").trim()).filter(Boolean),
    image_prompt: typeof o.image_prompt === "string" && o.image_prompt.trim() ? o.image_prompt.trim() : undefined,
  };
}

/** Shared call shape for OpenAI-compatible endpoints (Groq, OpenAI, OpenRouter, Pollinations). */
async function chatCompletion(
  url: string,
  model: string,
  topic: string,
  systemPrompt: string,
  apiKey?: string,
  extraHeaders?: Record<string, string>,
  responseFormatJson?: boolean
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...(extraHeaders ?? {}),
    },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      ...(responseFormatJson ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Topic: ${topic}` },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const host = new URL(url).host;
  const body = await res.text();
  if (!res.ok) throw new Error(`${host} responded ${res.status}: ${body.slice(0, 150)}`);

  const data = JSON.parse(body);
  if (data?.error) {
    const message = typeof data.error === "string" ? data.error : data.error?.message;
    throw new Error(`${host}: ${message ?? "unknown error"}`);
  }

  const content: unknown = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Empty completion");
  return content;
}

async function geminiCompletion(topic: string, apiKey: string, systemPrompt: string): Promise<string> {
  const models = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-2.5-flash"];
  let lastErr: Error | null = null;

  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: `Topic: ${topic}` }] }],
            generationConfig: { temperature: 0.9, responseMimeType: "application/json" },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        }
      );

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`${model} responded ${res.status}: ${errText.slice(0, 150)}`);
      }
      const data = await res.json();
      const content: unknown = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof content !== "string" || !content.trim()) throw new Error("Empty completion");
      return content;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw lastErr ?? new Error("Gemini failed for all models");
}

function template(topic: string): GeneratedContent {
  const clean = topic.trim();
  const words = clean.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  return {
    title: `${clean} — worth a look today`,
    description: `We put together a few ideas around ${clean.toLowerCase()}. Simple things you can actually try this week. Which one would you start with?`,
    hashtags: [...new Set(words)].concat(["ideas"]).slice(0, 5),
    image_prompt: `A professional, clean aesthetic photography scene representing ${clean}, beautiful lighting, high detail, sharp focus`,
  };
}

type Attempt = { provider: ContentProvider; run: () => Promise<string> };

async function buildProviderChain(topic: string, customPrompt?: string): Promise<Attempt[]> {
  const chain: Attempt[] = [];

  let settings = null;
  try {
    settings = await getSettings();
  } catch {}

  const systemPrompt = customPrompt || settings?.system_prompt || DEFAULT_SYSTEM_PROMPT;

  const geminiKey = settings?.gemini_api_key || env.geminiApiKey;
  const groqKey = settings?.groq_api_key || env.groqApiKey;
  const openaiKey = settings?.openai_api_key || env.openaiApiKey;
  const openrouterKey = settings?.openrouter_api_key || env.openrouterApiKey;

  const geminiEnabled = settings?.gemini_enabled ?? Boolean(geminiKey);
  const groqEnabled = settings?.groq_enabled ?? Boolean(groqKey);
  const openaiEnabled = settings?.openai_enabled ?? Boolean(openaiKey);
  const openrouterEnabled = settings?.openrouter_enabled ?? Boolean(openrouterKey);

  const selectedProvider = settings?.ai_provider || "auto";

  // Provider Runners
  const geminiAttempt: Attempt = {
    provider: "gemini",
    run: () => geminiCompletion(topic, geminiKey, systemPrompt),
  };

  const groqAttempt: Attempt = {
    provider: "groq",
    run: async () => {
      const models = ["llama-3.3-70b-versatile", "qwen/qwen3.8-27b", "openai/gpt-oss-120b"];
      let lastErr: Error | null = null;
      for (const model of models) {
        try {
          return await chatCompletion(
            "https://api.groq.com/openai/v1/chat/completions",
            model,
            topic,
            systemPrompt,
            groqKey,
            undefined,
            true
          );
        } catch (e) {
          lastErr = e instanceof Error ? e : new Error(String(e));
        }
      }
      throw lastErr ?? new Error("Groq failed for all models");
    },
  };

  const openaiAttempt: Attempt = {
    provider: "openai",
    run: () =>
      chatCompletion(
        "https://api.openai.com/v1/chat/completions",
        "gpt-4o-mini",
        topic,
        systemPrompt,
        openaiKey,
        undefined,
        true
      ),
  };

  const openrouterAttempt: Attempt = {
    provider: "openrouter",
    run: () =>
      chatCompletion(
        "https://openrouter.ai/api/v1/chat/completions",
        "meta-llama/llama-3.3-70b-instruct",
        topic,
        systemPrompt,
        openrouterKey,
        {
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Facebook Auto Bot",
        }
      ),
  };

  const pollinationsAttempt: Attempt = {
    provider: "pollinations",
    run: () =>
      chatCompletion(
        "https://text.pollinations.ai/openai",
        "openai-fast",
        topic,
        systemPrompt
      ),
  };

  // If a specific provider was chosen by user
  if (selectedProvider === "gemini" && geminiKey && geminiEnabled) {
    chain.push(geminiAttempt);
  } else if (selectedProvider === "groq" && groqKey && groqEnabled) {
    chain.push(groqAttempt);
  } else if (selectedProvider === "openai" && openaiKey && openaiEnabled) {
    chain.push(openaiAttempt);
  } else if (selectedProvider === "openrouter" && openrouterKey && openrouterEnabled) {
    chain.push(openrouterAttempt);
  }

  // Next, if "auto" or as fallbacks:
  if (geminiKey && geminiEnabled && !chain.includes(geminiAttempt)) {
    chain.push(geminiAttempt);
  }
  if (groqKey && groqEnabled && !chain.includes(groqAttempt)) {
    chain.push(groqAttempt);
  }
  if (openaiKey && openaiEnabled && !chain.includes(openaiAttempt)) {
    chain.push(openaiAttempt);
  }
  if (openrouterKey && openrouterEnabled && !chain.includes(openrouterAttempt)) {
    chain.push(openrouterAttempt);
  }

  // Free community fallback
  chain.push(pollinationsAttempt);

  return chain;
}

export async function generateContent(
  topic: string,
  customPrompt?: string
): Promise<GeneratedContent> {
  const failures: string[] = [];
  const chain = await buildProviderChain(topic, customPrompt);

  for (const { provider, run } of chain) {
    try {
      return { ...parseContent(await run()), provider };
    } catch (err) {
      failures.push(`${provider}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.warn("[generateContent] every provider failed:", failures.join(" | "));
  return { ...template(topic), provider: "template", providerError: failures[0] };
}
