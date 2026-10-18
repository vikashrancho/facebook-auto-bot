import crypto from "crypto";
import { env } from "../env";

/**
 * Timing-safe string comparison to protect against timing attacks.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) {
    // Execute comparison against dummy buffer to mitigate execution-time leakage
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Validates Machine-to-Machine Bearer authentication for ChatGPT Actions.
 * Fails closed if INTEGRATION_API_KEY is unset or empty.
 * Never accepts the dashboard session cookie as a substitute.
 */
export function validateIntegrationAuth(req: Request): boolean {
  const expectedKey = env.integrationApiKeyOptional;
  if (!expectedKey || expectedKey.trim().length === 0) {
    // Fail closed: if key is not configured, deny all M2M access
    return false;
  }

  let providedKey = "";
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    providedKey = authHeader.slice(7).trim();
  } else {
    const customHeader = req.headers.get("x-integration-key") || req.headers.get("x-api-key");
    if (customHeader) {
      providedKey = customHeader.trim();
    }
  }

  if (!providedKey) {
    return false;
  }

  return timingSafeEqualString(providedKey, expectedKey);
}

/**
 * Computes a deterministic SHA-256 hash of the post content and targeting parameters.
 * Used to cryptographically bind the user's manual approval to the exact post payload.
 */
export function computePostContentHash(input: {
  postId: string;
  title: string;
  description: string;
  hashtags: string[];
  imageUrl: string;
  pageId: string;
  linkUrl?: string | null;
  utmSuffix?: string | null;
}): string {
  const normTags = (input.hashtags || [])
    .map((t) => t.trim().toLowerCase().replace(/^#/, ""))
    .filter(Boolean)
    .sort()
    .join(",");
  const normLink = (input.linkUrl || "").trim();
  const normUtm = (input.utmSuffix || "").trim();
  const payload = [
    input.postId.trim(),
    input.title.trim(),
    input.description.trim(),
    normTags,
    normLink,
    input.imageUrl.trim(),
    input.pageId.trim(),
    normUtm,
  ].join("|");

  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * Server-side approval record interface.
 */
export interface ApprovalRecord {
  nonce: string;
  postId: string;
  contentHash: string;
  expiresAt: number;
  approvedAt: number;
  usedAt: number | null;
}

export class StoragePersistenceError extends Error {
  status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.name = "StoragePersistenceError";
    this.status = status;
  }
}

// In-memory registry of server-issued approval tokens (strictly test-only mock harness)
const approvalRegistry = new Map<string, ApprovalRecord>();
let testMockStorageEnabled = false;

/**
 * Explicit test-only hook for unit test environments.
 * In production, this is strictly false and shared database storage is enforced.
 */
export function enableTestMockStorage(enable: boolean = true): void {
  testMockStorageEnabled = enable;
}

export function isTestMockStorageEnabled(): boolean {
  return testMockStorageEnabled;
}

/**
 * Registers an approval record in the server-side test registry.
 */
export function registerApproval(record: ApprovalRecord): void {
  approvalRegistry.set(record.nonce, record);
}

/**
 * Retrieves an approval record by nonce (test only).
 */
export function getApprovalRecord(nonce: string): ApprovalRecord | undefined {
  return approvalRegistry.get(nonce);
}

/**
 * Clears the approval registry (used in automated tests).
 */
export function resetApprovalRegistry(): void {
  approvalRegistry.clear();
}

/**
 * Persists an approval record to shared Supabase storage. Fails closed.
 * Never issues an approval token unless its record has been successfully persisted.
 */
async function persistApprovalRecord(record: ApprovalRecord): Promise<void> {
  if (testMockStorageEnabled) {
    registerApproval(record);
    return;
  }

  try {
    const { supabaseAdmin } = await import("../supabase/server");
    const db = supabaseAdmin();
    const { error } = await db.from("approval_tokens").insert({
      nonce: record.nonce,
      post_id: record.postId,
      content_hash: record.contentHash,
      expires_at: new Date(record.expiresAt).toISOString(),
      used_at: record.usedAt ? new Date(record.usedAt).toISOString() : null,
    });

    if (error) {
      throw new StoragePersistenceError(
        `Failed to persist approval token to shared database: ${error.message}`,
        503
      );
    }
  } catch (err) {
    if (err instanceof StoragePersistenceError) throw err;
    throw new StoragePersistenceError(
      `Shared approval storage unavailable: ${err instanceof Error ? err.message : String(err)}`,
      503
    );
  }
}

/**
 * Issues a server-enforced, short-lived, single-use approval token.
 * Default TTL is 10 minutes (600 seconds).
 */
export async function issueApprovalToken(params: {
  postId: string;
  contentHash: string;
  ttlSeconds?: number;
}): Promise<{ token: string; expiresAt: number; nonce: string }> {
  const ttl = (params.ttlSeconds ?? 600) * 1000;
  const now = Date.now();
  const expiresAt = now + ttl;
  const nonce = crypto.randomUUID();

  const record: ApprovalRecord = {
    nonce,
    postId: params.postId,
    contentHash: params.contentHash,
    approvedAt: now,
    expiresAt,
    usedAt: null,
  };

  await persistApprovalRecord(record);

  const payload = {
    type: "user_approval",
    postId: params.postId,
    contentHash: params.contentHash,
    nonce,
    approvedAt: now,
    expiresAt,
  };

  const b64 = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  const secret = env.integrationApiKeyOptional || env.sessionSecret;
  const hmac = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
  const token = `${b64}.${hmac}`;

  return { token, expiresAt, nonce };
}

export interface VerificationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Cryptographically verifies and optionally consumes a server-enforced approval token.
 * 
 * When options.consume is false (e.g. during a dry-run):
 * - Validates cryptographic signature, post ID, content hash, expiration, and ensures token is not already used.
 * - Does NOT mark the token as consumed.
 * 
 * When options.consume is true (e.g. during real publication):
 * - Atomically marks the token as consumed in shared database storage and in-memory registry.
 */
export async function verifyAndConsumeApprovalToken(
  token: string,
  expectedPostId: string,
  currentContentHash: string,
  options: { consume?: boolean } = { consume: true }
): Promise<VerificationResult> {
  if (!token || typeof token !== "string") {
    return { valid: false, reason: "Approval token is missing or malformed." };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, reason: "Malformed token format." };
  }

  const [b64, hmac] = parts;
  const secret = env.integrationApiKeyOptional || env.sessionSecret;
  const expectedHmac = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
  if (!timingSafeEqualString(hmac, expectedHmac)) {
    return { valid: false, reason: "Forged or invalid cryptographic signature." };
  }

  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf-8"));
  } catch {
    return { valid: false, reason: "Corrupted token payload." };
  }

  if (payload.type !== "user_approval") {
    return {
      valid: false,
      reason: "Token is not a user approval token. Staging signatures cannot authorize publication.",
    };
  }

  if (payload.postId !== expectedPostId) {
    return { valid: false, reason: "Approval token does not match the requested post ID." };
  }

  if (payload.contentHash !== currentContentHash) {
    return {
      valid: false,
      reason:
        "Post content has been modified since approval was granted. Please re-review and approve again.",
    };
  }

  const now = Date.now();
  if (now > payload.expiresAt) {
    return {
      valid: false,
      reason: "Approval token has expired. Approvals are short-lived. Please approve again.",
    };
  }

  const shouldConsume = options.consume !== false;

  // In production (testMockStorageEnabled === false), verification MUST use shared Supabase database.
  // Fails closed if shared database is missing, disconnected, or throws an error.
  if (!testMockStorageEnabled) {
    try {
      const { supabaseAdmin } = await import("../supabase/server");
      const db = supabaseAdmin();
      const nowIso = new Date(now).toISOString();

      if (!shouldConsume) {
        // Dry-run mode: check record without consuming
        const { data: dbRecord, error: dbError } = await db
          .from("approval_tokens")
          .select("*")
          .eq("nonce", payload.nonce)
          .maybeSingle();

        if (dbError) {
          return {
            valid: false,
            reason: `Shared approval storage unavailable for dry-run verification: ${dbError.message}`,
          };
        }
        if (!dbRecord) {
          return { valid: false, reason: "Approval record not found in database or has expired." };
        }
        if (dbRecord.post_id !== expectedPostId || dbRecord.content_hash !== currentContentHash) {
          return { valid: false, reason: "Post content does not match database approval record." };
        }
        if (new Date(dbRecord.expires_at).getTime() < now) {
          return { valid: false, reason: "Approval token has expired. Approvals are short-lived. Please approve again." };
        }
        if (dbRecord.used_at !== null) {
          return { valid: false, reason: "Approval token has already been used. Approvals are strictly single-use." };
        }
        return { valid: true };
      } else {
        // Real publication mode: atomic conditional update
        const { data: claimedRows, error: claimError } = await db
          .from("approval_tokens")
          .update({ used_at: nowIso })
          .eq("nonce", payload.nonce)
          .eq("post_id", expectedPostId)
          .eq("content_hash", currentContentHash)
          .gt("expires_at", nowIso)
          .is("used_at", null)
          .select("nonce");

        if (claimError) {
          return {
            valid: false,
            reason: `Shared approval storage unavailable for publication claim: ${claimError.message}`,
          };
        }

        if (claimedRows && claimedRows.length > 0) {
          return { valid: true };
        }

        // Atomic claim matched 0 rows. Query the row to diagnose why it was rejected.
        const { data: existingRecord, error: fetchError } = await db
          .from("approval_tokens")
          .select("used_at, expires_at, post_id, content_hash")
          .eq("nonce", payload.nonce)
          .maybeSingle();

        if (fetchError || !existingRecord) {
          return { valid: false, reason: "Approval record not found on server or database." };
        }
        if (existingRecord.used_at !== null) {
          return { valid: false, reason: "Approval token has already been used. Approvals are strictly single-use." };
        }
        if (new Date(existingRecord.expires_at).getTime() <= now) {
          return { valid: false, reason: "Approval token has expired. Approvals are short-lived. Please approve again." };
        }
        return { valid: false, reason: "Approval record does not match post content or destination ID." };
      }
    } catch (err) {
      return {
        valid: false,
        reason: `Shared database connection failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Strictly test-only fallback: only reached when testMockStorageEnabled === true
  const record = approvalRegistry.get(payload.nonce);
  if (!record) {
    return {
      valid: false,
      reason: "Approval record not found on server or has expired from registry.",
    };
  }

  if (record.usedAt !== null) {
    return {
      valid: false,
      reason: "Approval token has already been used. Approvals are strictly single-use.",
    };
  }

  if (shouldConsume) {
    record.usedAt = now;
  }

  return { valid: true };
}

/**
 * Compensating transaction: resets used_at back to null ONLY IF the post claim failed
 * BEFORE any network call to Facebook was made, AND the post has NOT already been published.
 *
 * Fails closed: if the database call fails or post status is 'posted' or 'publishing',
 * the token remains consumed.
 */
export async function releaseUnpublishedApprovalToken(
  nonce: string,
  postId: string,
  options?: { postStatus?: string }
): Promise<{ released: boolean; reason?: string }> {
  if (testMockStorageEnabled) {
    if (options?.postStatus === "posted") {
      return { released: false, reason: "Post is already published to Facebook. Token remains consumed." };
    }
    if (options?.postStatus === "publishing") {
      return { released: false, reason: "Another attempt is currently publishing. Token remains consumed." };
    }
    const record = approvalRegistry.get(nonce);
    if (!record || record.postId !== postId) {
      return { released: false, reason: "Approval record not found or post ID mismatch." };
    }
    record.usedAt = null;
    return { released: true };
  }

  try {
    const { supabaseAdmin } = await import("../supabase/server");
    const db = supabaseAdmin();

    // 1. Verify post state: if already posted or currently in flight, do not release token
    const { data: post, error: postError } = await db
      .from("posts")
      .select("status")
      .eq("id", postId)
      .maybeSingle();

    if (postError) {
      // Fail closed: do not unconsume if we cannot verify post status
      return { released: false, reason: `Failed to verify post state: ${postError.message}` };
    }

    if (!post) {
      return { released: false, reason: "Post not found." };
    }

    if (post.status === "posted") {
      return { released: false, reason: "Post is already published to Facebook. Token remains consumed." };
    }

    if (post.status === "publishing") {
      return { released: false, reason: "Another attempt is currently publishing. Token remains consumed." };
    }

    // 2. Conditionally update approval_tokens inspecting { error, data }
    const { data: updatedRows, error: updateError } = await db
      .from("approval_tokens")
      .update({ used_at: null })
      .eq("nonce", nonce)
      .eq("post_id", postId)
      .not("used_at", "is", null)
      .select("nonce");

    if (updateError) {
      // Fail closed: return failure rather than silently ignoring DB error
      return { released: false, reason: `Database error during compensation: ${updateError.message}` };
    }

    if (!updatedRows || updatedRows.length === 0) {
      return { released: false, reason: "No consumed token row matched for compensation." };
    }

    return { released: true };
  } catch (err) {
    // Fail closed
    return {
      released: false,
      reason: `Unexpected compensation exception: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Legacy staging token creation (kept for backward compatibility or staging reference).
 * Note: Staging tokens lack type: "user_approval" and will be rejected by verifyAndConsumeApprovalToken.
 */
export function createApprovalToken(payload: {
  postId: string;
  contentHash: string;
}): string {
  const raw = JSON.stringify(payload);
  const b64 = Buffer.from(raw, "utf-8").toString("base64url");
  const secret = env.integrationApiKeyOptional || env.sessionSecret;
  const hmac = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
  return `${b64}.${hmac}`;
}

/**
 * Legacy token verification (without single-use consumption).
 */
export function verifyApprovalToken(
  token: string,
  expectedPostId: string,
  expectedContentHash: string
): boolean {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [b64, hmac] = parts;
  const secret = env.integrationApiKeyOptional || env.sessionSecret;
  const expectedHmac = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
  if (!timingSafeEqualString(hmac, expectedHmac)) {
    return false;
  }
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf-8"));
    return (
      payload.postId === expectedPostId &&
      payload.contentHash === expectedContentHash
    );
  } catch {
    return false;
  }
}
