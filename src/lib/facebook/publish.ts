import { publishPhoto, NoPageSelectedError, type PublishPhotoInput } from "@/lib/facebook/client";
import { getPost, updatePostRecord } from "@/lib/db/posts";
import { getSettings } from "@/lib/db/settings";
import { getPageWithToken } from "@/lib/db/pages";
import { composeMessage } from "@/lib/types";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Post } from "@/lib/types";

export interface PublishOptions {
  /** Optional custom photo publisher for testing without calling Meta Graph API */
  publisher?: (input: PublishPhotoInput) => Promise<{ id: string }>;
  /** When true, validates prerequisites and simulates publishing without modifying the database or calling Meta */
  dryRun?: boolean;
  /** When true, allows retrying a post that previously failed with an uncertain timeout */
  forceRetry?: boolean;
}

export type PublishResult = Post & {
  simulated?: boolean;
  simulatedFacebookPostId?: string;
  simulatedFacebookPostUrl?: string;
  alreadyPublished?: boolean;
};

/**
 * Publishes one queued post to its Facebook Page and records the outcome.
 * Enforces atomic state locking, idempotent returns for already published posts,
 * non-destructive dry-run simulations, and timeout classification to prevent accidental duplicate publishing.
 */
export async function publishPostNow(
  postId: string,
  options: PublishOptions = {}
): Promise<PublishResult> {
  const post = await getPost(postId);
  if (!post) throw new Error("Post not found.");

  // Idempotency: If already published, return the existing record immediately without calling Meta
  if (post.status === "posted") {
    return {
      ...post,
      simulated: options.dryRun ?? false,
      alreadyPublished: true,
    };
  }

  // Prevent concurrent publishing attempts
  if (post.status === "publishing") {
    throw new Error("This post is currently being published by another request.");
  }

  // Block automatic blind retries on posts with uncertain publication outcomes (e.g. timeouts)
  if (post.status === "failed" && post.error_message?.includes("[UNCERTAIN_OUTCOME]")) {
    if (!options.forceRetry) {
      throw new Error(
        "This post previously encountered an uncertain timeout. The photo may already have been published to your Facebook Page. " +
          "Automatic retry is blocked to prevent duplicate posts. Please verify your Facebook Page. " +
          "If confirmed not published, supply forceRetry=true to proceed."
      );
    }
  }

  const settings = await getSettings();

  // Strict Safeguard: Destination MUST be permanently stored on the post record.
  // NEVER fall back to a global default Page ID during publication.
  const pageId = post.page_id;
  if (!pageId) {
    const errorMsg = `[DESTINATION_MISSING] Post '${post.title}' (${postId}) does not have an assigned destination Facebook Page. Publication cannot proceed without an explicit target Page.`;
    if (options.dryRun) {
      throw new Error(`Dry-run validation failed: ${errorMsg}`);
    }
    return updatePostRecord(postId, {
      status: "failed",
      error_message: errorMsg,
    });
  }

  // Resolve target Page credentials using stored page token
  const targetPage = await getPageWithToken(pageId);
  const pageToken = targetPage?.access_token;

  if (!pageToken || (targetPage && targetPage.is_active === false)) {
    const errorMsg = `Destination Facebook Page (${post.page_name || pageId}) is ${
      targetPage?.is_active === false ? "disconnected or inactive" : "missing a valid access token"
    }. Please reconnect this Page on the Pages screen.`;
    if (options.dryRun) {
      throw new Error(`Dry-run validation failed: ${errorMsg}`);
    }
    return updatePostRecord(postId, {
      status: "failed",
      error_message: errorMsg,
    });
  }

  // Validate token format for live publication to prevent sending mock or corrupted tokens to Meta
  if (
    !options.dryRun &&
    !options.publisher &&
    (pageToken.startsWith("mock_") || pageToken.startsWith("test_") || pageToken.length < 30)
  ) {
    const errorMsg = `[INVALID_TOKEN] Destination Facebook Page (${post.page_name || pageId}) has a mock or malformed access token. Please select and verify a legitimate connected Page on the Pages screen.`;
    if (options.dryRun) {
      throw new Error(`Dry-run validation failed: ${errorMsg}`);
    }
    return updatePostRecord(postId, {
      status: "failed",
      error_message: errorMsg,
    });
  }

  if (!post.image_url) {
    const errorMsg = "Post does not have a valid image URL.";
    if (options.dryRun) {
      throw new Error(`Dry-run validation failed: ${errorMsg}`);
    }
    return updatePostRecord(postId, {
      status: "failed",
      error_message: errorMsg,
    });
  }

  const message = composeMessage(post, settings.utm_suffix);

  // COMPLETELY NON-DESTRUCTIVE DRY-RUN:
  // If dryRun is requested, validate all prerequisites and return simulation result
  // without modifying the database record or calling the external publisher.
  if (options.dryRun) {
    return {
      ...post,
      simulated: true,
      simulatedFacebookPostId: `simulated_dryrun_${postId}`,
      simulatedFacebookPostUrl: `https://facebook.com/simulated_dryrun_${postId}`,
    };
  }

  // Atomic state lock: Claim the post for publishing to prevent race conditions
  const db = supabaseAdmin();
  const { data: claimed, error: claimError } = await db
    .from("posts")
    .update({ status: "publishing" })
    .eq("id", postId)
    .neq("status", "posted")
    .neq("status", "publishing")
    .select()
    .maybeSingle();

  if (claimError || !claimed) {
    const fresh = await getPost(postId);
    if (fresh?.status === "posted") return { ...fresh, alreadyPublished: true };
    throw new Error("Concurrent publishing detected. Request aborted to prevent duplicate posts.");
  }

  const publisher = options.publisher ?? publishPhoto;

  try {
    console.log(
      "[PUBLISH_ATTEMPT]",
      JSON.stringify({
        postId: post.id,
        targetPageId: pageId,
        targetPageName: post.page_name ?? targetPage?.name ?? null,
        dryRun: options.dryRun ?? false,
        hasImage: Boolean(post.image_url),
      })
    );

    const result = await publisher({
      pageId,
      pageToken,
      message,
      imageUrl: post.image_url,
    });

    console.log(
      "[PUBLISH_SUCCESS]",
      JSON.stringify({
        postId: post.id,
        targetPageId: pageId,
        targetPageName: post.page_name ?? targetPage?.name ?? null,
        facebookPostId: result.id,
      })
    );

    return await updatePostRecord(postId, {
      status: "posted",
      facebook_post_id: result.id,
      posted_at: new Date().toISOString(),
      error_message: null,
    });
  } catch (err) {
    let errorMessage = err instanceof Error ? err.message : "Unknown error while posting.";

    // Permissions guidance
    if (/\(#200\)|permissions? error/i.test(errorMessage)) {
      errorMessage =
        "Facebook rejected this for missing permissions. The connected token needs " +
        "pages_manage_posts. Add it to your Meta app — and to the Login for Business " +
        "configuration if you use one — then disconnect and connect again so a new " +
        "token is issued.";
    }

    // Invalid OAuth token guidance
    if (
      /Invalid OAuth access token|error validating access token|\(#190\)|session has expired/i.test(
        errorMessage
      )
    ) {
      errorMessage =
        "[INVALID_OAUTH_TOKEN] Facebook rejected the publishing request because the Page or User access token is invalid, expired, or revoked (Meta OAuth Error 190). Please re-authenticate your Facebook account or reconnect this Page on the Pages screen.";
    }

    // Uncertain timeout classification to prevent accidental duplicate publishing
    const isTimeoutOrNetwork =
      /timeout|timed out|aborted|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|504|502/i.test(errorMessage) ||
      (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError"));

    if (isTimeoutOrNetwork) {
      errorMessage =
        "[UNCERTAIN_OUTCOME] Facebook publishing request timed out or network connection was lost. " +
        "The post may have already been accepted and published by Facebook. " +
        "Automatic retries are blocked to prevent duplicate posts. Please verify your Facebook Page before retrying.";
    }

    return await updatePostRecord(postId, {
      status: "failed",
      error_message: errorMessage,
    });
  }
}
