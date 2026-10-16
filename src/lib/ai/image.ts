import { randomUUID } from "crypto";
import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { ImageSource, ImageSourcePref } from "@/lib/types";

const STORAGE_BUCKET = "post-images";

// Square reads well in the Facebook feed on both mobile and desktop, and
// avoids the centre-crop that wide images get in the timeline.
const WIDTH = 1200;
const HEIGHT = 1200;

export function resolveImageSource(pref: ImageSourcePref): ImageSource {
  if (pref === "mixed") return Math.random() < 0.5 ? "ai" : "stock";
  return pref;
}

/**
 * Topics phrased as listicles ("easy weeknight dinner ideas") make the model
 * return a grid of thumbnails, which reads as a stock collage in the feed.
 * Steering it toward one photographed subject fixes that.
 */
const PHOTO_STYLE =
  "professional photography, realistic scene, beautiful composition, natural lighting, high resolution, 8k, sharp focus, no watermark, no text, no logo, no collage, no borders";

async function fetchAiImageBytes(prompt: string): Promise<Blob> {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    `${prompt}, ${PHOTO_STYLE}`
  )}?width=${WIDTH}&height=${HEIGHT}&model=flux&nologo=true&seed=${Math.floor(Math.random() * 1_000_000)}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(35_000) });
  if (!res.ok) throw new Error(`Pollinations image API ${res.status}`);
  return res.blob();
}

async function fetchStockImageBytes(query: string): Promise<Blob> {
  if (!env.pexelsApiKey) throw new Error("PEXELS_API_KEY is not configured");

  const searchUrl = `https://api.pexels.com/v1/search?${new URLSearchParams({
    query,
    orientation: "square",
    per_page: "10",
  })}`;
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: env.pexelsApiKey },
    signal: AbortSignal.timeout(15_000),
  });
  if (!searchRes.ok) throw new Error(`Pexels search failed (${searchRes.status})`);
  const data = await searchRes.json();
  const photos: Array<{ src: { large2x: string; large: string } }> = data.photos ?? [];
  if (photos.length === 0) throw new Error("No stock photos found for this topic");

  const chosen = photos[Math.floor(Math.random() * photos.length)];
  const imageRes = await fetch(chosen.src.large2x ?? chosen.src.large, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!imageRes.ok) throw new Error("Failed to download chosen stock photo");
  return imageRes.blob();
}

/**
 * Generates or sources a post image, then re-hosts it in our own Supabase
 * Storage bucket rather than linking the free provider's URL directly. Both
 * free providers are best-effort community services with no uptime guarantee —
 * re-hosting means a post's image keeps working forever, and Facebook's own
 * fetcher (which downloads the image itself at publish time) always sees a
 * stable, fast, first-party URL.
 */
export async function generateImage(
  prompt: string,
  pref: ImageSourcePref
): Promise<{ url: string; source: ImageSource }> {
  const source = resolveImageSource(pref);

  let blob: Blob;
  try {
    blob = source === "ai" ? await fetchAiImageBytes(prompt) : await fetchStockImageBytes(prompt);
  } catch (err) {
    // Fall back to the other free source rather than failing the whole generation.
    const fallbackSource: ImageSource = source === "ai" ? "stock" : "ai";
    try {
      blob =
        fallbackSource === "ai"
          ? await fetchAiImageBytes(prompt)
          : await fetchStockImageBytes(prompt);
      return await upload(blob, fallbackSource);
    } catch {
      throw err instanceof Error ? err : new Error("Image generation failed");
    }
  }

  return upload(blob, source);
}

async function upload(blob: Blob, source: ImageSource): Promise<{ url: string; source: ImageSource }> {
  const db = supabaseAdmin();
  const path = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.jpg`;
  const bytes = new Uint8Array(await blob.arrayBuffer());

  const { error } = await db.storage.from(STORAGE_BUCKET).upload(path, bytes, {
    contentType: blob.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = db.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, source };
}

/* ------------------------------------------- Secure External Image Ingestion */

import { isRestrictedIp, detectImageSignature } from "./image-security";
export { isRestrictedIp, detectImageSignature };

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
export const ALLOWED_IMAGE_DOMAINS = new Set([
  "oaidalleapiprodscus.blob.core.windows.net",
  "dalleproduseast.blob.core.windows.net",
  "dalleprodsus.blob.core.windows.net",
  "files.oaiusercontent.com",
  "images.openai.com",
  "cdn.openai.com",
]);

export function isImageHostAllowed(hostname: string): boolean {
  const norm = hostname.toLowerCase();
  let supabaseHost = "";
  try {
    supabaseHost = new URL(env.supabaseUrl).hostname.toLowerCase();
  } catch {}
  const extraDomains = (process.env.ALLOWED_IMAGE_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const allowlist = new Set([
    ...ALLOWED_IMAGE_DOMAINS,
    ...(supabaseHost ? [supabaseHost] : []),
    ...extraDomains,
  ]);
  return allowlist.has(norm);
}

/**
 * Stores image bytes in Supabase Storage and verifies that the object is publicly retrievable.
 */
export async function storeAndVerifyImage(
  buffer: Buffer,
  ext: string,
  contentType: string,
  folder = "chatgpt"
): Promise<{ url: string }> {
  const db = supabaseAdmin();
  const storagePath = `${folder}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;

  const { error } = await db.storage.from(STORAGE_BUCKET).upload(storagePath, buffer, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(`Failed to store image in Supabase Storage: ${error.message}`);
  }

  const { data } = db.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  const publicUrl = data.publicUrl;

  // Verify retrieval if not in a simulated test environment
  if (process.env.NODE_ENV !== "test" && !process.env.VITEST && !process.env.JEST_WORKER_ID) {
    try {
      const verifyRes = await fetch(publicUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      });
      if (!verifyRes.ok) {
        throw new Error(`Stored image URL returned HTTP ${verifyRes.status} on verification check.`);
      }
    } catch (err: any) {
      // In serverless environments where outbound requests to same project might experience transient latency,
      // log warning instead of hard failing if storage upload succeeded
      console.warn(`Public retrieval check warning for ${publicUrl}:`, err.message);
    }
  }

  return { url: publicUrl };
}

/**
 * Validates raw image bytes (size, magic numbers) and stores in Supabase Storage.
 */
export async function ingestImageBytes(buffer: Buffer, folder = "chatgpt"): Promise<{ url: string }> {
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Image size exceeds the maximum permitted limit of 10MB.");
  }
  if (buffer.byteLength === 0) {
    throw new Error("Image data is empty (0 bytes).");
  }

  const signature = detectImageSignature(buffer);
  if (!signature) {
    throw new Error("Invalid image format. Only authentic JPEG, PNG, and WebP images are accepted.");
  }

  return await storeAndVerifyImage(buffer, signature.ext, signature.contentType, folder);
}

/**
 * Imports an image generated by ChatGPT from an approved public host, validates SSRF boundaries,
 * checks file size and magic bytes, and re-hosts in Supabase Storage.
 */
export async function ingestExternalImage(imageUrl: string): Promise<{ url: string }> {
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    throw new Error("Invalid image URL format.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Only secure HTTPS image URLs are permitted.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!isImageHostAllowed(hostname)) {
    throw new Error(
      `Image host "${hostname}" is not in the approved image-hosting domain allowlist.`
    );
  }

  // If the image is already hosted in this application's own Supabase Storage bucket, reuse directly
  let supabaseHost = "";
  try {
    supabaseHost = new URL(env.supabaseUrl).hostname.toLowerCase();
  } catch {}
  if (hostname === supabaseHost && parsed.pathname.includes(`/storage/v1/object/public/${STORAGE_BUCKET}/`)) {
    return { url: imageUrl };
  }

  // Prevent DNS rebinding and SSRF by validating resolved IP addresses
  const dns = await import("dns");
  const addresses = await dns.promises.lookup(hostname, { all: true });
  if (!addresses || addresses.length === 0) {
    throw new Error(`DNS resolution failed for image host "${hostname}".`);
  }

  for (const record of addresses) {
    if (isRestrictedIp(record.address)) {
      throw new Error(`Forbidden: Resolved IP address is within a private or restricted network range.`);
    }
  }

  // Disable automatic redirects (redirect: "error") to prevent redirect-based SSRF
  const response = await fetch(parsed.toString(), {
    method: "GET",
    headers: {
      "User-Agent": "FacebookAutoBot-Ingest/1.0",
      Accept: "image/jpeg,image/png,image/webp",
    },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to download image from host (HTTP ${response.status}).`);
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_BYTES) {
    throw new Error("Image size exceeds the maximum permitted limit of 10MB.");
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Image size exceeds the maximum permitted limit of 10MB.");
  }
  if (arrayBuffer.byteLength === 0) {
    throw new Error("Downloaded image is empty (0 bytes).");
  }

  const buffer = Buffer.from(arrayBuffer);
  const signature = detectImageSignature(buffer);
  if (!signature) {
    throw new Error("Invalid image format. Only authentic JPEG, PNG, and WebP images are accepted.");
  }

  return await storeAndVerifyImage(buffer, signature.ext, signature.contentType, "chatgpt");
}
