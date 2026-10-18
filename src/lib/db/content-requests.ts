import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { ContentRequest, ContentRequestStatus } from "@/lib/types";

export class ContentRequestsTableMissingError extends Error {
  constructor() {
    super(
      "Your database does not have the content_requests table yet. Run supabase/migrations/20261018_content_requests.sql in Supabase Dashboard > SQL Editor."
    );
  }
}

const MISSING_TABLE = new Set(["PGRST205", "42P01"]);

function raise(error: { code?: string; message: string } | null, action: string): void {
  if (!error) return;
  if (error.code && MISSING_TABLE.has(error.code)) throw new ContentRequestsTableMissingError();
  throw new Error(`Failed to ${action}: ${error.message}`);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// In-memory mock storage for safe, isolated offline testing
const mockRequestsMap = new Map<string, ContentRequest>();

export function isTestMockStorageEnabled(): boolean {
  return process.env.TEST_MOCK_STORAGE === "1";
}

export function resetMockRequests(): void {
  mockRequestsMap.clear();
}

export async function getContentRequestRecord(id: string): Promise<ContentRequest | null> {
  if (!UUID_REGEX.test(id)) return null;

  if (isTestMockStorageEnabled()) {
    return mockRequestsMap.get(id) || null;
  }

  const db = supabaseAdmin();
  const { data, error } = await db.from("content_requests").select("*").eq("id", id).maybeSingle();

  if (error) {
    if (error.code === "22P02") return null;
    raise(error, "load content request");
  }
  return data as ContentRequest | null;
}

export async function listContentRequestRecords(opts: {
  limit?: number;
  status?: ContentRequestStatus | ContentRequestStatus[];
} = {}): Promise<ContentRequest[]> {
  if (isTestMockStorageEnabled()) {
    let list = Array.from(mockRequestsMap.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    if (opts.status) {
      const allowed = Array.isArray(opts.status) ? new Set(opts.status) : new Set([opts.status]);
      list = list.filter((r) => allowed.has(r.status));
    }
    if (opts.limit) {
      list = list.slice(0, opts.limit);
    }
    return list;
  }

  const db = supabaseAdmin();
  let query = db
    .from("content_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (opts.status) {
    query = Array.isArray(opts.status)
      ? query.in("status", opts.status)
      : query.eq("status", opts.status);
  }
  if (opts.limit) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;
  if (error) {
    raise(error, "list content requests");
  }
  return (data ?? []) as ContentRequest[];
}

export async function createContentRequestRecord(input: {
  topic: string;
  platform?: string;
  contentType?: string;
  tone?: string | null;
  audience?: string | null;
  imageStyle?: string | null;
  aspectRatio?: string;
  targetPageId?: string | null;
  targetPageName?: string | null;
  userId?: string;
}): Promise<ContentRequest> {
  const insertPayload: ContentRequest = {
    id: crypto.randomUUID(),
    user_id: input.userId ?? "admin",
    platform: input.platform ?? "facebook",
    target_page_id: input.targetPageId ?? null,
    target_page_name: input.targetPageName ?? null,
    topic: input.topic.trim(),
    content_type: input.contentType ?? "Motivational",
    tone: input.tone?.trim() || null,
    audience: input.audience?.trim() || null,
    image_style: input.imageStyle?.trim() || null,
    aspect_ratio: input.aspectRatio ?? "1:1",
    status: "pending_chatgpt",
    post_id: null,
    review_url: null,
    error_message: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (isTestMockStorageEnabled()) {
    mockRequestsMap.set(insertPayload.id, insertPayload);
    return insertPayload;
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("content_requests")
    .insert({
      user_id: insertPayload.user_id,
      platform: insertPayload.platform,
      target_page_id: insertPayload.target_page_id,
      target_page_name: insertPayload.target_page_name,
      topic: insertPayload.topic,
      content_type: insertPayload.content_type,
      tone: insertPayload.tone,
      audience: insertPayload.audience,
      image_style: insertPayload.image_style,
      aspect_ratio: insertPayload.aspect_ratio,
      status: insertPayload.status,
    })
    .select()
    .single();

  if (error) {
    raise(error, "create content request");
  }
  return data as ContentRequest;
}

export async function updateContentRequestRecord(
  id: string,
  patch: Partial<ContentRequest>
): Promise<ContentRequest> {
  if (!UUID_REGEX.test(id)) throw new Error("Invalid request ID format.");

  if (isTestMockStorageEnabled()) {
    const existing = mockRequestsMap.get(id);
    if (!existing) throw new Error("Content request not found.");
    const updated = { ...existing, ...patch, updated_at: new Date().toISOString() };
    mockRequestsMap.set(id, updated);
    return updated;
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("content_requests")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    raise(error, "update content request");
  }
  return data as ContentRequest;
}

export async function markContentRequestProcessing(id: string): Promise<ContentRequest | null> {
  const existing = await getContentRequestRecord(id);
  if (!existing) return null;

  // Only transition if still pending_chatgpt
  if (existing.status === "pending_chatgpt") {
    return updateContentRequestRecord(id, { status: "processing" });
  }
  return existing;
}

export async function markContentRequestDraftCreated(
  id: string,
  postId: string,
  reviewUrl: string
): Promise<ContentRequest> {
  return updateContentRequestRecord(id, {
    status: "draft_created",
    post_id: postId,
    review_url: reviewUrl,
  });
}

export async function markContentRequestFailed(
  id: string,
  errorMessage: string
): Promise<ContentRequest> {
  return updateContentRequestRecord(id, {
    status: "failed",
    error_message: errorMessage,
  });
}

export async function cancelContentRequestRecord(id: string): Promise<ContentRequest> {
  const existing = await getContentRequestRecord(id);
  if (!existing) throw new Error("Content request not found.");

  if (existing.status === "draft_created") {
    throw new Error("Cannot cancel a request that has already resulted in a created draft.");
  }

  return updateContentRequestRecord(id, { status: "cancelled" });
}
