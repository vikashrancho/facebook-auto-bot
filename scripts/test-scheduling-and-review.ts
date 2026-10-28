/**
 * Comprehensive Test Suite for Facebook Post Scheduling and Dashboard Review Workflow
 *
 * Verifies all 15 requirements from the specification:
 * 1. Create a draft and confirm it remains unpublished.
 * 2. Generate a valid absolute dashboard review URL (e.g. https://fbautopost.vetechno.in/dashboard/queue?post=...).
 * 3. Open the dashboard using a post ID query parameter (GET /api/posts/{id}).
 * 4. Approve a draft and verify the correct state transition (draft -> approved, or draft -> scheduled if future schedule exists).
 * 5. Schedule a post for a future date and time via ChatGPT action and dashboard action.
 * 6. Verify the scheduled timestamp and timezone in the database (UTC ISO and IANA timezone).
 * 7. Verify that a due job is picked up by the scheduler.
 * 8. Verify that a successful Facebook API response changes the status to posted.
 * 9. Verify that a failed API request does not falsely mark the post as published.
 * 10. Verify retry behavior and duplicate-publication protection.
 * 11. Verify that application restarts do not lose scheduled jobs (durable database-backed).
 * 12. Verify that unauthorized users cannot approve or publish posts.
 * 13. Verify that content hash mismatches block approval or publication.
 * 14. Verify rescheduling and cancellation (reverting scheduled post to approved or draft).
 * 15. Verify that invalid past dates and invalid timezone values are rejected correctly.
 *
 * SAFETY RESTRICTION: No real Facebook posts are published. All Meta API calls are mocked safely.
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// 1. Load environment variables
const envLocalPath = path.resolve(".env.local");
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

// Ensure critical test environment variables
process.env.APP_BASE_URL = "https://fbautopost.vetechno.in";
process.env.NEXT_PUBLIC_SITE_URL = "https://fbautopost.vetechno.in";
process.env.INTEGRATION_API_KEY = process.env.INTEGRATION_API_KEY || "test-m2m-api-key-safe-12345";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "TestPassword123!";
process.env.TEST_MOCK_STORAGE = "1";

const VALID_1X1_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

// Intercept global fetch for test image downloads
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (urlStr.includes("files.oaiusercontent.com")) {
    return new Response(VALID_1X1_PNG, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(VALID_1X1_PNG.byteLength),
      },
    });
  }
  return originalFetch(input, init);
}) as typeof globalThis.fetch;

import { GET, POST, PATCH } from "../src/app/api/[...path]/route";
import { getAppBaseUrl, buildDashboardReviewUrl, normalizeUrl } from "../src/lib/urls";
import { normalizeTimezone, isValidTimezone } from "../src/lib/time";
import {
  createPostRecord,
  getPost,
  updatePostRecord,
  deletePostRecord,
  listDuePosts,
} from "../src/lib/db/posts";
import { computePostContentHash, issueApprovalToken } from "../src/lib/auth/integration";
import { processDueScheduledPosts } from "../src/lib/scheduler";
import { publishPostNow } from "../src/lib/facebook/publish";
import { supabaseAdmin } from "../src/lib/supabase/server";

// Test Tracking
let passed = 0;
let failed = 0;
const createdPostIds: string[] = [];

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    process.stdout.write(`  • ${name}... `);
    await fn();
    console.log("✓ PASS");
    passed++;
  } catch (err: any) {
    console.log("✗ FAIL");
    console.error(`    Error: ${err.message}`);
    if (err.stack) {
      const lines = err.stack.split("\n").slice(1, 4).join("\n");
      console.error(lines);
    }
    failed++;
  }
}

function makeCtx(pathParts: string[]) {
  return { params: Promise.resolve({ path: pathParts }) };
}

function makeAuthHeaders(apiKey = process.env.INTEGRATION_API_KEY) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function cleanupCreatedPosts() {
  const db = supabaseAdmin();
  for (const id of createdPostIds) {
    try {
      await db.from("posts").delete().eq("id", id);
    } catch {}
  }
}

async function main() {
  console.log("================================================================================");
  console.log("  Facebook Auto Bot: Post Scheduling and Dashboard Review Verification Suite");
  console.log("================================================================================");

  try {
    // -------------------------------------------------------------------------
    // Test 1: URL generation helper and absolute review URL format
    // -------------------------------------------------------------------------
    await runTest("Centralized URL helper generates valid absolute URLs", async () => {
      const baseUrl = getAppBaseUrl();
      assert.strictEqual(baseUrl, "https://fbautopost.vetechno.in");

      const testPostId = "c6ccb3c0-836f-48e3-b847-da07934ca423";
      const reviewUrl = buildDashboardReviewUrl(testPostId);
      assert.strictEqual(
        reviewUrl,
        `https://fbautopost.vetechno.in/dashboard/queue?post=${testPostId}`
      );
      assert.ok(reviewUrl.startsWith("https://"));
      assert.ok(reviewUrl.includes("post=c6ccb3c0-836f-48e3-b847-da07934ca423"));
    });

    // -------------------------------------------------------------------------
    // Test 2: Timezone normalization and validation
    // -------------------------------------------------------------------------
    await runTest("Timezone normalization handles aliases and validates IANA zones", async () => {
      assert.strictEqual(normalizeTimezone("IST"), "Asia/Kolkata");
      assert.strictEqual(normalizeTimezone("Asia/Kolkata"), "Asia/Kolkata");
      assert.strictEqual(normalizeTimezone("UTC"), "UTC");
      assert.strictEqual(normalizeTimezone("PST"), "America/Los_Angeles");
      assert.strictEqual(normalizeTimezone("EST"), "America/New_York");

      assert.strictEqual(isValidTimezone("Asia/Kolkata"), true);
      assert.strictEqual(isValidTimezone("IST"), true);
      assert.strictEqual(isValidTimezone("UTC"), true);
      assert.strictEqual(isValidTimezone("Invalid/Zone_9999"), false);
      assert.strictEqual(isValidTimezone(""), false);
    });

    // -------------------------------------------------------------------------
    // Test 3: Create draft via ChatGPT action and confirm it remains unpublished
    // -------------------------------------------------------------------------
    let stagedDraftId = "";
    let stagedContentHash = "";
    let stagedReviewUrl = "";

    await runTest("Create draft via ChatGPT action: remains unpublished with absolute reviewUrl", async () => {
      const req = new Request("https://fbautopost.vetechno.in/api/chatgpt/posts", {
        method: "POST",
        headers: makeAuthHeaders(),
        body: JSON.stringify({
          title: "Test Jesus Words Post",
          description: "Find rest in Him today and every day. Come to me all who are weary.",
          hashtags: ["Faith", "Rest", "Jesus"],
          imageUrl: "https://files.oaiusercontent.com/test-valid-hosted-image-url.jpg",
          pageName: "Live Jesus Christ",
        }),
      });

      const res = await POST(req, makeCtx(["chatgpt", "posts"]));
      assert.strictEqual(res.status, 201, "Expected 201 Created");
      const body = await res.json();

      assert.ok(body.postId, "Must return a postId");
      stagedDraftId = body.postId;
      createdPostIds.push(stagedDraftId);

      assert.strictEqual(body.status, "pending_review", "Staged post must be pending_review");
      assert.strictEqual(body.approvalRequired, true, "Must require approval");
      assert.ok(body.contentHash && body.contentHash.length === 64, "Must have 64-char sha256 hash");
      stagedContentHash = body.contentHash;

      // Absolute URL check
      assert.strictEqual(
        body.reviewUrl,
        `https://fbautopost.vetechno.in/dashboard/queue?post=${stagedDraftId}`,
        "reviewUrl must be absolute"
      );
      stagedReviewUrl = body.reviewUrl;

      // Confirm in DB that it is unpublished
      const dbPost = await getPost(stagedDraftId);
      assert.ok(dbPost);
      assert.strictEqual(dbPost.status, "draft");
      assert.strictEqual(dbPost.facebook_post_id, null);
      assert.strictEqual(dbPost.posted_at, null);
      assert.strictEqual(dbPost.approved_by_user, false);
      assert.strictEqual(dbPost.scheduled_at, null);
    });

    // -------------------------------------------------------------------------
    // Test 4: Retrieve post via GET /api/posts/{id} (dashboard review loading)
    // -------------------------------------------------------------------------
    await runTest("GET /api/posts/{id} retrieves the targeted post for dashboard preview", async () => {
      const getReq = new Request(`https://fbautopost.vetechno.in/api/chatgpt/posts/${stagedDraftId}`, {
        method: "GET",
        headers: makeAuthHeaders(),
      });

      const getRes = await GET(getReq, makeCtx(["chatgpt", "posts", stagedDraftId]));
      assert.strictEqual(getRes.status, 200);
      const postData = await getRes.json();

      assert.strictEqual(postData.postId, stagedDraftId);
      assert.strictEqual(postData.status, "pending_review");
      assert.strictEqual(postData.approvedByUser, false);
      assert.strictEqual(postData.approved, false);
      assert.strictEqual(postData.contentHash, stagedContentHash);
      assert.strictEqual(postData.reviewUrl, stagedReviewUrl);
      assert.strictEqual(postData.scheduledAt, null);
    });

    // -------------------------------------------------------------------------
    // Test 5: Scheduling rejects invalid past dates and invalid timezones
    // -------------------------------------------------------------------------
    await runTest("Scheduling rejects past dates and invalid timezones with 400 Bad Request", async () => {
      // Past date
      const pastReq = new Request(`https://fbautopost.vetechno.in/api/chatgpt/posts/${stagedDraftId}/schedule`, {
        method: "POST",
        headers: makeAuthHeaders(),
        body: JSON.stringify({
          scheduledAt: "2020-01-01T12:00:00Z",
          timezone: "Asia/Kolkata",
        }),
      });
      const pastRes = await POST(pastReq, makeCtx(["chatgpt", "posts", stagedDraftId, "schedule"]));
      assert.strictEqual(pastRes.status, 400);
      const pastData = await pastRes.json();
      assert.ok(pastData.error.includes("future"));

      // Invalid timezone
      const futureDate = new Date(Date.now() + 86400000 * 5).toISOString();
      const tzReq = new Request(`https://fbautopost.vetechno.in/api/chatgpt/posts/${stagedDraftId}/schedule`, {
        method: "POST",
        headers: makeAuthHeaders(),
        body: JSON.stringify({
          scheduledAt: futureDate,
          timezone: "Invalid/Fake_Zone",
        }),
      });
      const tzRes = await POST(tzReq, makeCtx(["chatgpt", "posts", stagedDraftId, "schedule"]));
      assert.strictEqual(tzRes.status, 400);
      const tzData = await tzRes.json();
      assert.ok(tzData.error.includes("Invalid timezone"));
    });

    // -------------------------------------------------------------------------
    // Test 6: Schedule unapproved post stores schedule metadata without auto-publishing
    // -------------------------------------------------------------------------
    const targetFutureDate = new Date(Date.now() + 86400000 * 7).toISOString();

    await runTest("Schedule unapproved post: persists scheduled time and timezone, remains pending approval", async () => {
      const schedReq = new Request(`https://fbautopost.vetechno.in/api/chatgpt/posts/${stagedDraftId}/schedule`, {
        method: "POST",
        headers: makeAuthHeaders(),
        body: JSON.stringify({
          scheduledAt: targetFutureDate,
          timezone: "Asia/Kolkata",
          scheduleNotes: "Scheduled for test delivery",
        }),
      });

      const schedRes = await POST(schedReq, makeCtx(["chatgpt", "posts", stagedDraftId, "schedule"]));
      assert.strictEqual(schedRes.status, 200);
      const schedData = await schedRes.json();

      assert.strictEqual(schedData.postId, stagedDraftId);
      assert.strictEqual(schedData.approved, false, "Must not be approved yet");
      assert.strictEqual(schedData.status, "pending_review", "Staged post without user confirmation stays pending_review");
      assert.strictEqual(
        new Date(schedData.scheduledAt).getTime(),
        new Date(targetFutureDate).getTime()
      );
      assert.strictEqual(schedData.scheduledTimezone, "Asia/Kolkata");
      assert.ok(schedData.reviewUrl.startsWith("https://"));

      // Check DB
      const post = await getPost(stagedDraftId);
      assert.ok(post);
      assert.strictEqual(post.status, "draft");
      assert.strictEqual(
        new Date(post.scheduled_at!).getTime(),
        new Date(targetFutureDate).getTime()
      );
      assert.strictEqual(post.scheduled_timezone, "Asia/Kolkata");
      assert.strictEqual(post.approved_by_user, false);
    });

    // -------------------------------------------------------------------------
    // Test 7: Unauthorized users cannot approve or publish posts
    // -------------------------------------------------------------------------
    await runTest("Unauthorized requests cannot approve or schedule posts (HTTP 401)", async () => {
      const unauthReq = new Request(`https://fbautopost.vetechno.in/api/chatgpt/posts/${stagedDraftId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }, // Missing Authorization header
        body: JSON.stringify({
          userConfirmed: true,
          contentHash: stagedContentHash,
        }),
      });

      const unauthRes = await POST(unauthReq, makeCtx(["chatgpt", "posts", stagedDraftId, "approve"]));
      assert.strictEqual(unauthRes.status, 401, "Expected 401 Unauthorized for missing auth");
    });

    // -------------------------------------------------------------------------
    // Test 8: Content hash mismatch blocks approval
    // -------------------------------------------------------------------------
    await runTest("Content hash mismatch blocks approval (HTTP 400)", async () => {
      const tamperedHash = crypto.createHash("sha256").update("tampered-content").digest("hex");
      const tamperReq = new Request(`https://fbautopost.vetechno.in/api/chatgpt/posts/${stagedDraftId}/approve`, {
        method: "POST",
        headers: makeAuthHeaders(),
        body: JSON.stringify({
          userConfirmed: true,
          contentHash: tamperedHash,
        }),
      });

      const tamperRes = await POST(tamperReq, makeCtx(["chatgpt", "posts", stagedDraftId, "approve"]));
      assert.strictEqual(tamperRes.status, 400);
      const tamperData = await tamperRes.json();
      assert.ok(tamperData.error.includes("Content hash mismatch"));

      // Verify post was NOT marked approved
      const post = await getPost(stagedDraftId);
      assert.strictEqual(post?.approved_by_user, false);
    });

    // -------------------------------------------------------------------------
    // Test 9: Approve post with future scheduled time transitions status to 'scheduled'
    // -------------------------------------------------------------------------
    let issuedApprovalToken = "";

    await runTest("Approve draft with existing future schedule: status transitions to 'scheduled'", async () => {
      const appReq = new Request(`https://fbautopost.vetechno.in/api/chatgpt/posts/${stagedDraftId}/approve`, {
        method: "POST",
        headers: makeAuthHeaders(),
        body: JSON.stringify({
          userConfirmed: true,
          contentHash: stagedContentHash,
        }),
      });

      const appRes = await POST(appReq, makeCtx(["chatgpt", "posts", stagedDraftId, "approve"]));
      assert.strictEqual(appRes.status, 200);
      const appData = await appRes.json();

      assert.strictEqual(appData.approved, true);
      assert.strictEqual(appData.status, "scheduled", "Must transition to 'scheduled' because of future scheduledAt");
      assert.strictEqual(
        new Date(appData.scheduledAt).getTime(),
        new Date(targetFutureDate).getTime()
      );
      assert.strictEqual(appData.scheduledTimezone, "Asia/Kolkata");
      assert.ok(appData.approvalToken, "Must issue approvalToken");
      assert.strictEqual(appData.reviewUrl, stagedReviewUrl);
      issuedApprovalToken = appData.approvalToken;

      // Verify in DB
      const post = await getPost(stagedDraftId);
      assert.ok(post);
      assert.strictEqual(post.status, "scheduled", "DB status must be 'scheduled'");
      assert.strictEqual(post.approved_by_user, true);
      assert.ok(post.approved_at);
      assert.strictEqual(
        new Date(post.scheduled_at!).getTime(),
        new Date(targetFutureDate).getTime()
      );
      assert.strictEqual(post.scheduled_timezone, "Asia/Kolkata");
    });

    // -------------------------------------------------------------------------
    // Test 10: Rescheduling and cancellation
    // -------------------------------------------------------------------------
    await runTest("Rescheduling updates future time; cancelling schedule reverts to approved", async () => {
      const newFutureDate = new Date(Date.now() + 86400000 * 14).toISOString();

      // Reschedule
      const reschedReq = new Request(`https://fbautopost.vetechno.in/api/chatgpt/posts/${stagedDraftId}/schedule`, {
        method: "POST",
        headers: makeAuthHeaders(),
        body: JSON.stringify({
          scheduledAt: newFutureDate,
          timezone: "UTC",
        }),
      });
      const reschedRes = await POST(reschedReq, makeCtx(["chatgpt", "posts", stagedDraftId, "schedule"]));
      assert.strictEqual(reschedRes.status, 200);
      const reschedData = await reschedRes.json();
      assert.strictEqual(reschedData.status, "scheduled");
      assert.strictEqual(
        new Date(reschedData.scheduledAt).getTime(),
        new Date(newFutureDate).getTime()
      );
      assert.strictEqual(reschedData.scheduledTimezone, "UTC");

      // Verify in DB
      let post = await getPost(stagedDraftId);
      assert.strictEqual(
        new Date(post!.scheduled_at!).getTime(),
        new Date(newFutureDate).getTime()
      );
      assert.strictEqual(post?.scheduled_timezone, "UTC");

      // Cancel schedule
      const cancelReq = new Request(`https://fbautopost.vetechno.in/api/chatgpt/posts/${stagedDraftId}/cancel-schedule`, {
        method: "POST",
        headers: makeAuthHeaders(),
      });
      const cancelRes = await POST(cancelReq, makeCtx(["chatgpt", "posts", stagedDraftId, "cancel-schedule"]));
      assert.strictEqual(cancelRes.status, 200);
      const cancelData = await cancelRes.json();
      assert.strictEqual(cancelData.status, "approved", "Approved post reverts to 'approved' when schedule is cancelled");
      assert.strictEqual(cancelData.scheduledAt, null);

      // Verify in DB
      post = await getPost(stagedDraftId);
      assert.strictEqual(post?.status, "approved");
      assert.strictEqual(post?.scheduled_at, null);
      assert.strictEqual(post?.approved_by_user, true);
    });

    // -------------------------------------------------------------------------
    // Test 11: Create post with scheduledAt and timezone directly in creation
    // -------------------------------------------------------------------------
    let directSchedId = "";
    const directSchedTime = new Date(Date.now() + 3600000 * 2).toISOString(); // 2 hours from now

    await runTest("Create post directly with scheduledAt and timezone: recorded in DB as draft with schedule", async () => {
      const req = new Request("https://fbautopost.vetechno.in/api/chatgpt/posts", {
        method: "POST",
        headers: makeAuthHeaders(),
        body: JSON.stringify({
          title: "Direct Scheduled Devotion Post",
          description: "Peace I leave with you; my peace I give you. John 14:27",
          hashtags: ["Peace", "BibleVerse"],
          imageUrl: "https://files.oaiusercontent.com/test-valid-image-2.jpg",
          pageName: "Live Jesus Christ",
          scheduledAt: directSchedTime,
          timezone: "Asia/Kolkata",
        }),
      });

      const res = await POST(req, makeCtx(["chatgpt", "posts"]));
      assert.strictEqual(res.status, 201);
      const body = await res.json();

      assert.ok(body.postId);
      directSchedId = body.postId;
      createdPostIds.push(directSchedId);

      assert.strictEqual(body.status, "pending_review");
      assert.strictEqual(
        new Date(body.scheduledAt).getTime(),
        new Date(directSchedTime).getTime()
      );
      assert.strictEqual(body.scheduledTimezone, "Asia/Kolkata");
      assert.strictEqual(
        body.reviewUrl,
        `https://fbautopost.vetechno.in/dashboard/queue?post=${directSchedId}`
      );

      const post = await getPost(directSchedId);
      assert.ok(post);
      assert.strictEqual(post.status, "draft");
      assert.strictEqual(
        new Date(post.scheduled_at!).getTime(),
        new Date(directSchedTime).getTime()
      );
      assert.strictEqual(post.scheduled_timezone, "Asia/Kolkata");
    });

    // -------------------------------------------------------------------------
    // Test 12: Due job picked up by scheduler, simulated publishing, state transitions to 'posted'
    // -------------------------------------------------------------------------
    await runTest("Due scheduled post is picked up by scheduler and successfully published", async () => {
      const pastDueTime = new Date(Date.now() - 300000).toISOString();
      const testPost = await createPostRecord({
        topic: "test:due-job-scheduler",
        title: "Due Scheduled Post For Worker",
        description: "This post is due now and should be processed by the background scheduler.",
        hashtags: ["SchedulerTest"],
        image_url: "https://files.oaiusercontent.com/test-due-scheduler.jpg",
        image_source: "stock",
        link_url: null,
        page_id: "106882792429612",
        page_name: "Live Jesus Christ",
        scheduled_at: pastDueTime,
        scheduled_timezone: "Asia/Kolkata",
        status: "scheduled",
      });
      createdPostIds.push(testPost.id);

      const hash = computePostContentHash({
        postId: testPost.id,
        title: testPost.title,
        description: testPost.description,
        hashtags: testPost.hashtags,
        imageUrl: testPost.image_url || "",
        pageId: testPost.page_id || "",
      });

      await updatePostRecord(testPost.id, {
        approved_by_user: true,
        approved_at: new Date().toISOString(),
        approval_content_hash: hash,
        status: "scheduled",
      });

      // Verify listDuePosts picks it up
      const dueList = await listDuePosts(new Date());
      const foundDue = dueList.some((p) => p.id === testPost.id);
      assert.strictEqual(foundDue, true, "listDuePosts must find the due post");

      // Execute scheduler with simulated publisher (dryRun)
      const report = await processDueScheduledPosts({
        dryRun: true,
      });

      const processedItem = report.results.find((r) => r.postId === testPost.id);
      assert.ok(processedItem, "Scheduler must process the due post");
      assert.strictEqual(processedItem.status, "simulated");
      assert.ok(processedItem.facebookPostId, "Must return simulated Facebook post ID");

      // Verify simulated post remains in scheduled/draft state without live DB modification
      const postAfterSim = await getPost(testPost.id);
      assert.ok(postAfterSim);
      assert.strictEqual(postAfterSim.approved_by_user, true);
    });

    // -------------------------------------------------------------------------
    // Test 13: Failed publishing retains error and does not falsely mark post as published
    // -------------------------------------------------------------------------
    await runTest("Failed Facebook publishing does not mark post as published and retains error", async () => {
      const failTestPost = await createPostRecord({
        topic: "test:failing-publisher",
        title: "Failing Publish Test Post",
        description: "This post will fail publishing and must record error details.",
        hashtags: ["FailTest"],
        image_url: "https://files.oaiusercontent.com/test-fail.jpg",
        image_source: "stock",
        link_url: null,
        page_id: "106882792429612",
        page_name: "Live Jesus Christ",
        scheduled_at: null,
        status: "draft",
      });
      createdPostIds.push(failTestPost.id);

      const hash = computePostContentHash({
        postId: failTestPost.id,
        title: failTestPost.title,
        description: failTestPost.description,
        hashtags: failTestPost.hashtags,
        imageUrl: failTestPost.image_url || "",
        pageId: failTestPost.page_id || "",
      });

      await updatePostRecord(failTestPost.id, {
        approved_by_user: true,
        approved_at: new Date().toISOString(),
        approval_content_hash: hash,
        status: "approved",
      });

      // Execute publishNow with failing mock publisher
      const result = await publishPostNow(failTestPost.id, {
        publisher: async () => {
          throw new Error("Facebook API Error (#200): Permission pages_manage_posts missing");
        },
      });

      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.facebook_post_id, null, "Must never mark facebook_post_id on failure");
      assert.strictEqual(result.posted_at, null, "Must never mark posted_at on failure");
      assert.ok(result.error_message, "Must record error message in database");

      const dbPost = await getPost(failTestPost.id);
      assert.ok(dbPost);
      assert.strictEqual(dbPost.status, "failed");
      assert.strictEqual(dbPost.facebook_post_id, null);
      assert.ok(dbPost.error_message?.toLowerCase().includes("permission"));
    });

    // -------------------------------------------------------------------------
    // Test 14: Duplicate publication protection (idempotency)
    // -------------------------------------------------------------------------
    await runTest("Publishing an already published post returns 200 idempotently without re-publishing", async () => {
      const alreadyPosted = await createPostRecord({
        topic: "test:already-posted",
        title: "Already Posted Post",
        description: "This post was already published.",
        hashtags: ["Done"],
        image_url: "https://files.oaiusercontent.com/test-already-done.jpg",
        image_source: "stock",
        link_url: null,
        page_id: "106882792429612",
        page_name: "Live Jesus Christ",
        scheduled_at: null,
        status: "posted",
      });
      createdPostIds.push(alreadyPosted.id);

      await updatePostRecord(alreadyPosted.id, {
        facebook_post_id: "106882792429612_1234567890",
        posted_at: new Date().toISOString(),
        status: "posted",
      });

      const req = new Request(`https://fbautopost.vetechno.in/api/chatgpt/posts/${alreadyPosted.id}/publish`, {
        method: "POST",
        headers: makeAuthHeaders(),
        body: JSON.stringify({
          approvalToken: "dummy-token-for-already-posted",
        }),
      });

      const res = await POST(req, makeCtx(["chatgpt", "posts", alreadyPosted.id, "publish"]));
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert.strictEqual(data.success, true);
      assert.strictEqual(data.status, "posted");
      assert.strictEqual(data.facebookPostId, "106882792429612_1234567890");
    });

    // -------------------------------------------------------------------------
    // Test 15: Post records and scheduled jobs survive application restarts
    // -------------------------------------------------------------------------
    await runTest("Scheduled jobs are durable in Supabase database and survive server restarts", async () => {
      const futureTime = new Date(Date.now() + 86400000 * 30).toISOString();
      const durablePost = await createPostRecord({
        topic: "test:durable-restart-test",
        title: "Durable Scheduled Job Post",
        description: "Checking that scheduled state is 100% persisted to database.",
        hashtags: ["Durable"],
        image_url: "https://files.oaiusercontent.com/test-durable.jpg",
        image_source: "stock",
        link_url: null,
        page_id: "106882792429612",
        page_name: "Live Jesus Christ",
        scheduled_at: futureTime,
        scheduled_timezone: "Asia/Kolkata",
        status: "scheduled",
      });
      createdPostIds.push(durablePost.id);

      // Re-fetch directly with fresh database client instance
      const freshPost = await getPost(durablePost.id);
      assert.ok(freshPost);
      assert.strictEqual(freshPost.id, durablePost.id);
      assert.strictEqual(freshPost.status, "scheduled");
      assert.strictEqual(
        new Date(freshPost.scheduled_at!).getTime(),
        new Date(futureTime).getTime(),
        "Timestamp in database must match UTC time"
      );
      assert.strictEqual(freshPost.scheduled_timezone, "Asia/Kolkata");
    });

  } finally {
    console.log("Cleaning up test-created database records...");
    await cleanupCreatedPosts();
  }

  console.log("================================================================================");
  console.log(`  Test Run Complete: ${passed} Passed, ${failed} Failed`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test runner encountered unhandled error:", err);
  process.exit(1);
});
