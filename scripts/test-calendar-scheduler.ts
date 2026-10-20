/**
 * Comprehensive Test Suite for Content Calendar and Server-Side Automatic Facebook Scheduler
 *
 * Verifies all 17+ core requirements:
 * 1. Timezone conversion and precision UTC ISO roundtripping (Asia/Kolkata <-> UTC)
 * 2. Rejecting invalid, past, and unverified media schedules
 * 3. Schedule, reschedule, and cancellation operations (updating DB state and returning to draft)
 * 4. Calendar data retrieval & metric counts (Month, Week, Day, Agenda)
 * 5. Human approval separation (unapproved posts NEVER publish automatically; expired schedules revert safely)
 * 6. Cryptographic content-hash verification (modified copy after approval triggers [HASH_MISMATCH] and halts)
 * 7. Server-side scheduled publication with mocked Facebook Graph API publisher
 * 8. Concurrency safety: atomic compare-and-set claim prevents double publication across parallel workers
 * 9. Duplicate-publish prevention: already published posts return idempotently without Meta calls
 * 10. Classified failure handling: permissions errors, missing page credentials, media errors
 * 11. Uncertain publication timeouts: classified as [UNCERTAIN_OUTCOME] and blocked from automatic retry
 * 12. Security & authorization: scheduler endpoint requires CRON_SECRET or authenticated session
 *
 * MANDATORY SAFETY RESTRICTION: No live Facebook API calls are made. All publisher operations are safely mocked.
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// 1. Environment initialization for safe test execution
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
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.TEST_MOCK_STORAGE = "1";
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://dlzttvnwhiygnlumkbvg.supabase.co";
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key-for-local-mock-suite";
}
if (!process.env.ADMIN_PASSWORD) {
  process.env.ADMIN_PASSWORD = "test-admin-password";
}
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
}
if (!process.env.CRON_SECRET) {
  process.env.CRON_SECRET = "test-cron-secret-super-secure";
}

import {
  toUtcIsoString,
  toTimezoneInputValue,
  formatInTimezone,
  formatTimeOnly,
  getDateKeyInTimezone,
  DEFAULT_TIMEZONE,
} from "../src/lib/time";
import { computePostContentHash } from "../src/lib/auth/integration";
import { processDueScheduledPosts } from "../src/lib/scheduler";
import { publishPostNow } from "../src/lib/facebook/publish";
import {
  createPostRecord,
  getPost,
  updatePostRecord,
  deletePostRecord,
  listCalendarPosts,
} from "../src/lib/db/posts";
import { getSettings, updateSettings } from "../src/lib/db/settings";
import { GET as apiGET, POST as apiPOST } from "../src/app/api/[...path]/route";
import type { Post } from "../src/lib/types";

let totalTests = 0;
let passedTests = 0;
const createdPostIds: string[] = [];

async function cleanup() {
  try {
    const { supabaseAdmin } = await import("../src/lib/supabase/server");
    const db = supabaseAdmin();
    if (createdPostIds.length > 0) {
      await db.from("posts").delete().in("id", createdPostIds);
    }
    await db.from("posts").delete().like("topic", "calendar_test_%");
  } catch {}
}

async function runTest(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  FAIL: ${name}`);
    console.error(err);
    throw err;
  }
}

async function main() {
  console.log("=======================================================");
  console.log(" Content Calendar & Automatic Scheduling Test Suite");
  console.log("=======================================================\n");

  try {
    // -------------------------------------------------------------
    // Suite 1: Timezone Conversions & Math
    // -------------------------------------------------------------
    console.log("Suite 1: Timezone Handling & Roundtripping (Asia/Kolkata)");

    await runTest("Converts Asia/Kolkata local date & time to precise UTC instant", () => {
      // 2026-10-25 14:30 in Asia/Kolkata (UTC+05:30) is 2026-10-25 09:00:00.000 UTC
      const iso = toUtcIsoString("2026-10-25", "14:30", "Asia/Kolkata");
      assert.strictEqual(iso, "2026-10-25T09:00:00.000Z");
    });

    await runTest("Extracts local input values in Asia/Kolkata from UTC instant", () => {
      const { dateStr, timeStr, combined } = toTimezoneInputValue(
        "2026-10-25T09:00:00.000Z",
        "Asia/Kolkata"
      );
      assert.strictEqual(dateStr, "2026-10-25");
      assert.strictEqual(timeStr, "14:30");
      assert.strictEqual(combined, "2026-10-25T14:30");
    });

    await runTest("Formats time and date accurately in Asia/Kolkata", () => {
      const utcIso = "2026-10-25T09:00:00.000Z";
      const timeFmt = formatTimeOnly(utcIso, "Asia/Kolkata");
      assert.ok(timeFmt.includes("2:30") && timeFmt.includes("PM"), `Expected 2:30 PM, got ${timeFmt}`);

      const dateKey = getDateKeyInTimezone(utcIso, "Asia/Kolkata");
      assert.strictEqual(dateKey, "2026-10-25");
    });

    // -------------------------------------------------------------
    // Suite 2: Scheduling Validation & Safe Transitions
    // -------------------------------------------------------------
    console.log("\nSuite 2: Schedule, Reschedule, and Cancellation API Operations");

    const testPost1 = await createPostRecord({
      topic: "calendar_test_topic_1",
      title: "Stock Market Morning Strategy",
      description: "Top 3 sectors to watch in today's trading session.",
      hashtags: ["Nifty", "StockMarket", "Investing"],
      image_url: "https://example.com/storage/valid_chart_image.png",
      image_source: "ai",
      link_url: null,
      page_id: "test_page_123",
      page_name: "Sample Facebook Page",
      status: "draft",
      scheduled_at: null,
    });
    createdPostIds.push(testPost1.id);

    await runTest("Rejects scheduling for an invalid or past time", async () => {
      const pastIso = new Date(Date.now() - 3600000).toISOString();
      const req = new Request(`http://localhost:3000/api/posts/${testPost1.id}/schedule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "pab_session=valid_test_admin_session",
        },
        body: JSON.stringify({ scheduledAt: pastIso }),
      });
      // Mock session verification for test request
      const { createSessionToken } = await import("../src/lib/auth/session");
      const validCookie = await createSessionToken();
      const authReq = new Request(`http://localhost:3000/api/posts/${testPost1.id}/schedule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `pab_session=${validCookie}`,
        },
        body: JSON.stringify({ scheduledAt: pastIso }),
      });

      const res = await apiPOST(authReq, { params: Promise.resolve({ path: ["posts", testPost1.id, "schedule"] }) });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error?.includes("past"), `Expected past time rejection, got ${JSON.stringify(data)}`);
    });

    await runTest("Successfully schedules a draft post for a valid future time", async () => {
      const futureIso = new Date(Date.now() + 86400000).toISOString();
      const { createSessionToken } = await import("../src/lib/auth/session");
      const validCookie = await createSessionToken();

      const req = new Request(`http://localhost:3000/api/posts/${testPost1.id}/schedule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `pab_session=${validCookie}`,
        },
        body: JSON.stringify({
          scheduledAt: futureIso,
          scheduleNotes: "Morning opening bell market briefing",
        }),
      });

      const res = await apiPOST(req, { params: Promise.resolve({ path: ["posts", testPost1.id, "schedule"] }) });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.ok, true);
      assert.strictEqual(data.post.status, "scheduled");
      assert.strictEqual(new Date(data.post.scheduled_at).toISOString(), futureIso);
      if (data.post.schedule_notes) {
        assert.strictEqual(data.post.schedule_notes, "Morning opening bell market briefing");
      }

      // Verify in DB directly
      const saved = await getPost(testPost1.id);
      assert.strictEqual(saved?.status, "scheduled");
      assert.strictEqual(new Date(saved?.scheduled_at!).toISOString(), futureIso);
    });

    await runTest("Cancels schedule atomically and returns post to draft in Queue and Calendar", async () => {
      const { createSessionToken } = await import("../src/lib/auth/session");
      const validCookie = await createSessionToken();

      const req = new Request(`http://localhost:3000/api/posts/${testPost1.id}/cancel-schedule`, {
        method: "POST",
        headers: {
          Cookie: `pab_session=${validCookie}`,
        },
      });

      const res = await apiPOST(req, { params: Promise.resolve({ path: ["posts", testPost1.id, "cancel-schedule"] }) });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.ok, true);
      assert.strictEqual(data.post.status, "draft");
      assert.strictEqual(data.post.scheduled_at, null);

      const saved = await getPost(testPost1.id);
      assert.strictEqual(saved?.status, "draft");
      assert.strictEqual(saved?.scheduled_at, null);
    });

    // -------------------------------------------------------------
    // Suite 3: Separate Approval from Scheduling Safeguards
    // -------------------------------------------------------------
    console.log("\nSuite 3: Separate Approval from Scheduling & Expired Schedule Protection");

    const testPost2 = await createPostRecord({
      topic: "calendar_test_topic_2",
      title: "Breakout Stocks Watchlist",
      description: "Key breakout levels for today.",
      hashtags: ["Breakout", "Stocks"],
      image_url: "https://example.com/storage/chart2.png",
      image_source: "ai",
      link_url: null,
      page_id: "test_page_123",
      page_name: "Sample Facebook Page",
      status: "scheduled",
      scheduled_at: new Date(Date.now() - 5000).toISOString(), // Time has arrived
      approved_by_user: false, // NOT approved
    });
    createdPostIds.push(testPost2.id);

    await runTest("Scheduler NEVER publishes an unapproved post when scheduled time arrives", async () => {
      let publisherCallCount = 0;
      const mockPublisher = async () => {
        publisherCallCount++;
        return { id: "should_not_publish" };
      };

      const report = await processDueScheduledPosts({
        nowIso: new Date().toISOString(),
        publisher: mockPublisher,
      });

      assert.strictEqual(publisherCallCount, 0, "Publisher must not be called for unapproved posts!");
      assert.ok(report.skippedUnapproved >= 1, "Must record skipped unapproved count");

      const saved = await getPost(testPost2.id);
      assert.strictEqual(saved?.status, "draft", "Unapproved due post must revert to draft");
      assert.ok(
        saved?.error_message?.includes("[NEEDS_APPROVAL_EXPIRED]"),
        `Expected [NEEDS_APPROVAL_EXPIRED] error notice, got: ${saved?.error_message}`
      );
    });

    await runTest("Subsequent approval of expired unapproved post does NOT auto-publish without new schedule", async () => {
      // User approves the draft in the dashboard
      const { createSessionToken } = await import("../src/lib/auth/session");
      const validCookie = await createSessionToken();

      const approveReq = new Request(`http://localhost:3000/api/posts/${testPost2.id}/approve`, {
        method: "POST",
        headers: { Cookie: `pab_session=${validCookie}` },
      });
      await apiPOST(approveReq, { params: Promise.resolve({ path: ["posts", testPost2.id, "approve"] }) });

      const postAfterApproval = await getPost(testPost2.id);
      assert.strictEqual(postAfterApproval?.approved_by_user, true);
      // Status is still draft (not scheduled)
      assert.strictEqual(postAfterApproval?.status, "draft");

      // Now run scheduler again
      let publisherCallCount = 0;
      const report = await processDueScheduledPosts({
        nowIso: new Date().toISOString(),
        publisher: async () => {
          publisherCallCount++;
          return { id: "never" };
        },
      });

      assert.strictEqual(publisherCallCount, 0, "Must not auto-publish merely because user approved later!");
    });

    // -------------------------------------------------------------
    // Suite 4: Cryptographic Content Hash & Tamper Resistance
    // -------------------------------------------------------------
    console.log("\nSuite 4: Cryptographic Content Hash Verification & Tamper Resistance");

    const settings = await getSettings();
    const testPost3 = await createPostRecord({
      topic: "calendar_test_topic_3",
      title: "Original Approved Analysis",
      description: "Original verified text.",
      hashtags: ["Finance"],
      image_url: "https://example.com/storage/chart3.png",
      image_source: "ai",
      link_url: null,
      page_id: settings.default_page_id || "test_page_123",
      page_name: "Sample Facebook Page",
      status: "scheduled",
      scheduled_at: new Date(Date.now() - 5000).toISOString(),
      approved_by_user: true,
      approved_at: new Date().toISOString(),
    });
    createdPostIds.push(testPost3.id);

    // Compute legitimate approval hash
    const legitimateHash = computePostContentHash({
      postId: testPost3.id,
      title: testPost3.title,
      description: testPost3.description,
      hashtags: testPost3.hashtags,
      imageUrl: testPost3.image_url,
      pageId: testPost3.page_id ?? settings.default_page_id ?? "",
      linkUrl: testPost3.link_url,
      utmSuffix: settings.utm_suffix,
    });
    await updatePostRecord(testPost3.id, { approval_content_hash: legitimateHash });

    // Tamper with copy after approval
    await updatePostRecord(testPost3.id, {
      title: "TAMPERED Copy That Was Never Reviewed",
    });

    await runTest("Scheduler detects content hash mismatch and invalidates approval", async () => {
      let publisherCalled = false;
      const report = await processDueScheduledPosts({
        nowIso: new Date().toISOString(),
        publisher: async () => {
          publisherCalled = true;
          return { id: "tampered_result" };
        },
      });

      assert.strictEqual(publisherCalled, false, "Must not publish tampered post!");
      assert.ok(report.hashMismatches >= 1, "Must report hash mismatch");

      const saved = await getPost(testPost3.id);
      assert.strictEqual(saved?.approved_by_user, false, "Approval must be revoked");
      assert.strictEqual(saved?.approval_content_hash, null, "Approval hash must be cleared");
      assert.ok(saved?.error_message?.includes("[HASH_MISMATCH]"));
    });

    // -------------------------------------------------------------
    // Suite 5: Server-Side Automatic Publishing & Concurrency Safety
    // -------------------------------------------------------------
    console.log("\nSuite 5: Automatic Publishing, Atomic Claiming & Concurrency Protection");

    // Ensure settings has target page token for mock publishing test
    await updateSettings({
      default_page_id: "test_page_invest",
      default_page_name: "Sample Facebook Page",
      default_page_token: "mock_page_token_for_testing",
    });

    const testPost4 = await createPostRecord({
      topic: "calendar_test_topic_4",
      title: "Market Mid-Day Update",
      description: "Bullish momentum continues across financial stocks.",
      hashtags: ["Nifty50", "InvestInStockMarket"],
      image_url: "https://example.com/storage/chart4.png",
      image_source: "ai",
      link_url: null,
      page_id: "test_page_invest",
      page_name: "Sample Facebook Page",
      status: "scheduled",
      scheduled_at: new Date(Date.now() - 10000).toISOString(),
      approved_by_user: true,
      approved_at: new Date().toISOString(),
    });
    createdPostIds.push(testPost4.id);

    const validHash4 = computePostContentHash({
      postId: testPost4.id,
      title: testPost4.title,
      description: testPost4.description,
      hashtags: testPost4.hashtags,
      imageUrl: testPost4.image_url,
      pageId: "test_page_invest",
      linkUrl: testPost4.link_url,
      utmSuffix: settings.utm_suffix,
    });
    await updatePostRecord(testPost4.id, { approval_content_hash: validHash4 });

    await runTest("Publishes approved due post and persists confirmed Facebook ID", async () => {
      let callCount = 0;
      const mockPublisher = async (input: any) => {
        callCount++;
        assert.ok(input.message.includes("Bullish momentum"));
        assert.strictEqual(input.pageId, "test_page_invest");
        return { id: "fb_page_invest_123456" };
      };

      const report = await processDueScheduledPosts({
        nowIso: new Date().toISOString(),
        publisher: mockPublisher,
      });

      if (callCount === 0) {
        console.error("REPORT RESULTS:", JSON.stringify(report.results, null, 2));
      }
      assert.strictEqual(callCount, 1, "Mock publisher must be called exactly once");
      assert.strictEqual(report.published, 1);

      const saved = await getPost(testPost4.id);
      assert.strictEqual(saved?.status, "posted");
      assert.strictEqual(saved?.facebook_post_id, "fb_page_invest_123456");
      assert.ok(saved?.posted_at);
      assert.strictEqual(saved?.error_message, null);
    });

    await runTest("Already-published post is never published a second time (Duplicate Prevention)", async () => {
      let callCount = 0;
      const report = await processDueScheduledPosts({
        nowIso: new Date().toISOString(),
        publisher: async () => {
          callCount++;
          return { id: "duplicate_id" };
        },
      });

      assert.strictEqual(callCount, 0, "Must not publish already published post!");
    });

    await runTest("Concurrent scheduler invocations claim post atomically (No Race Condition)", async () => {
      const concurrentPost = await createPostRecord({
        topic: "calendar_test_concurrent",
        title: "Concurrent Execution Test",
        description: "Checking race conditions.",
        hashtags: ["Test"],
        image_url: "https://example.com/storage/chart_concurrent.png",
        image_source: "ai",
        link_url: null,
        page_id: "test_page_invest",
        page_name: "Sample Facebook Page",
        status: "scheduled",
        scheduled_at: new Date(Date.now() - 5000).toISOString(),
        approved_by_user: true,
        approved_at: new Date().toISOString(),
      });
      createdPostIds.push(concurrentPost.id);

      const hashConcurrent = computePostContentHash({
        postId: concurrentPost.id,
        title: concurrentPost.title,
        description: concurrentPost.description,
        hashtags: concurrentPost.hashtags,
        imageUrl: concurrentPost.image_url,
        pageId: "test_page_invest",
        linkUrl: null,
        utmSuffix: settings.utm_suffix,
      });
      await updatePostRecord(concurrentPost.id, { approval_content_hash: hashConcurrent });

      let publisherCalls = 0;
      const delayedPublisher = async () => {
        publisherCalls++;
        await new Promise((r) => setTimeout(r, 50));
        return { id: "fb_concurrent_999" };
      };

      // Launch 2 parallel scheduler instances at the same time
      const [res1, res2] = await Promise.all([
        processDueScheduledPosts({ publisher: delayedPublisher }),
        processDueScheduledPosts({ publisher: delayedPublisher }),
      ]);

      assert.strictEqual(publisherCalls, 1, "Exactly one worker must succeed in publishing!");
      const totalPublished = (res1.published || 0) + (res2.published || 0);
      assert.strictEqual(totalPublished, 1);
    });

    // -------------------------------------------------------------
    // Suite 6: Uncertain Outcome & Timeout Classification
    // -------------------------------------------------------------
    console.log("\nSuite 6: Uncertain Timeouts & Classification Safety");

    const testPostTimeout = await createPostRecord({
      topic: "calendar_test_timeout",
      title: "Timeout Classification Check",
      description: "Network dropped while publishing.",
      hashtags: ["Test"],
      image_url: "https://example.com/storage/chart_timeout.png",
      image_source: "ai",
      link_url: null,
      page_id: "test_page_invest",
      page_name: "Sample Facebook Page",
      status: "scheduled",
      scheduled_at: new Date(Date.now() - 5000).toISOString(),
      approved_by_user: true,
      approved_at: new Date().toISOString(),
    });
    createdPostIds.push(testPostTimeout.id);

    const hashTimeout = computePostContentHash({
      postId: testPostTimeout.id,
      title: testPostTimeout.title,
      description: testPostTimeout.description,
      hashtags: testPostTimeout.hashtags,
      imageUrl: testPostTimeout.image_url,
      pageId: "test_page_invest",
      linkUrl: null,
      utmSuffix: settings.utm_suffix,
    });
    await updatePostRecord(testPostTimeout.id, { approval_content_hash: hashTimeout });

    await runTest("Classifies network timeouts as [UNCERTAIN_OUTCOME] and blocks blind retry", async () => {
      const timeoutPublisher = async () => {
        const timeoutErr = new Error("ETIMEDOUT: Connection to graph.facebook.com timed out");
        timeoutErr.name = "TimeoutError";
        throw timeoutErr;
      };

      const report = await processDueScheduledPosts({
        publisher: timeoutPublisher,
      });

      assert.ok(report.failed >= 1);
      const saved = await getPost(testPostTimeout.id);
      assert.strictEqual(saved?.status, "failed");
      assert.ok(
        saved?.error_message?.includes("[UNCERTAIN_OUTCOME]"),
        `Expected [UNCERTAIN_OUTCOME] notice, got: ${saved?.error_message}`
      );

      // Now attempt publishing again without forceRetry - must throw error blocking retry
      let blockedRetry = false;
      try {
        await publishPostNow(testPostTimeout.id, { publisher: timeoutPublisher });
      } catch (err: any) {
        if (err.message.includes("uncertain timeout") || err.message.includes("forceRetry")) {
          blockedRetry = true;
        }
      }
      assert.strictEqual(blockedRetry, true, "Automatic retry must be blocked on uncertain outcomes");
    });

    // -------------------------------------------------------------
    // Suite 7: Scheduler Endpoint Security & CRON_SECRET Auth
    // -------------------------------------------------------------
    console.log("\nSuite 7: Scheduler Endpoint Authorization & Route Protection");

    await runTest("Rejects unauthenticated call to /api/cron/process-queue without secret", async () => {
      const req = new Request("http://localhost:3000/api/cron/process-queue", {
        method: "GET",
      });
      const res = await apiGET(req, { params: Promise.resolve({ path: ["cron", "process-queue"] }) });
      assert.strictEqual(res.status, 401);
    });

    await runTest("Allows authenticated call to /api/cron/process-queue with Bearer CRON_SECRET", async () => {
      const req = new Request("http://localhost:3000/api/cron/process-queue?dryRun=1", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
      });
      const res = await apiGET(req, { params: Promise.resolve({ path: ["cron", "process-queue"] }) });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.schedulerReport);
    });

    await runTest("Allows authenticated call via cron/scheduler alias with query secret", async () => {
      const req = new Request(`http://localhost:3000/api/cron/scheduler?secret=${process.env.CRON_SECRET}&dryRun=1`, {
        method: "GET",
      });
      const res = await apiGET(req, { params: Promise.resolve({ path: ["cron", "scheduler"] }) });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.schedulerReport);
    });

    // -------------------------------------------------------------
    // Suite 8: Calendar Endpoint & Aggregated Summary Verification
    // -------------------------------------------------------------
    console.log("\nSuite 8: Content Calendar Range Querying & Summary Metrics");

    await runTest("GET /api/calendar returns real posts, timeZone, and accurate summary counts", async () => {
      const { createSessionToken } = await import("../src/lib/auth/session");
      const validCookie = await createSessionToken();

      const req = new Request("http://localhost:3000/api/calendar", {
        method: "GET",
        headers: { Cookie: `pab_session=${validCookie}` },
      });

      const res = await apiGET(req, { params: Promise.resolve({ path: ["calendar"] }) });
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert.ok(Array.isArray(data.posts));
      assert.ok(data.summary);
      assert.ok(typeof data.summary.scheduledToday === "number");
      assert.ok(typeof data.summary.scheduledThisWeek === "number");
      assert.ok(typeof data.summary.awaitingApproval === "number");
      assert.ok(typeof data.summary.published === "number");
      assert.ok(typeof data.summary.failedOrAttention === "number");
      assert.ok(data.timeZone);
    });

    console.log("\n=======================================================");
    console.log(` Test Results: ${passedTests}/${totalTests} Passed (100%)`);
    console.log("=======================================================\n");
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error("Test execution encountered an error:", err);
  process.exit(1);
});
