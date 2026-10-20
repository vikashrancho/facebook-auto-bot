import { supabaseAdmin } from "@/lib/supabase/server";
import type { Post, PostStatus } from "@/lib/types";

export async function listPosts(
  opts: { status?: PostStatus | PostStatus[]; limit?: number } = {}
): Promise<Post[]> {
  const db = supabaseAdmin();
  let query = db.from("posts").select("*").order("created_at", { ascending: false });

  if (opts.status) {
    query = Array.isArray(opts.status)
      ? query.in("status", opts.status)
      : query.eq("status", opts.status);
  }
  if (opts.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list posts: ${error.message}`);
  return (data ?? []) as Post[];
}

export async function getPost(id: string): Promise<Post | null> {
  // If id is not a valid UUID, Postgres throws 22P02. Treat as not found.
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) return null;

  const db = supabaseAdmin();
  const { data, error } = await db.from("posts").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (error.code === "22P02") return null;
    throw new Error(`Failed to load post: ${error.message}`);
  }
  return data as Post | null;
}

export async function createPostRecord(
  input: Omit<
    Post,
    "id" | "created_at" | "status" | "posted_at" | "facebook_post_id" | "error_message"
  > & {
    status: PostStatus;
  }
): Promise<Post> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("posts").insert(input).select().single();
  if (error) throw new Error(`Failed to create post: ${error.message}`);
  return data as Post;
}

export async function updatePostRecord(id: string, patch: Partial<Post>): Promise<Post> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("posts").update(patch).eq("id", id).select().single();
  if (error) {
    // If an optional scheduling column does not exist yet on Supabase, retry without it
    if (
      error.message.includes("column of 'posts' in the schema cache") &&
      (patch.schedule_notes !== undefined ||
        patch.last_attempt_at !== undefined ||
        patch.retry_count !== undefined)
    ) {
      const { schedule_notes, last_attempt_at, retry_count, ...fallbackPatch } = patch;
      const fallbackRes = await db
        .from("posts")
        .update(fallbackPatch)
        .eq("id", id)
        .select()
        .single();
      if (!fallbackRes.error && fallbackRes.data) {
        return fallbackRes.data as Post;
      }
    }
    throw new Error(`Failed to update post: ${error.message}`);
  }
  return data as Post;
}

export async function deletePostRecord(id: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("posts").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete post: ${error.message}`);
}

/** Scheduled posts whose time has come, oldest first — used by the cron worker. */
export async function listDuePosts(nowIso: string): Promise<Post[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("posts")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(20);
  if (error) throw new Error(`Failed to list due posts: ${error.message}`);
  return (data ?? []) as Post[];
}

/** Posts query optimized for the Content Calendar */
export async function listCalendarPosts(opts: {
  startDate?: string;
  endDate?: string;
  status?: PostStatus | PostStatus[];
} = {}): Promise<Post[]> {
  const db = supabaseAdmin();
  let query = db.from("posts").select("*").order("scheduled_at", { ascending: true, nullsFirst: false });

  if (opts.startDate) {
    query = query.gte("scheduled_at", opts.startDate);
  }
  if (opts.endDate) {
    query = query.lte("scheduled_at", opts.endDate);
  }
  if (opts.status) {
    query = Array.isArray(opts.status)
      ? query.in("status", opts.status)
      : query.eq("status", opts.status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list calendar posts: ${error.message}`);
  return (data ?? []) as Post[];
}
