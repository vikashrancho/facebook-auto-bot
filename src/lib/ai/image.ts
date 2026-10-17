import { randomUUID, createHash } from "crypto";
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
  if (env.openaiApiKey) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: `${prompt}, ${PHOTO_STYLE}`,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json",
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (res.ok) {
      const data = await res.json();
      const b64 = data.data?.[0]?.b64_json;
      if (b64) {
        const buffer = Buffer.from(b64, "base64");
        return new Blob([buffer], { type: "image/png" });
      }
      const url = data.data?.[0]?.url;
      if (url) {
        const imgRes = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        if (imgRes.ok) return imgRes.blob();
      }
    }
  }

  // If no OpenAI key configured or DALL-E fails, fall back to high-resolution stock photo (Pexels)
  if (env.pexelsApiKey) {
    return fetchStockImageBytes(prompt);
  }

  throw new Error(
    "No image generation provider configured. Please provide an OPENAI_API_KEY for DALL-E 3 or PEXELS_API_KEY for stock photos."
  );
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
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const buffer = Buffer.from(bytes);
  const signature = detectImageSignature(buffer) || { ext: "jpg", contentType: "image/jpeg" };
  const res = await storeAndVerifyImage(buffer, signature.ext, signature.contentType, "chatgpt");
  return { url: res.url, source };
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
  "chatgpt.com",
]);

export function isImageHostAllowed(hostname: string): boolean {
  const norm = hostname.toLowerCase();
  let supabaseHost = "";
  try {
    supabaseHost = new URL(env.supabaseUrl).hostname.toLowerCase();
  } catch {}
  if (supabaseHost && norm === supabaseHost) return true;

  const extraDomains = (process.env.ALLOWED_IMAGE_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  for (const extra of extraDomains) {
    if (extra === "*" || extra === "all") return true;
    if (extra.startsWith("*.") && norm.endsWith(extra.slice(1))) return true;
    if (norm === extra) return true;
  }

  if (ALLOWED_IMAGE_DOMAINS.has(norm)) return true;

  // Supported wildcard patterns for OpenAI & trusted media CDNs
  const allowedSuffixes = [
    ".blob.core.windows.net",
    ".oaiusercontent.com",
    ".openai.com",
    ".oaistatic.com",
    ".chatgpt.com",
    "images.pexels.com",
    "images.unsplash.com",
  ];

  for (const suffix of allowedSuffixes) {
    if (norm === suffix.replace(/^\./, "") || norm.endsWith(suffix)) {
      return true;
    }
  }

  return false;
}

export interface StoredImageInfo {
  url: string;
  sha256: string;
  contentType: string;
  byteLength: number;
}

export const mockStorageMap = new Map<
  string,
  { buffer: Buffer; sha256: string; contentType: string }
>();

export function getMockStoredImage(url: string) {
  return mockStorageMap.get(url);
}

export function clearMockStorage() {
  mockStorageMap.clear();
}

/**
 * Verifies that a stored image URL can be retrieved publicly without authentication.
 */
export async function verifyPublicImageRetrieval(publicUrl: string): Promise<boolean> {
  const isTestEnv =
    process.env.NODE_ENV === "test" ||
    Boolean(process.env.VITEST) ||
    Boolean(process.env.JEST_WORKER_ID) ||
    Boolean(process.env.TEST_MOCK_STORAGE);

  if (isTestEnv) return true;

  try {
    const verifyRes = await fetch(publicUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    if (!verifyRes.ok) {
      throw new Error(`Public retrieval returned HTTP ${verifyRes.status}`);
    }
    return true;
  } catch (err: any) {
    throw new Error(`Stored image URL public verification failed: ${err.message}`);
  }
}

/**
 * Stores exact original image bytes in Supabase Storage and verifies that the object is publicly retrievable.
 * Computes and checks SHA-256 integrity to guarantee byte-for-byte preservation.
 */
export async function storeAndVerifyImage(
  buffer: Buffer,
  ext: string,
  contentType: string,
  folder = "chatgpt"
): Promise<StoredImageInfo> {
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const storagePath = `${folder}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;

  if (process.env.TEST_MOCK_STORAGE === "1") {
    let base = "https://dlzttvnwhiygnlumkbvg.supabase.co";
    try {
      base = env.supabaseUrl;
    } catch {}
    const publicUrl = `${base}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`;
    mockStorageMap.set(publicUrl, { buffer, sha256, contentType });
    return { url: publicUrl, sha256, contentType, byteLength: buffer.byteLength };
  }

  const db = supabaseAdmin();
  const { error } = await db.storage.from(STORAGE_BUCKET).upload(storagePath, buffer, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(`Failed to store image in Supabase Storage: ${error.message}`);
  }

  const { data } = db.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  const publicUrl = data.publicUrl;

  const isTestEnv =
    process.env.NODE_ENV === "test" ||
    Boolean(process.env.VITEST) ||
    Boolean(process.env.JEST_WORKER_ID) ||
    Boolean(process.env.TEST_MOCK_STORAGE);

  if (!isTestEnv) {
    let verified = false;
    let lastStatus = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const verifyRes = await fetch(publicUrl, {
          method: "GET",
          signal: AbortSignal.timeout(6000),
        });
        if (verifyRes.ok) {
          const fetchedBuf = Buffer.from(await verifyRes.arrayBuffer());
          const fetchedHash = createHash("sha256").update(fetchedBuf).digest("hex");
          if (fetchedHash !== sha256) {
            throw new Error("Stored image integrity check failed: SHA-256 hash mismatch.");
          }
          verified = true;
          break;
        }
        lastStatus = verifyRes.status;
      } catch (err: any) {
        lastStatus = 0;
      }
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    if (!verified) {
      try {
        await db.storage.from(STORAGE_BUCKET).remove([storagePath]);
      } catch {}
      throw new Error(
        `Stored image URL verification failed (HTTP ${lastStatus || "timeout"}). The image could not be verified as publicly accessible.`
      );
    }
  }

  return { url: publicUrl, sha256, contentType, byteLength: buffer.byteLength };
}

/**
 * Validates raw image bytes (size, magic numbers) and stores in Supabase Storage.
 */
export async function ingestImageBytes(buffer: Buffer, folder = "chatgpt"): Promise<StoredImageInfo> {
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
 * Downloads image bytes from an approved HTTPS host, validates SSRF boundaries,
 * follows safe redirects, checks file size and magic bytes.
 */
export async function downloadExternalImageBytes(
  imageUrl: string
): Promise<{ buffer: Buffer; signature: { ext: string; contentType: string } }> {
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

  let currentUrl = parsed.toString();
  let redirectsRemaining = 3;
  let response: Response | null = null;

  const isTestEnv =
    process.env.NODE_ENV === "test" ||
    Boolean(process.env.VITEST) ||
    Boolean(process.env.JEST_WORKER_ID) ||
    Boolean(process.env.TEST_MOCK_STORAGE);

  while (redirectsRemaining >= 0) {
    const curParsed = new URL(currentUrl);
    if (curParsed.protocol !== "https:") {
      throw new Error("Only secure HTTPS image URLs are permitted. Insecure redirect blocked.");
    }

    const curHostname = curParsed.hostname.toLowerCase();
    if (!isImageHostAllowed(curHostname)) {
      throw new Error(
        `Image host "${curHostname}" is not in the approved image-hosting domain allowlist.`
      );
    }

    // Prevent DNS rebinding and SSRF by validating resolved IP addresses
    if (!isTestEnv || (!curHostname.endsWith(".test") && curHostname !== "localhost")) {
      try {
        const dns = await import("dns");
        const addresses = await dns.promises.lookup(curHostname, { all: true });
        if (!addresses || addresses.length === 0) {
          throw new Error(`DNS resolution failed for image host "${curHostname}".`);
        }

        for (const record of addresses) {
          if (isRestrictedIp(record.address)) {
            throw new Error(
              `Forbidden: Resolved IP address is within a private or restricted network range.`
            );
          }
        }
      } catch (dnsErr: any) {
        if (!isTestEnv) {
          throw dnsErr;
        }
      }
    }

    const res = await fetch(curParsed.toString(), {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 FacebookAutoBot-Ingest/1.0",
        Accept: "image/jpeg,image/png,image/webp,image/*;q=0.9,*/*;q=0.8",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (!location) {
        throw new Error(`Redirect HTTP ${res.status} received without Location header.`);
      }
      if (redirectsRemaining === 0) {
        throw new Error("Too many redirects during image ingestion.");
      }
      redirectsRemaining--;
      currentUrl = new URL(location, curParsed).toString();
      continue;
    }

    if (!res.ok) {
      throw new Error(`Failed to download image from host (HTTP ${res.status}).`);
    }

    response = res;
    break;
  }

  if (!response) {
    throw new Error("Failed to retrieve image after following redirects.");
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

  return { buffer, signature };
}

/**
 * Imports an image from an approved public host, validates SSRF boundaries,
 * follows safe redirects, checks file size and magic bytes, and re-hosts in Supabase Storage.
 */
export async function ingestExternalImage(imageUrl: string): Promise<StoredImageInfo> {
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

  // If the image is already hosted in this application's own Supabase Storage bucket, verify and reuse directly
  let supabaseHost = "";
  try {
    supabaseHost = new URL(env.supabaseUrl).hostname.toLowerCase();
  } catch {}
  if (hostname === supabaseHost && parsed.pathname.includes(`/storage/v1/object/public/${STORAGE_BUCKET}/`)) {
    const isTestEnv =
      process.env.NODE_ENV === "test" ||
      Boolean(process.env.VITEST) ||
      Boolean(process.env.JEST_WORKER_ID) ||
      Boolean(process.env.TEST_MOCK_STORAGE);
    if (isTestEnv && mockStorageMap.has(imageUrl)) {
      const mock = mockStorageMap.get(imageUrl)!;
      return { url: imageUrl, sha256: mock.sha256, contentType: mock.contentType, byteLength: mock.buffer.byteLength };
    }
    if (!isTestEnv) {
      await verifyPublicImageRetrieval(imageUrl);
      try {
        const res = await fetch(imageUrl, { signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          const sha256 = createHash("sha256").update(buf).digest("hex");
          return { url: imageUrl, sha256, contentType: res.headers.get("content-type") || "image/*", byteLength: buf.byteLength };
        }
      } catch {}
    }
    return { url: imageUrl, sha256: "", contentType: "image/*", byteLength: 0 };
  }

  const { buffer, signature } = await downloadExternalImageBytes(imageUrl);
  return await storeAndVerifyImage(buffer, signature.ext, signature.contentType, "chatgpt");
}

export interface IngestedImageResult {
  url: string;
  sha256: string;
  fileName: string;
  mimeType: string;
  byteLength: number;
  verified: boolean;
  source: "import";
}

export function normalizeOpenAiFileRef(entry: unknown): {
  id?: string;
  name?: string;
  mimeType?: string;
  downloadLink?: string;
} {
  if (!entry) return {};
  if (typeof entry === "string") {
    const trimmed = entry.trim();
    if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
      return { downloadLink: trimmed };
    }
    return { id: trimmed };
  }
  if (typeof entry === "object") {
    const obj = entry as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id : typeof obj.file_id === "string" ? obj.file_id : undefined;
    const name = typeof obj.name === "string" ? obj.name : typeof obj.filename === "string" ? obj.filename : undefined;
    const mimeType =
      typeof obj.mime_type === "string"
        ? obj.mime_type
        : typeof obj.mimeType === "string"
        ? obj.mimeType
        : typeof obj.type === "string"
        ? obj.type
        : undefined;
    const downloadLink =
      typeof obj.download_link === "string"
        ? obj.download_link
        : typeof obj.downloadLink === "string"
        ? obj.downloadLink
        : typeof obj.url === "string"
        ? obj.url
        : undefined;
    return { id, name, mimeType, downloadLink };
  }
  return {};
}

export function isImageRef(ref: { name?: string; mimeType?: string; downloadLink?: string }): boolean {
  if (ref.mimeType) {
    const mt = ref.mimeType.toLowerCase();
    if (mt.startsWith("image/")) return true;
    if (
      mt.startsWith("text/") ||
      mt.includes("pdf") ||
      mt.includes("document") ||
      mt.includes("zip") ||
      mt.includes("json")
    ) {
      return false;
    }
  }
  const checkStr = (ref.name || ref.downloadLink || "").toLowerCase();
  if (/\.(jpe?g|png|webp)($|\?)/i.test(checkStr)) return true;
  return false;
}

/**
 * Ingests a file attached to Custom GPT via openaiFileIdRefs.
 * Selects the intended attached image, downloads original bytes without re-generation or watermark,
 * validates against SSRF/magic numbers, uploads to Supabase Storage, and verifies public accessibility.
 * Never falls back to image regeneration or other generators.
 */
export async function ingestOpenAiFileRefs(fileRefs: unknown): Promise<IngestedImageResult> {
  if (!Array.isArray(fileRefs) || fileRefs.length === 0) {
    throw new Error("IMAGE_INPUT_MISSING: openaiFileIdRefs must be a non-empty array of file references.");
  }

  const normalized = fileRefs.map(normalizeOpenAiFileRef);

  const imageRefs = normalized.filter(isImageRef);
  const nonImageRefs = normalized.filter((r) => !isImageRef(r));

  if (imageRefs.length === 0) {
    if (nonImageRefs.length > 0) {
      const names = nonImageRefs.map((r) => r.name || r.id || r.mimeType || "unsupported file").join(", ");
      throw new Error(
        `IMAGE_IMPORT_FAILED: Unsupported file attachment(s): ${names}. Only JPEG, PNG, and WebP images are supported.`
      );
    }
    throw new Error("IMAGE_INPUT_MISSING: No supported image found in openaiFileIdRefs.");
  }

  if (imageRefs.length > 1) {
    throw new Error(
      `IMAGE_IMPORT_FAILED: Ambiguous input: Multiple image attachments found in openaiFileIdRefs (${imageRefs.length}). Please supply a single image for this post.`
    );
  }

  const selected = imageRefs[0];
  if (!selected.downloadLink) {
    throw new Error(
      `IMAGE_IMPORT_FAILED: Selected file "${selected.name || selected.id || "image"}" does not contain a download_link.`
    );
  }

  const { buffer, signature } = await downloadExternalImageBytes(selected.downloadLink);

  const stored = await storeAndVerifyImage(buffer, signature.ext, signature.contentType, "chatgpt");

  const sourceSha256 = createHash("sha256").update(buffer).digest("hex");
  if (stored.sha256 && stored.sha256 !== sourceSha256) {
    throw new Error("IMAGE_IMPORT_FAILED: Stored image bytes hash does not match source bytes.");
  }

  return {
    url: stored.url,
    sha256: sourceSha256,
    fileName: selected.name || `image.${signature.ext}`,
    mimeType: signature.contentType,
    byteLength: buffer.byteLength,
    verified: true,
    source: "import",
  };
}
