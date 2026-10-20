import { supabaseAdmin } from "@/lib/supabase/server";
import { getPost, updatePostRecord } from "@/lib/db/posts";
import { getSettings } from "@/lib/db/settings";
import { getPageWithToken } from "@/lib/db/pages";
import { computePostContentHash } from "@/lib/auth/integration";
import { publishPostNow, type PublishOptions } from "@/lib/facebook/publish";
import type { Post } from "@/lib/types";

export interface ScheduledExecutionResult {
  postId: string;
  title: string;
  scheduledAt: string | null;
  status:
    | "published"
    | "simulated"
    | "skipped_unapproved"
    | "hash_mismatch"
    | "missing_page"
    | "missing_media"
    | "claim_failed"
    | "already_claimed"
    | "failed"
    | "uncertain_outcome";
  facebookPostId?: string;
  errorMessage?: string;
}

export interface ProcessScheduledPostsReport {
  timestamp: string;
  totalDue: number;
  processed: number;
  published: number;
  skippedUnapproved: number;
  hashMismatches: number;
  failed: number;
  results: ScheduledExecutionResult[];
}

export interface SchedulerOptions extends PublishOptions {
  nowIso?: string;
}

/**
 * Executes a durable, atomic server-side scheduled publishing cycle.
 *
 * Enforces:
 * 1. Independent human approval validation (never auto-publishes unapproved posts).
 * 2. Unapproved expired posts revert to draft with clear notice to prevent surprise auto-publishes if approved later.
 * 3. Tamper-evident content hash verification against current settings & post fields.
 * 4. Atomic compare-and-set database claiming to eliminate concurrency race conditions.
 * 5. Reuse of canonical Facebook publishing service, timeout classification, and duplicate prevention.
 */
export async function processDueScheduledPosts(
  options: SchedulerOptions = {}
): Promise<ProcessScheduledPostsReport> {
  const nowIso = options.nowIso ?? new Date().toISOString();
  const db = supabaseAdmin();

  // Load all scheduled posts whose scheduled time has arrived, oldest first
  const { data: duePosts, error: queryError } = await db
    .from("posts")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(25);

  if (queryError) {
    throw new Error(`Failed to query due scheduled posts: ${queryError.message}`);
  }

  const posts: Post[] = (duePosts ?? []) as Post[];
  const report: ProcessScheduledPostsReport = {
    timestamp: nowIso,
    totalDue: posts.length,
    processed: 0,
    published: 0,
    skippedUnapproved: 0,
    hashMismatches: 0,
    failed: 0,
    results: [],
  };

  if (posts.length === 0) {
    return report;
  }

  const settings = await getSettings();

  for (const post of posts) {
    report.processed++;

    // Idempotency: skip if already posted
    if (post.status === "posted") {
      report.results.push({
        postId: post.id,
        title: post.title,
        scheduledAt: post.scheduled_at,
        status: "published",
        facebookPostId: post.facebook_post_id ?? undefined,
      });
      continue;
    }

    // Safeguard 1: Separate Approval from Scheduling
    // Scheduled unapproved posts must NEVER be published automatically.
    // If the scheduled time passes while unapproved, expire the schedule to draft
    // so that approving it later does NOT cause an accidental immediate surprise publish.
    if (!post.approved_by_user) {
      report.skippedUnapproved++;
      const errorMsg =
        "[NEEDS_APPROVAL_EXPIRED] Scheduled time arrived while awaiting human approval. " +
        "Automatic publication was halted. To publish, review and approve the post, then choose a new schedule or select Publish Now.";

      await updatePostRecord(post.id, {
        status: "draft",
        error_message: errorMsg,
      });

      report.results.push({
        postId: post.id,
        title: post.title,
        scheduledAt: post.scheduled_at,
        status: "skipped_unapproved",
        errorMessage: errorMsg,
      });
      continue;
    }

    // Safeguard 2: Cryptographic Content-Hash Verification
    // Ensure post content (title, description, image, hashtags, target Page, UTM) has not drifted
    const pageId = post.page_id ?? settings.default_page_id ?? "";
    const currentHash = computePostContentHash({
      postId: post.id,
      title: post.title,
      description: post.description,
      hashtags: post.hashtags,
      imageUrl: post.image_url,
      pageId,
      linkUrl: post.link_url,
      utmSuffix: settings.utm_suffix,
    });

    if (!post.approval_content_hash || post.approval_content_hash !== currentHash) {
      report.hashMismatches++;
      const errorMsg =
        "[HASH_MISMATCH] Post content was modified after human approval was granted. " +
        "Approval invalidated. Please review updated content and approve again before scheduling.";

      await updatePostRecord(post.id, {
        approved_by_user: false,
        approved_at: null,
        approval_content_hash: null,
        status: "draft",
        error_message: errorMsg,
      });

      report.results.push({
        postId: post.id,
        title: post.title,
        scheduledAt: post.scheduled_at,
        status: "hash_mismatch",
        errorMessage: errorMsg,
      });
      continue;
    }

    // Safeguard 3: Page & Token Configuration Verification
    const targetPage = await getPageWithToken(pageId);
    const pageToken =
      targetPage?.access_token ||
      (pageId === settings.default_page_id ? settings.default_page_token : null);

    if (!pageId || !pageToken || (targetPage && targetPage.is_active === false)) {
      report.failed++;
      const errorMsg =
        `[MISSING_PAGE] Destination Facebook Page (${post.page_name || pageId}) is ${
          targetPage?.is_active === false ? "disconnected or inactive" : "missing a valid access token"
        }. Please reconnect this Page on the Pages screen.`;

      await updatePostRecord(post.id, {
        status: "failed",
        error_message: errorMsg,
      });

      report.results.push({
        postId: post.id,
        title: post.title,
        scheduledAt: post.scheduled_at,
        status: "missing_page",
        errorMessage: errorMsg,
      });
      continue;
    }

    // Safeguard 4: Media URL Verification
    if (!post.image_url || post.image_url.trim() === "") {
      report.failed++;
      const errorMsg = "[INVALID_MEDIA] Post does not have a valid image URL for Facebook publishing.";

      await updatePostRecord(post.id, {
        status: "failed",
        error_message: errorMsg,
      });

      report.results.push({
        postId: post.id,
        title: post.title,
        scheduledAt: post.scheduled_at,
        status: "missing_media",
        errorMessage: errorMsg,
      });
      continue;
    }

    // Safeguard 5: Dry-Run Simulation Support
    if (options.dryRun) {
      report.published++;
      report.results.push({
        postId: post.id,
        title: post.title,
        scheduledAt: post.scheduled_at,
        status: "simulated",
        facebookPostId: `simulated_cron_${post.id}`,
      });
      continue;
    }

    // Safeguard 6: Dispatch via Existing Publishing Service
    // publishPostNow enforces atomic compare-and-set claim (status -> publishing),
    // duplicate-prevention idempotency, and timeout classification.
    try {
      const publishRes = await publishPostNow(post.id, {
        publisher: options.publisher,
        forceRetry: options.forceRetry,
      });

      if (publishRes.status === "posted") {
        if (publishRes.alreadyPublished) {
          // Claimed and published by another concurrent worker; do not double count
          report.results.push({
            postId: post.id,
            title: post.title,
            scheduledAt: post.scheduled_at,
            status: "already_claimed",
          });
        } else {
          report.published++;
          report.results.push({
            postId: post.id,
            title: post.title,
            scheduledAt: post.scheduled_at,
            status: "published",
            facebookPostId: publishRes.facebook_post_id ?? undefined,
          });
        }
      } else {
        report.failed++;
        const isUncertain = publishRes.error_message?.includes("[UNCERTAIN_OUTCOME]");
        report.results.push({
          postId: post.id,
          title: post.title,
          scheduledAt: post.scheduled_at,
          status: isUncertain ? "uncertain_outcome" : "failed",
          errorMessage: publishRes.error_message ?? "Facebook publishing failed.",
        });
      }
    } catch (publishErr) {
      const errorMessage =
        publishErr instanceof Error ? publishErr.message : "Unexpected publishing failure.";

      // If another concurrent worker claimed or is actively publishing this post, do NOT mark it as failed
      if (
        errorMessage.includes("currently being published by another request") ||
        errorMessage.includes("Failed to claim post for publishing")
      ) {
        report.results.push({
          postId: post.id,
          title: post.title,
          scheduledAt: post.scheduled_at,
          status: "already_claimed",
          errorMessage,
        });
        continue;
      }

      report.failed++;
      await updatePostRecord(post.id, {
        status: "failed",
        error_message: errorMessage,
      });

      report.results.push({
        postId: post.id,
        title: post.title,
        scheduledAt: post.scheduled_at,
        status: "failed",
        errorMessage,
      });
    }
  }

  return report;
}
