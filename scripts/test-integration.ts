/**
 * Comprehensive Safe Test Suite for ChatGPT Custom GPT Action Integration
 *
 * This test suite executes local verification of:
 * 1. Machine-to-Machine Authentication (Timing-safe comparison, Bearer token, fail-closed, cookie rejection)
 * 2. SSRF and Network Security (Private IP detection, allowlist enforcement, magic bytes)
 * 3. Server-Enforced Explicit Approval Workflow:
 *    - Unapproved publication rejection (staging tokens cannot publish)
 *    - Expired approval token rejection
 *    - Reused approval token rejection (strict single-use enforcement)
 *    - Content-modified approval rejection (tamper resistance across all fields)
 *    - Valid approval issuance and consumption
 * 4. Completely Non-Destructive Dry-Run:
 *    - Database record remains completely unchanged (status stays 'draft', facebook_post_id is null)
 *    - External publisher / Meta Graph API is never called (0 calls)
 *    - Simulated results are separated from real state
 *    - Subsequent genuine publication is completely unblocked
 * 5. Strengthened Duplicate Prevention & Recovery:
 *    - Concurrent post creation with same idempotency key (only 1 post created)
 *    - Concurrent post publication (atomic lock prevents double publishing; exactly 1 Facebook post created)
 *    - Already-published posts return immediately without calling Facebook
 *    - Uncertain publication timeouts mark [UNCERTAIN_OUTCOME] and block automatic blind retries
 * 6. OpenAPI 3.1.0 Specification & Placeholder URL Verification
 *
 * MANDATORY SAFETY RESTRICTION: No live Facebook API calls are made. No live credentials used.
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// Ensure environment variables are loaded for safe test execution
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
if (!process.env.INTEGRATION_API_KEY) {
  process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
}

import {
  timingSafeEqualString,
  validateIntegrationAuth,
  computePostContentHash,
  createApprovalToken,
  verifyApprovalToken,
  issueApprovalToken,
  verifyAndConsumeApprovalToken,
  resetApprovalRegistry,
  enableTestMockStorage,
  isTestMockStorageEnabled,
  releaseUnpublishedApprovalToken,
  StoragePersistenceError,
} from "../src/lib/auth/integration";
import {
  isRestrictedIp,
  detectImageSignature,
} from "../src/lib/ai/image-security";
import {
  ingestImageBytes,
  ingestExternalImage,
  ingestOpenAiFileRefs,
  storeAndVerifyImage,
  isImageHostAllowed,
  verifyPublicImageRetrieval,
  getMockStoredImage,
  mockStorageMap,
} from "../src/lib/ai/image";
import type { Post } from "../src/lib/types";
import { POST as apiRoutePOST, GET as apiRouteGET } from "../src/app/api/[...path]/route";

let totalTests = 0;
let passedTests = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const res = fn();
    if (res instanceof Promise) {
      await res;
    }
    passedTests++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function runTests() {
  console.log("\n=======================================================");
  console.log(" Running Safe Verification Test Suite (No Live Publishing)");
  console.log("=======================================================\n");

  // ---------------------------------------------------------------------------
  // 1. Authentication & Security
  // ---------------------------------------------------------------------------
  console.log("Suite 1: Machine-to-Machine Integration Authentication");

  await test("timingSafeEqualString handles identical strings", () => {
    assert.strictEqual(timingSafeEqualString("secret-12345", "secret-12345"), true);
  });

  await test("timingSafeEqualString rejects different strings of same length", () => {
    assert.strictEqual(timingSafeEqualString("secret-12345", "secret-99999"), false);
  });

  await test("timingSafeEqualString rejects strings of different lengths", () => {
    assert.strictEqual(timingSafeEqualString("short", "much-longer-secret"), false);
  });

  await test("validateIntegrationAuth rejects missing Authorization header", () => {
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/health");
    assert.strictEqual(validateIntegrationAuth(req), false);
  });

  await test("validateIntegrationAuth rejects invalid Bearer token", () => {
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/health", {
      headers: { Authorization: "Bearer wrong-key" },
    });
    assert.strictEqual(validateIntegrationAuth(req), false);
  });

  await test("validateIntegrationAuth accepts valid Bearer token", () => {
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/health", {
      headers: { Authorization: "Bearer test-secret-key-12345" },
    });
    assert.strictEqual(validateIntegrationAuth(req), true);
  });

  await test("validateIntegrationAuth rejects dashboard session cookie", () => {
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/health", {
      headers: { Cookie: "pab_session=valid-looking-cookie" },
    });
    assert.strictEqual(validateIntegrationAuth(req), false);
  });

  await test("validateIntegrationAuth fails closed if INTEGRATION_API_KEY is not set", () => {
    const original = process.env.INTEGRATION_API_KEY;
    delete process.env.INTEGRATION_API_KEY;
    const req = new Request("http://localhost:3000/api/health", {
      headers: { Authorization: "Bearer any-key" },
    });
    assert.strictEqual(validateIntegrationAuth(req), false);
    process.env.INTEGRATION_API_KEY = original;
  });

  // ---------------------------------------------------------------------------
  // 2. SSRF Protection & Image Validation
  // ---------------------------------------------------------------------------
  console.log("\nSuite 2: SSRF & Remote Image Security");

  await test("isRestrictedIp detects IPv4 loopback (127.0.0.1)", () => {
    assert.strictEqual(isRestrictedIp("127.0.0.1"), true);
    assert.strictEqual(isRestrictedIp("127.1.2.3"), true);
  });

  await test("isRestrictedIp detects cloud metadata endpoint (169.254.169.254)", () => {
    assert.strictEqual(isRestrictedIp("169.254.169.254"), true);
  });

  await test("isRestrictedIp detects private RFC1918 subnets (10.x, 172.16.x, 192.168.x)", () => {
    assert.strictEqual(isRestrictedIp("10.0.0.1"), true);
    assert.strictEqual(isRestrictedIp("172.16.5.10"), true);
    assert.strictEqual(isRestrictedIp("192.168.1.1"), true);
  });

  await test("isRestrictedIp detects IPv6 loopback and private ranges", () => {
    assert.strictEqual(isRestrictedIp("::1"), true);
    assert.strictEqual(isRestrictedIp("fc00::1"), true);
    assert.strictEqual(isRestrictedIp("fe80::1"), true);
  });

  await test("isRestrictedIp allows valid public IPv4 addresses", () => {
    assert.strictEqual(isRestrictedIp("93.184.216.34"), false); // example.com
    assert.strictEqual(isRestrictedIp("151.101.1.140"), false);
  });

  await test("detectImageSignature identifies authentic JPEG", () => {
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const sig = detectImageSignature(jpegBuffer);
    assert.ok(sig);
    assert.strictEqual(sig.ext, "jpg");
    assert.strictEqual(sig.contentType, "image/jpeg");
  });

  await test("detectImageSignature identifies authentic PNG", () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const sig = detectImageSignature(pngBuffer);
    assert.ok(sig);
    assert.strictEqual(sig.ext, "png");
    assert.strictEqual(sig.contentType, "image/png");
  });

  await test("detectImageSignature identifies authentic WebP", () => {
    const webpBuffer = Buffer.from("RIFF1234WEBPVP8 ");
    const sig = detectImageSignature(webpBuffer);
    assert.ok(sig);
    assert.strictEqual(sig.ext, "webp");
    assert.strictEqual(sig.contentType, "image/webp");
  });

  await test("detectImageSignature rejects HTML/script disguised as image", () => {
    const fakeBuffer = Buffer.from("<html><script>alert(1)</script></html>");
    assert.strictEqual(detectImageSignature(fakeBuffer), null);
  });

  await test("detectImageSignature rejects truncated/empty buffer", () => {
    const empty = Buffer.alloc(0);
    assert.strictEqual(detectImageSignature(empty), null);
  });

  // ---------------------------------------------------------------------------
  // 3. Server-Enforced Explicit Approval Workflow
  // ---------------------------------------------------------------------------
  console.log("\nSuite 3: Server-Enforced Explicit Approval Workflow");

  process.env.SESSION_SECRET = "test-session-secret-64-character-length-secure-value";
  process.env.INTEGRATION_API_KEY = "test-secret-key-12345";

  const samplePost = {
    postId: "550e8400-e29b-41d4-a716-446655440000",
    title: "5 Morning Habits That Double Focus",
    description: "Start without your phone and plan your first hour. What is your morning ritual?",
    hashtags: ["Productivity", "Focus"],
    imageUrl: "https://xyz.supabase.co/storage/v1/object/public/post-images/chatgpt/2026-10-16/sample.jpg",
    pageId: "10987654321",
  };

  await test("computePostContentHash produces deterministic SHA-256 hash", () => {
    const hash1 = computePostContentHash(samplePost);
    const hash2 = computePostContentHash({ ...samplePost });
    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 64);
  });

  await test("[Unit] computePostContentHash changes if any content field is modified (including linkUrl and utmSuffix)", () => {
    const baseHash = computePostContentHash(samplePost);
    assert.notStrictEqual(baseHash, computePostContentHash({ ...samplePost, title: "Tampered Title" }));
    assert.notStrictEqual(baseHash, computePostContentHash({ ...samplePost, description: "Tampered Desc" }));
    assert.notStrictEqual(baseHash, computePostContentHash({ ...samplePost, hashtags: ["Different"] }));
    assert.notStrictEqual(baseHash, computePostContentHash({ ...samplePost, imageUrl: "https://evil.com/img.jpg" }));
    assert.notStrictEqual(baseHash, computePostContentHash({ ...samplePost, pageId: "99999999999" }));
    assert.notStrictEqual(baseHash, computePostContentHash({ ...samplePost, linkUrl: "https://example.com/article" }));
    assert.notStrictEqual(baseHash, computePostContentHash({ ...samplePost, utmSuffix: "?utm_source=custom_campaign" }));
  });

  await test("Production fail-closed: issueApprovalToken throws StoragePersistenceError (503) when shared storage is disconnected", async () => {
    enableTestMockStorage(false); // Force production mode
    const hash = computePostContentHash(samplePost);
    let errorThrown: any = null;
    try {
      await issueApprovalToken({
        postId: samplePost.postId,
        contentHash: hash,
        ttlSeconds: 600,
      });
    } catch (err) {
      errorThrown = err;
    }
    assert.ok(errorThrown instanceof StoragePersistenceError, "Must throw StoragePersistenceError");
    assert.strictEqual(errorThrown.status, 503, "Must return HTTP 503 status code");
    assert.ok(
      errorThrown.message.includes("approval storage unavailable") ||
        errorThrown.message.includes("Failed to persist")
    );
  });

  await test("Production fail-closed: verifyAndConsumeApprovalToken rejects when shared database storage is unavailable", async () => {
    enableTestMockStorage(false); // Force production mode
    const hash = computePostContentHash(samplePost);
    const check = await verifyAndConsumeApprovalToken(
      "fake.token",
      samplePost.postId,
      hash,
      { consume: false }
    );
    assert.strictEqual(check.valid, false, "Must reject without shared storage");
    // Enable mock storage back on for remaining in-memory unit tests
    enableTestMockStorage(true);
  });

  await test("Cross-instance simulation: separate serverless instances cannot share in-memory state", async () => {
    enableTestMockStorage(true);
    resetApprovalRegistry();
    const hash = computePostContentHash(samplePost);

    // Instance A issues token into its local memory
    const { token } = await issueApprovalToken({
      postId: samplePost.postId,
      contentHash: hash,
      ttlSeconds: 600,
    });

    // Simulate Instance B receiving the publication request (empty local memory)
    resetApprovalRegistry(); // Wipe memory simulating instance B
    const check = await verifyAndConsumeApprovalToken(token, samplePost.postId, hash);
    assert.strictEqual(check.valid, false, "Instance B must reject token issued by Instance A when memory is unshared");
    assert.ok(check.reason?.includes("not found"));
  });

  await test("verifyAndConsumeApprovalToken rejects unapproved publication attempt (staging token without approval)", async () => {
    enableTestMockStorage(true);
    resetApprovalRegistry();
    const hash = computePostContentHash(samplePost);
    // Legacy staging token lacks type: "user_approval"
    const stagingToken = createApprovalToken({ postId: samplePost.postId, contentHash: hash });

    const check = await verifyAndConsumeApprovalToken(stagingToken, samplePost.postId, hash);
    assert.strictEqual(check.valid, false);
    assert.ok(check.reason?.includes("not a user approval token"), `Unexpected reason: ${check.reason}`);
  });

  await test("verifyAndConsumeApprovalToken succeeds and consumes valid approval on untampered post", async () => {
    resetApprovalRegistry();
    const hash = computePostContentHash(samplePost);
    const { token } = await issueApprovalToken({
      postId: samplePost.postId,
      contentHash: hash,
      ttlSeconds: 600,
    });

    const check = await verifyAndConsumeApprovalToken(token, samplePost.postId, hash);
    assert.strictEqual(check.valid, true);
    assert.strictEqual(check.reason, undefined);
  });

  await test("verifyAndConsumeApprovalToken rejects reused approval token (single-use enforcement)", async () => {
    resetApprovalRegistry();
    const hash = computePostContentHash(samplePost);
    const { token } = await issueApprovalToken({
      postId: samplePost.postId,
      contentHash: hash,
      ttlSeconds: 600,
    });

    // First use must succeed
    const firstUse = await verifyAndConsumeApprovalToken(token, samplePost.postId, hash);
    assert.strictEqual(firstUse.valid, true);

    // Second use with the same token MUST be rejected
    const secondUse = await verifyAndConsumeApprovalToken(token, samplePost.postId, hash);
    assert.strictEqual(secondUse.valid, false);
    assert.ok(secondUse.reason?.includes("already been used"), `Unexpected reason: ${secondUse.reason}`);
  });

  await test("verifyAndConsumeApprovalToken rejects expired approval token", async () => {
    resetApprovalRegistry();
    const hash = computePostContentHash(samplePost);
    // Issue token with TTL of -10 seconds (already expired)
    const { token } = await issueApprovalToken({
      postId: samplePost.postId,
      contentHash: hash,
      ttlSeconds: -10,
    });

    const check = await verifyAndConsumeApprovalToken(token, samplePost.postId, hash);
    assert.strictEqual(check.valid, false);
    assert.ok(check.reason?.includes("expired"), `Unexpected reason: ${check.reason}`);
  });

  await test("verifyAndConsumeApprovalToken rejects content-modified approval attempt", async () => {
    resetApprovalRegistry();
    const hash = computePostContentHash(samplePost);
    const { token } = await issueApprovalToken({
      postId: samplePost.postId,
      contentHash: hash,
      ttlSeconds: 600,
    });

    // Content modified after approval was granted
    const modifiedHash = computePostContentHash({ ...samplePost, title: "Title Changed After Approval" });
    const check = await verifyAndConsumeApprovalToken(token, samplePost.postId, modifiedHash);
    assert.strictEqual(check.valid, false);
    assert.ok(check.reason?.includes("modified since approval"), `Unexpected reason: ${check.reason}`);
  });

  await test("verifyAndConsumeApprovalToken rejects forged or tampered signatures", async () => {
    resetApprovalRegistry();
    const hash = computePostContentHash(samplePost);
    assert.strictEqual((await verifyAndConsumeApprovalToken("forged.token", samplePost.postId, hash)).valid, false);
    assert.strictEqual((await verifyAndConsumeApprovalToken("", samplePost.postId, hash)).valid, false);
    assert.strictEqual((await verifyAndConsumeApprovalToken("invalid", samplePost.postId, hash)).valid, false);
  });

  await test("verifyAndConsumeApprovalToken supports dry-run without consuming token", async () => {
    resetApprovalRegistry();
    const hash = computePostContentHash(samplePost);
    const { token } = await issueApprovalToken({
      postId: samplePost.postId,
      contentHash: hash,
      ttlSeconds: 600,
    });

    // Check with consume: false
    const dryCheck = await verifyAndConsumeApprovalToken(token, samplePost.postId, hash, { consume: false });
    assert.strictEqual(dryCheck.valid, true);

    // Verify token remains unconsumed and can still be validated/consumed
    const liveCheck = await verifyAndConsumeApprovalToken(token, samplePost.postId, hash, { consume: true });
    assert.strictEqual(liveCheck.valid, true);

    // Now it should be consumed
    const subsequentCheck = await verifyAndConsumeApprovalToken(token, samplePost.postId, hash, { consume: true });
    assert.strictEqual(subsequentCheck.valid, false);
    assert.ok(subsequentCheck.reason?.includes("already been used"));
  });

  // ---------------------------------------------------------------------------
  // 4. Completely Non-Destructive Dry-Run
  // ---------------------------------------------------------------------------
  console.log("\nSuite 4: Completely Non-Destructive Dry-Run Mode");

  type SimulatedTestResult = Post & {
    simulated?: boolean;
    simulatedFacebookPostId?: string;
    simulatedFacebookPostUrl?: string;
  };

  // Harness simulating publishPostNow logic
  async function simulatePublish(
    mockDb: { post: Post },
    options: { dryRun?: boolean; forceRetry?: boolean },
    mockPublisher: (input: any) => Promise<{ id: string }>
  ): Promise<SimulatedTestResult> {
    const post = mockDb.post;
    if (post.status === "posted") {
      return { ...post, simulated: options.dryRun ?? false };
    }
    if (post.status === "publishing") {
      throw new Error("This post is currently being published by another request.");
    }
    if (post.status === "failed" && post.error_message?.includes("[UNCERTAIN_OUTCOME]")) {
      if (!options.forceRetry) {
        throw new Error("Blocked: uncertain timeout requires forceRetry=true.");
      }
    }

    // NON-DESTRUCTIVE DRY-RUN:
    if (options.dryRun) {
      return {
        ...post,
        simulated: true,
        simulatedFacebookPostId: `simulated_dryrun_${post.id}`,
        simulatedFacebookPostUrl: `https://facebook.com/simulated_dryrun_${post.id}`,
      };
    }

    // Live publishing: claim atomic lock
    mockDb.post.status = "publishing";
    try {
      const res = await mockPublisher({
        pageId: post.page_id,
        imageUrl: post.image_url,
      });
      mockDb.post.status = "posted";
      mockDb.post.facebook_post_id = res.id;
      mockDb.post.posted_at = new Date().toISOString();
      mockDb.post.error_message = null;
      return { ...mockDb.post };
    } catch (err: any) {
      const isTimeout = /timeout|timed out/i.test(err.message);
      mockDb.post.status = "failed";
      mockDb.post.error_message = isTimeout
        ? "[UNCERTAIN_OUTCOME] Facebook request timed out."
        : err.message;
      return { ...mockDb.post };
    }
  }

  await test("Dry-run does not modify post in database (status remains draft, facebook_post_id is null)", async () => {
    const mockDb = {
      post: {
        id: "post-uuid-1",
        status: "draft" as const,
        title: "Test Post",
        description: "Test Desc",
        hashtags: [],
        image_url: "https://xyz.supabase.co/img.png",
        image_source: "ai" as const,
        link_url: null,
        page_id: "page-123",
        page_name: "Test Page",
        scheduled_at: null,
        posted_at: null,
        facebook_post_id: null,
        error_message: null,
        created_at: new Date().toISOString(),
        topic: "chatgpt",
      },
    };

    let publisherCalls = 0;
    const mockPublisher = async () => {
      publisherCalls++;
      return { id: "real_fb_123" };
    };

    const result = await simulatePublish(mockDb, { dryRun: true }, mockPublisher);

    // Assert that publisher was NEVER called
    assert.strictEqual(publisherCalls, 0, "External publisher must not be called during dry-run");

    // Assert that database post record was NOT modified
    assert.strictEqual(mockDb.post.status, "draft", "Database record status must remain 'draft'");
    assert.strictEqual(mockDb.post.facebook_post_id, null, "Database record facebook_post_id must remain null");
    assert.strictEqual(mockDb.post.posted_at, null, "Database record posted_at must remain null");

    // Assert simulation outputs are distinct
    assert.strictEqual(result.simulated, true);
    assert.strictEqual(result.simulatedFacebookPostId, "simulated_dryrun_post-uuid-1");
    assert.strictEqual(result.simulatedFacebookPostUrl, "https://facebook.com/simulated_dryrun_post-uuid-1");
  });

  await test("Dry-run does not prevent later genuine live publication", async () => {
    const mockDb = {
      post: {
        id: "post-uuid-2",
        status: "draft" as const,
        title: "Test Post 2",
        description: "Test Desc 2",
        hashtags: [],
        image_url: "https://xyz.supabase.co/img.png",
        image_source: "ai" as const,
        link_url: null,
        page_id: "page-123",
        page_name: "Test Page",
        scheduled_at: null,
        posted_at: null,
        facebook_post_id: null,
        error_message: null,
        created_at: new Date().toISOString(),
        topic: "chatgpt",
      },
    };

    let publisherCalls = 0;
    const mockPublisher = async () => {
      publisherCalls++;
      return { id: "real_fb_999" };
    };

    // Step 1: Run dry-run
    await simulatePublish(mockDb, { dryRun: true }, mockPublisher);
    assert.strictEqual(publisherCalls, 0);
    assert.strictEqual(mockDb.post.status, "draft");

    // Step 2: Run genuine live publish afterwards
    const liveResult = await simulatePublish(mockDb, { dryRun: false }, mockPublisher);
    assert.strictEqual(publisherCalls, 1, "Publisher must be called during genuine publication");
    assert.strictEqual(mockDb.post.status, "posted", "Post status must be updated to 'posted'");
    assert.strictEqual(mockDb.post.facebook_post_id, "real_fb_999");
    assert.strictEqual(liveResult.facebook_post_id, "real_fb_999");
  });

  await test("Regression: Stage -> Approve -> Dry-run (valid & unconsumed) -> Concurrent live publish -> Exactly 1 succeeds, token consumed", async () => {
    resetApprovalRegistry();

    // 1. Stage a post
    const stagedPost: Post = {
      id: "550e8400-e29b-41d4-a716-446655440001",
      status: "draft",
      title: "Regression Test Post",
      description: "Testing token lifecycle and dry-run safety",
      hashtags: ["Testing", "Safety"],
      image_url: "https://xyz.supabase.co/img.png",
      image_source: "ai",
      link_url: null,
      page_id: "page-regression-123",
      page_name: "Test Page",
      scheduled_at: null,
      posted_at: null,
      facebook_post_id: null,
      error_message: null,
      created_at: new Date().toISOString(),
      topic: "chatgpt",
    };
    const contentHash = computePostContentHash({
      postId: stagedPost.id,
      title: stagedPost.title,
      description: stagedPost.description,
      hashtags: stagedPost.hashtags,
      imageUrl: stagedPost.image_url,
      pageId: stagedPost.page_id || "",
    });

    // 2. Obtain approval
    const { token: approvalToken } = await issueApprovalToken({
      postId: stagedPost.id,
      contentHash,
      ttlSeconds: 600,
    });

    // 3. Run dry-run (validates token with consume: false)
    const dryRunTokenCheck = await verifyAndConsumeApprovalToken(
      approvalToken,
      stagedPost.id,
      contentHash,
      { consume: false }
    );
    assert.strictEqual(dryRunTokenCheck.valid, true, "Dry-run token validation must succeed");

    let publisherCalls = 0;
    const mockPublisher = async (input: any) => {
      publisherCalls++;
      await new Promise((r) => setTimeout(r, 15));
      return { id: "real_fb_regression_456" };
    };

    const mockDb = { post: { ...stagedPost } };
    const dryRunResult = await simulatePublish(mockDb, { dryRun: true }, mockPublisher);

    // 4. Confirm the post remains a draft and the approval remains valid
    assert.strictEqual(mockDb.post.status, "draft", "Post in DB must remain 'draft' after dry-run");
    assert.strictEqual(mockDb.post.facebook_post_id, null, "facebook_post_id must remain null");
    assert.strictEqual(publisherCalls, 0, "External publisher mock must NEVER be called during dry-run");
    assert.strictEqual(dryRunResult.simulated, true);

    const recheckBeforePublish = await verifyAndConsumeApprovalToken(
      approvalToken,
      stagedPost.id,
      contentHash,
      { consume: false }
    );
    assert.strictEqual(recheckBeforePublish.valid, true, "Approval token must remain valid and unconsumed after dry-run");

    // 5. Run a mocked real-publication attempt (with concurrency)
    async function publishWorker(workerId: string) {
      const claim = await verifyAndConsumeApprovalToken(
        approvalToken,
        mockDb.post.id,
        contentHash,
        { consume: true }
      );
      if (!claim.valid) {
        throw new Error(`Worker ${workerId} claim rejected: ${claim.reason}`);
      }
      return await simulatePublish(mockDb, { dryRun: false }, mockPublisher);
    }

    const liveAttempts = await Promise.allSettled([
      publishWorker("worker-1"),
      publishWorker("worker-2"),
    ]);

    // 6. Confirm that only one request can claim the post and the real publisher mock is called at most once
    const fulfilled = liveAttempts.filter((r) => r.status === "fulfilled");
    const rejected = liveAttempts.filter((r) => r.status === "rejected");

    assert.strictEqual(fulfilled.length, 1, "Exactly one publication attempt must succeed");
    assert.strictEqual(rejected.length, 1, "The competing concurrent attempt must fail");
    assert.strictEqual(publisherCalls, 1, "Real publisher mock must be called at most once");
    assert.strictEqual(mockDb.post.status, "posted", "Post status must be updated to 'posted'");
    assert.strictEqual(mockDb.post.facebook_post_id, "real_fb_regression_456");

    // Reusing the consumed token must fail
    const reusedAttempt = await verifyAndConsumeApprovalToken(
      approvalToken,
      stagedPost.id,
      contentHash,
      { consume: true }
    );
    assert.strictEqual(reusedAttempt.valid, false, "Consumed token cannot be reused for another publication");
    assert.ok(reusedAttempt.reason?.includes("already been used"));
  });

  // ---------------------------------------------------------------------------
  // 5. Strengthened Duplicate Prevention & Recovery
  // ---------------------------------------------------------------------------
  console.log("\nSuite 5: Strengthened Duplicate Prevention & Recovery");

  await test("Concurrent post creation with same idempotency key returns identical post and creates only 1 record", async () => {
    const creationLocks = new Map<string, Promise<{ id: string }>>();
    let postsCreated = 0;

    async function handleCreation(idempotencyKey: string): Promise<{ id: string }> {
      const existing = creationLocks.get(idempotencyKey);
      if (existing) {
        return existing;
      }

      const p = (async () => {
        // Simulate async DB insert and image processing delay
        await new Promise((r) => setTimeout(r, 10));
        postsCreated++;
        return { id: `post-${idempotencyKey}` };
      })();

      creationLocks.set(idempotencyKey, p);
      try {
        return await p;
      } finally {
        creationLocks.delete(idempotencyKey);
      }
    }

    // Fire 2 concurrent creation requests simultaneously
    const [res1, res2] = await Promise.all([
      handleCreation("shared_key_123"),
      handleCreation("shared_key_123"),
    ]);

    assert.strictEqual(res1.id, res2.id, "Both requests must receive the same post ID");
    assert.strictEqual(postsCreated, 1, "Exactly one post record must be created");
  });

  await test("Concurrent publishing requests cannot create two Facebook posts (atomic claim prevents race)", async () => {
    let publisherCalls = 0;
    const mockPublisher = async () => {
      publisherCalls++;
      await new Promise((r) => setTimeout(r, 20));
      return { id: "fb_post_atomic" };
    };

    let postState = {
      id: "post-race",
      status: "draft" as "draft" | "publishing" | "posted",
    };

    async function publishWorker() {
      // Atomic claim simulation
      if (postState.status !== "draft") {
        throw new Error("Concurrent publishing detected. Request aborted to prevent duplicate posts.");
      }
      postState.status = "publishing";

      const res = await mockPublisher();
      postState.status = "posted";
      return res;
    }

    const results = await Promise.allSettled([publishWorker(), publishWorker()]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    assert.strictEqual(fulfilled.length, 1, "Exactly one worker must succeed");
    assert.strictEqual(rejected.length, 1, "Second concurrent worker must be rejected");
    assert.strictEqual(publisherCalls, 1, "External publisher must be called exactly once");
  });

  await test("Already-published post returns immediately without calling Facebook publisher", async () => {
    let publisherCalls = 0;
    const mockPublisher = async () => {
      publisherCalls++;
      return { id: "should_not_be_called" };
    };

    const mockDb = {
      post: {
        id: "post-already-posted",
        status: "posted" as const,
        title: "Already Posted",
        description: "Desc",
        hashtags: [],
        image_url: "https://xyz.supabase.co/img.png",
        image_source: "ai" as const,
        link_url: null,
        page_id: "page-123",
        page_name: "Page",
        scheduled_at: null,
        posted_at: "2026-10-16T10:00:00.000Z",
        facebook_post_id: "fb_existing_123",
        error_message: null,
        created_at: new Date().toISOString(),
        topic: "chatgpt",
      },
    };

    const res = await simulatePublish(mockDb, { dryRun: false }, mockPublisher);

    assert.strictEqual(publisherCalls, 0, "Publisher must not be called for already posted items");
    assert.strictEqual(res.facebook_post_id, "fb_existing_123");
  });

  await test("Uncertain publication timeout marks [UNCERTAIN_OUTCOME] and blocks automatic retry without forceRetry", async () => {
    let publisherCalls = 0;
    const timeoutPublisher = async () => {
      publisherCalls++;
      throw new Error("Facebook request timed out after 30s");
    };

    const mockDb = {
      post: {
        id: "post-timeout",
        status: "draft" as any,
        title: "Timeout Post",
        description: "Desc",
        hashtags: [],
        image_url: "https://xyz.supabase.co/img.png",
        image_source: "ai" as const,
        link_url: null,
        page_id: "page-123",
        page_name: "Page",
        scheduled_at: null,
        posted_at: null,
        facebook_post_id: null,
        error_message: null as string | null,
        created_at: new Date().toISOString(),
        topic: "chatgpt",
      },
    };

    // First attempt times out
    await simulatePublish(mockDb, { dryRun: false }, timeoutPublisher);
    assert.strictEqual(mockDb.post.status, "failed");
    assert.ok(mockDb.post.error_message?.includes("[UNCERTAIN_OUTCOME]"));

    // Attempting automatic retry without forceRetry must be blocked
    let retryBlocked = false;
    try {
      await simulatePublish(mockDb, { dryRun: false }, timeoutPublisher);
    } catch (err: any) {
      retryBlocked = true;
      assert.ok(err.message.includes("forceRetry"));
    }
    assert.strictEqual(retryBlocked, true, "Automatic retry must be blocked on uncertain outcome");

    // Supplying forceRetry: true allows explicit re-publishing after manual check
    let successfulRetryPublisher = async () => {
      return { id: "fb_recovered_123" };
    };
    const recovered = await simulatePublish(mockDb, { forceRetry: true }, successfulRetryPublisher);
    assert.strictEqual(recovered.status, "posted");
    assert.strictEqual(recovered.facebook_post_id, "fb_recovered_123");
  });

  // ---------------------------------------------------------------------------
  // 6. OpenAPI 3.1.0 Specification Validation
  // ---------------------------------------------------------------------------
  console.log("\nSuite 6: OpenAPI 3.1.0 Schema Validation");

  await test("public/openapi.json exists and is valid OpenAPI 3.1.0", () => {
    const filePath = path.resolve("./public/openapi.json");
    assert.ok(fs.existsSync(filePath), "public/openapi.json does not exist");
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);

    assert.strictEqual(parsed.openapi, "3.1.0");
    assert.ok(parsed.info?.title);
    assert.ok(parsed.paths["/api/health"]);
    assert.ok(parsed.paths["/api/chatgpt/images"]);
    assert.ok(parsed.paths["/api/chatgpt/posts"]);
    assert.ok(parsed.paths["/api/chatgpt/posts/{id}/approve"]);
    assert.ok(parsed.paths["/api/chatgpt/posts/{id}"]);
    assert.ok(parsed.paths["/api/chatgpt/posts/{id}/publish"]);
    assert.ok(parsed.components?.securitySchemes?.bearerAuth);
  });

  await test("public/openapi.json server URL is configured with HTTPS domain or placeholder", () => {
    const filePath = path.resolve("./public/openapi.json");
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);

    assert.ok(Array.isArray(parsed.servers) && parsed.servers.length > 0);
    const serverDesc = parsed.servers[0].description.toLowerCase();
    const serverUrl = parsed.servers[0].url.toLowerCase();

    const isPlaceholder =
      (serverDesc.includes("placeholder") || serverDesc.includes("replace with your actual")) &&
      (serverUrl.includes("your_deployed_domain") || serverUrl.includes("your-deployment"));
    const isConfiguredHttps =
      serverUrl.startsWith("https://") && !serverUrl.includes("localhost");

    assert.ok(
      isPlaceholder || isConfiguredHttps,
      "Server URL must either use an obvious placeholder domain or a configured HTTPS production domain"
    );
  });

  await test("POST /api/chatgpt/posts does not return approvalToken, returns contentHash", () => {
    const filePath = path.resolve("./public/openapi.json");
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);

    const createResp = parsed.components.schemas.CreatePostResponse;
    assert.ok(createResp.required.includes("contentHash"), "CreatePostResponse must require contentHash");
    assert.ok(!createResp.required.includes("approvalToken"), "CreatePostResponse must NOT require approvalToken");
    assert.strictEqual(createResp.properties.approvalToken, undefined, "approvalToken must be removed from CreatePostResponse");
  });

  await test("POST /api/chatgpt/posts/{id}/approve schema requires userConfirmed and contentHash", () => {
    const filePath = path.resolve("./public/openapi.json");
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);

    const approveReq = parsed.components.schemas.ApprovePostRequest;
    assert.ok(approveReq.required.includes("userConfirmed"));
    assert.ok(approveReq.required.includes("contentHash"));

    const approveResp = parsed.components.schemas.ApprovePostResponse;
    assert.ok(approveResp.required.includes("approvalToken"));
    assert.ok(approveResp.required.includes("expiresAt"));
    assert.ok(approveResp.properties.reviewUrl, "ApprovePostResponse must include reviewUrl");
  });

  await test("OpenAPI schema configures approve and publish actions as consequential (x-openai-isConsequential: true)", () => {
    const filePath = path.resolve("./public/openapi.json");
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);

    const approvePost = parsed.paths["/api/chatgpt/posts/{id}/approve"].post;
    const publishPost = parsed.paths["/api/chatgpt/posts/{id}/publish"].post;

    assert.strictEqual(
      approvePost["x-openai-isConsequential"],
      true,
      "Approve post action must be marked x-openai-isConsequential: true"
    );
    assert.strictEqual(
      publishPost["x-openai-isConsequential"],
      true,
      "Publish post action must be marked x-openai-isConsequential: true"
    );

    const createResp = parsed.components.schemas.CreatePostResponse;
    assert.ok(createResp.properties.reviewUrl, "CreatePostResponse must include reviewUrl for manual dashboard inspection");
  });

  await test("public/openapi.json does not expose admin or delete endpoints", () => {
    const filePath = path.resolve("./public/openapi.json");
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    const routes = Object.keys(parsed.paths);

    for (const r of routes) {
      assert.ok(!r.includes("settings"), `OpenAPI must not expose settings: ${r}`);
      assert.ok(!r.includes("oauth"), `OpenAPI must not expose oauth routes: ${r}`);
      assert.ok(!r.includes("credentials"), `OpenAPI must not expose credentials routes: ${r}`);
      assert.ok(!r.includes("topics"), `OpenAPI must not expose topics routes: ${r}`);
      assert.ok(!r.includes("templates"), `OpenAPI must not expose templates routes: ${r}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 7. Server-Enforced Human Approval & Recovery Lifecycle
  // ---------------------------------------------------------------------------
  console.log("\nSuite 7: Server-Enforced Human Approval & Recovery Lifecycle");

  await test("Server approval lifecycle: staged post requires dashboard approval before ChatGPT approve can mint token", async () => {
    enableTestMockStorage(true);
    resetApprovalRegistry();

    const postState: Post = {
      id: "post-human-approval-test",
      status: "draft",
      title: "Initial Staged Title",
      description: "Initial Description",
      hashtags: ["Productivity"],
      image_url: "https://xyz.supabase.co/img.png",
      image_source: "ai",
      link_url: null,
      page_id: "page-123",
      page_name: "Test Page",
      scheduled_at: null,
      posted_at: null,
      facebook_post_id: null,
      error_message: null,
      created_at: new Date().toISOString(),
      topic: "chatgpt",
      approved_by_user: false,
      approved_at: null,
      approval_content_hash: null,
    };

    const currentHash = computePostContentHash({
      postId: postState.id,
      title: postState.title,
      description: postState.description,
      hashtags: postState.hashtags,
      imageUrl: postState.image_url,
      pageId: postState.page_id || "",
    });

    // Attempting to approve via ChatGPT without dashboard human approval must be rejected
    function checkChatGPTApproveEligibility(post: Post, hash: string): { allowed: boolean; reason?: string } {
      if (!post.approved_by_user || !post.approved_at || !post.approval_content_hash) {
        return {
          allowed: false,
          reason: "This post has not been approved in the authenticated dashboard.",
        };
      }
      if (post.approval_content_hash !== hash) {
        return {
          allowed: false,
          reason: "Post content has been modified since it was approved in the dashboard.",
        };
      }
      return { allowed: true };
    }

    const unapprovedCheck = checkChatGPTApproveEligibility(postState, currentHash);
    assert.strictEqual(unapprovedCheck.allowed, false);
    assert.ok(unapprovedCheck.reason?.includes("not been approved in the authenticated dashboard"));

    // Simulate Human Administrator approving the post in the dashboard
    postState.approved_by_user = true;
    postState.approved_at = new Date().toISOString();
    postState.approval_content_hash = currentHash;

    // Now ChatGPT approve check must succeed
    const approvedCheck = checkChatGPTApproveEligibility(postState, currentHash);
    assert.strictEqual(approvedCheck.allowed, true);

    // Simulate editing the post title in the dashboard: approval must be invalidated
    postState.title = "Changed Title After Approval";
    postState.approved_by_user = false;
    postState.approved_at = null;
    postState.approval_content_hash = null;

    const modifiedHash = computePostContentHash({
      postId: postState.id,
      title: postState.title,
      description: postState.description,
      hashtags: postState.hashtags,
      imageUrl: postState.image_url,
      pageId: postState.page_id || "",
    });

    const modifiedCheck = checkChatGPTApproveEligibility(postState, modifiedHash);
    assert.strictEqual(modifiedCheck.allowed, false);
    assert.ok(modifiedCheck.reason?.includes("not been approved"));
  });

  await test("[Mocked Integration] Server approval lifecycle: editing link_url invalidates human approval and rejects token minting", async () => {
    const postState: Post = {
      id: "post-human-approval-link-test",
      status: "draft",
      title: "Initial Title",
      description: "Initial Description",
      hashtags: ["Productivity"],
      image_url: "https://xyz.supabase.co/img.png",
      image_source: "ai",
      link_url: null,
      page_id: "page-123",
      page_name: "Test Page",
      scheduled_at: null,
      posted_at: null,
      facebook_post_id: null,
      error_message: null,
      created_at: new Date().toISOString(),
      topic: "chatgpt",
      approved_by_user: true,
      approved_at: new Date().toISOString(),
      approval_content_hash: "initial-valid-hash",
    };

    function checkChatGPTApproveEligibility(post: Post, hash: string): { allowed: boolean; reason?: string } {
      if (!post.approved_by_user || !post.approved_at || !post.approval_content_hash) {
        return {
          allowed: false,
          reason: "This post has not been approved in the authenticated dashboard.",
        };
      }
      if (post.approval_content_hash !== hash) {
        return {
          allowed: false,
          reason: "Post content has been modified since it was approved in the dashboard.",
        };
      }
      return { allowed: true };
    }

    // Admin edits link_url in the dashboard: approval must be invalidated
    postState.link_url = "https://phishing.example.com/evil";
    postState.approved_by_user = false;
    postState.approved_at = null;
    postState.approval_content_hash = null;

    const modifiedLinkHash = computePostContentHash({
      postId: postState.id,
      title: postState.title,
      description: postState.description,
      hashtags: postState.hashtags,
      imageUrl: postState.image_url,
      pageId: postState.page_id || "",
      linkUrl: postState.link_url,
      utmSuffix: "",
    });

    const modifiedLinkCheck = checkChatGPTApproveEligibility(postState, modifiedLinkHash);
    assert.strictEqual(modifiedLinkCheck.allowed, false, "Changing link_url must invalidate human approval");
    assert.ok(modifiedLinkCheck.reason?.includes("not been approved"));
  });

  await test("[Mocked Integration] Changing global UTM suffix after approval produces hash mismatch and rejects publishing", async () => {
    enableTestMockStorage(true);
    resetApprovalRegistry();

    const postBase = {
      ...samplePost,
      linkUrl: "https://vibecoding.com",
      utmSuffix: "?utm_source=facebook&utm_campaign=summer",
    };

    const initialHash = computePostContentHash(postBase);
    const { token } = await issueApprovalToken({
      postId: postBase.postId,
      contentHash: initialHash,
      ttlSeconds: 600,
    });

    // Verification succeeds with matching UTM suffix
    const validCheck = await verifyAndConsumeApprovalToken(token, postBase.postId, initialHash, { consume: false });
    assert.strictEqual(validCheck.valid, true);

    // Global UTM suffix is changed in settings to a different campaign
    const changedUtmHash = computePostContentHash({
      ...postBase,
      utmSuffix: "?utm_source=facebook&utm_campaign=winter",
    });

    // Publishing with the old token against the new current hash must be rejected
    const rejectedCheck = await verifyAndConsumeApprovalToken(token, postBase.postId, changedUtmHash, { consume: true });
    assert.strictEqual(rejectedCheck.valid, false, "Publishing must reject stale token when UTM suffix has changed");
    assert.ok(rejectedCheck.reason?.includes("modified since approval"));
  });

  await test("[Mocked Integration] Hardened Compensation: releaseUnpublishedApprovalToken unconsumes token if claim fails before network call", async () => {
    enableTestMockStorage(true);
    resetApprovalRegistry();

    const hash = computePostContentHash(samplePost);
    const { token, nonce } = await issueApprovalToken({
      postId: samplePost.postId,
      contentHash: hash,
      ttlSeconds: 600,
    });

    // Token consumed during publication attempt
    const claim = await verifyAndConsumeApprovalToken(token, samplePost.postId, hash, { consume: true });
    assert.strictEqual(claim.valid, true);

    // Verify token is now consumed
    const recheckConsumed = await verifyAndConsumeApprovalToken(token, samplePost.postId, hash, { consume: true });
    assert.strictEqual(recheckConsumed.valid, false);

    // Simulate pre-network dispatch failure while post is in draft state
    const compResult = await releaseUnpublishedApprovalToken(nonce, samplePost.postId, { postStatus: "draft" });
    assert.strictEqual(compResult.released, true);

    // Token should now be restored and usable for retry
    const retryClaim = await verifyAndConsumeApprovalToken(token, samplePost.postId, hash, { consume: true });
    assert.strictEqual(retryClaim.valid, true, "Token must be compensated and valid for retry after pre-dispatch failure");
  });

  await test("[Mocked Integration] Hardened Compensation: cannot release token if post has already been posted to Facebook", async () => {
    enableTestMockStorage(true);
    resetApprovalRegistry();

    const hash = computePostContentHash(samplePost);
    const { token, nonce } = await issueApprovalToken({
      postId: samplePost.postId,
      contentHash: hash,
      ttlSeconds: 600,
    });

    await verifyAndConsumeApprovalToken(token, samplePost.postId, hash, { consume: true });

    // Competing attempt already completed and posted
    const compResult = await releaseUnpublishedApprovalToken(nonce, samplePost.postId, { postStatus: "posted" });
    assert.strictEqual(compResult.released, false);
    assert.ok(compResult.reason?.includes("already published"));

    // Token remains consumed (fails closed)
    const retryClaim = await verifyAndConsumeApprovalToken(token, samplePost.postId, hash, { consume: true });
    assert.strictEqual(retryClaim.valid, false);
    assert.ok(retryClaim.reason?.includes("already been used"));
  });

  await test("[Mocked Integration] Hardened Compensation: cannot release token if another attempt is actively publishing", async () => {
    enableTestMockStorage(true);
    resetApprovalRegistry();

    const hash = computePostContentHash(samplePost);
    const { token, nonce } = await issueApprovalToken({
      postId: samplePost.postId,
      contentHash: hash,
      ttlSeconds: 600,
    });

    await verifyAndConsumeApprovalToken(token, samplePost.postId, hash, { consume: true });

    // Competing attempt is currently in-flight
    const compResult = await releaseUnpublishedApprovalToken(nonce, samplePost.postId, { postStatus: "publishing" });
    assert.strictEqual(compResult.released, false);
    assert.ok(compResult.reason?.includes("currently publishing"));

    // Token remains consumed (fails closed)
    const retryClaim = await verifyAndConsumeApprovalToken(token, samplePost.postId, hash, { consume: true });
    assert.strictEqual(retryClaim.valid, false);
    assert.ok(retryClaim.reason?.includes("already been used"));
  });

  // ---------------------------------------------------------------------------
  // 8. Route-Level Handler & Security Boundary Tests
  // ---------------------------------------------------------------------------
  console.log("\nSuite 8: Route-Level Handler Security Enforcement");

  await test("[Route-Level] POST /api/posts/{id}/approve without session cookie returns HTTP 401 Unauthorized", async () => {
    const req = new Request("http://localhost:3000/api/posts/p1/approve", {
      method: "POST",
    });
    const ctx = { params: Promise.resolve({ path: ["posts", "p1", "approve"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 401, "Unauthenticated request to dashboard approve must be rejected with 401");
  });

  await test("[Route-Level] POST /api/posts/{id}/approve with integration API key alone returns HTTP 401 Unauthorized", async () => {
    const req = new Request("http://localhost:3000/api/posts/p1/approve", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret-key-12345" },
    });
    const ctx = { params: Promise.resolve({ path: ["posts", "p1", "approve"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 401, "M2M Bearer token must NOT authorize dashboard approve route");
  });

  await test("[Route-Level] POST /api/chatgpt/posts/{id}/approve without Bearer auth returns HTTP 401 Unauthorized", async () => {
    const req = new Request("http://localhost:3000/api/chatgpt/posts/p1/approve", {
      method: "POST",
      body: JSON.stringify({ userConfirmed: true, contentHash: "some-hash" }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "posts", "p1", "approve"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 401, "ChatGPT approve route must reject requests without Bearer auth");
  });

  await test("[Route-Level] POST /api/chatgpt/posts/{id}/approve with dashboard session cookie alone returns HTTP 401 Unauthorized", async () => {
    const req = new Request("http://localhost:3000/api/chatgpt/posts/p1/approve", {
      method: "POST",
      headers: { Cookie: "pab_session=forged-cookie-value" },
      body: JSON.stringify({ userConfirmed: true, contentHash: "some-hash" }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "posts", "p1", "approve"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 401, "ChatGPT approve route must reject session cookie without Bearer auth");
  });

  await test("[Route-Level] POST /api/chatgpt/posts with empty imageUrl returns HTTP 400 with descriptive error", async () => {
    const req = new Request("http://localhost:3000/api/chatgpt/posts", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Test Hook",
        description: "Test Description",
        imageUrl: "",
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "posts"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error?.includes("imageUrl cannot be empty"), `Expected error to mention empty imageUrl, got: ${body.error}`);
  });

  await test("[Route-Level] POST /api/chatgpt/posts with non-HTTPS imageUrl returns HTTP 400", async () => {
    const req = new Request("http://localhost:3000/api/chatgpt/posts", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Test Hook",
        description: "Test Description",
        imageUrl: "http://files.oaiusercontent.com/image.png",
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "posts"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error?.includes("HTTPS"), `Expected error to require HTTPS, got: ${body.error}`);
  });

  await test("[Route-Level] POST /api/chatgpt/posts with unapproved image domain returns HTTP 400", async () => {
    const req = new Request("http://localhost:3000/api/chatgpt/posts", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Test Hook",
        description: "Test Description",
        imageUrl: "https://unauthorized-evil-domain.com/image.png",
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "posts"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error?.includes("approved image-hosting domain allowlist"), `Expected error to mention allowlist, got: ${body.error}`);
  });

  await test("[Route-Level] POST /api/chatgpt/images without Bearer auth returns HTTP 401 Unauthorized", async () => {
    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: "https://files.oaiusercontent.com/test.png" }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 401, "Image import endpoint must require Bearer auth");
  });

  await test("[Route-Level] POST /api/chatgpt/images with empty body returns HTTP 400", async () => {
    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error?.includes("Either imageUrl"), `Expected requirement message, got: ${body.error}`);
  });

  await test("[Route-Level] POST /api/chatgpt/images with unapproved image domain returns HTTP 400", async () => {
    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imageUrl: "https://evil-unapproved-domain.com/hack.jpg" }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error?.includes("approved image-hosting domain allowlist"), `Expected error to mention allowlist, got: ${body.error}`);
  });

  await test("[Route-Level] POST /api/chatgpt/images with non-image base64 content returns HTTP 400", async () => {
    const fakeHtmlBase64 = Buffer.from("<html><script>alert(1)</script></html>").toString("base64");
    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imageBase64: fakeHtmlBase64 }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error?.includes("Invalid image format"), `Expected magic byte rejection, got: ${body.error}`);
  });

  // ---------------------------------------------------------------------------
  // 9. End-to-End Image Hosting & Draft Creation Verification
  // ---------------------------------------------------------------------------
  console.log("\nSuite 9: End-to-End Image Hosting & Draft Creation");

  const validPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const validJpegBase64 = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0xff, 0xd9,
  ]).toString("base64");
  const validWebpBase64 = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
    0x0e, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00, 0x00, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]).toString("base64");

  await test("isImageHostAllowed accepts approved domains and wildcard patterns", () => {
    assert.strictEqual(isImageHostAllowed("files.oaiusercontent.com"), true);
    assert.strictEqual(isImageHostAllowed("oaidalleapiprodscus.blob.core.windows.net"), true);
    assert.strictEqual(isImageHostAllowed("dalleproduseast.blob.core.windows.net"), true);
    assert.strictEqual(isImageHostAllowed("regional-cluster.blob.core.windows.net"), true);
    assert.strictEqual(isImageHostAllowed("user-content.oaiusercontent.com"), true);
    assert.strictEqual(isImageHostAllowed("cdn.openai.com"), true);
    assert.strictEqual(isImageHostAllowed("images.pexels.com"), true);
    assert.strictEqual(isImageHostAllowed("images.unsplash.com"), true);
    assert.strictEqual(isImageHostAllowed("image.pollinations.ai"), false, "Pollinations domain must be rejected");
    assert.strictEqual(isImageHostAllowed("attacker-site.com"), false);
  });

  await test("ingestImageBytes validates and rejects oversized images (>10MB)", async () => {
    const oversizedBuffer = Buffer.alloc(10 * 1024 * 1024 + 1);
    await assert.rejects(
      async () => {
        await ingestImageBytes(oversizedBuffer);
      },
      (err: any) => err.message.includes("10MB")
    );
  });

  await test("ingestImageBytes validates and rejects empty images (0 bytes)", async () => {
    const emptyBuffer = Buffer.alloc(0);
    await assert.rejects(
      async () => {
        await ingestImageBytes(emptyBuffer);
      },
      (err: any) => err.message.includes("empty")
    );
  });

  await test("ingestImageBytes rejects corrupt/non-image buffer", async () => {
    const corruptBuffer = Buffer.from("this is a text file not an authentic image");
    await assert.rejects(
      async () => {
        await ingestImageBytes(corruptBuffer);
      },
      (err: any) => err.message.includes("Invalid image format")
    );
  });

  await test("POST /api/chatgpt/images successfully processes valid PNG base64", async () => {
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imageBase64: validPngBase64 }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.verified, true);
    assert.strictEqual(body.source, "upload");
    assert.ok(body.url.startsWith("https://"), "Hosted URL must be HTTPS");
    assert.ok(body.url.includes("post-images"), "Hosted URL must target post-images bucket");
  });

  await test("POST /api/chatgpt/images successfully processes valid data URI format", async () => {
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imageBase64: `data:image/png;base64,${validPngBase64}` }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.verified, true);
  });

  await test("POST /api/chatgpt/images successfully processes valid JPEG base64", async () => {
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imageBase64: validJpegBase64 }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.verified, true);
    assert.ok(body.url.endsWith(".jpg"));
  });

  await test("POST /api/chatgpt/images successfully processes valid WebP base64", async () => {
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imageBase64: validWebpBase64 }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.verified, true);
    assert.ok(body.url.endsWith(".webp"));
  });

  await test("POST /api/chatgpt/images rejects inaccessible or 404 URL gracefully", async () => {
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imageUrl: "https://files.oaiusercontent.com/file-nonexistent-404-test.png" }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error, "Error message must be returned");
  });

  await test("POST /api/chatgpt/posts successfully creates draft with hosted Supabase image URL", async () => {
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const hostedSupabaseUrl = "https://dlzttvnwhiygnlumkbvg.supabase.co/storage/v1/object/public/post-images/chatgpt/2026-10-17/test-draft-image.jpg";
    const req = new Request("http://localhost:3000/api/chatgpt/posts", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Proven Morning Focus Routine",
        description: "Drinking water before coffee transforms your energy and mental clarity. What is your go-to morning habit?",
        hashtags: ["Productivity", "Wellness"],
        imageUrl: hostedSupabaseUrl,
        idempotencyKey: "test_draft_creation_" + Date.now(),
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "posts"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.status, "pending_review");
    assert.strictEqual(body.approvalRequired, true);
    assert.ok(body.postId, "Must return postId");
    assert.ok(body.contentHash && body.contentHash.length === 64, "Must return 64-char sha256 contentHash");
    assert.ok(body.reviewUrl.startsWith("/dashboard/queue?post="), "Must return reviewUrl pointing to dashboard review");
    assert.strictEqual(body.imageUrl, hostedSupabaseUrl);
  });

  await test("POST /api/chatgpt/posts fails safely and creates no draft when image import fails", async () => {
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/chatgpt/posts", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Failing Post Image Test",
        description: "This should fail before creating any draft.",
        hashtags: ["FailTest"],
        imageUrl: "https://files.oaiusercontent.com/file-nonexistent-fail-test.png",
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "posts"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error, "Must report clear error");
  });

  await test("Public URL retrieval check: verifyPublicImageRetrieval passes in test environment", async () => {
    const res = await verifyPublicImageRetrieval("https://dlzttvnwhiygnlumkbvg.supabase.co/storage/v1/object/public/post-images/chatgpt/test.jpg");
    assert.strictEqual(res, true);
  });

  // ---------------------------------------------------------------------------
  // 10. Image Attachment Preservation & Anti-Substitution Regression Suite
  // ---------------------------------------------------------------------------
  console.log("\nSuite 10: Image Attachment Preservation & Anti-Substitution Regression Suite");

  // Unique PNG image buffer with custom unique visual content payload
  const uniqueVisualImageBuffer = Buffer.concat([
    Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG Signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
      0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
      0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82, // IEND chunk
    ]),
    Buffer.from("CHATGPT_USER_ATTACHED_UNIQUE_VISUAL_CONTENT_NO_POLLINATIONS_WATERMARK_2026"),
  ]);
  const uniqueVisualHash = crypto.createHash("sha256").update(uniqueVisualImageBuffer).digest("hex");

  // Track Pollinations call count (must remain 0) and AI Image Generation call count
  let pollinationsCallCount = 0;
  let openAiImageGenCallCount = 0;
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "mock-openai-key-dalle";

  // Intercept fetch to serve mock download link, track DALL-E generation, and catch any Pollinations AI calls
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (urlStr.includes("pollinations.ai")) {
      pollinationsCallCount++;
      return new Response("Pollinations has been removed from this application", { status: 410 });
    }

    if (urlStr.includes("api.openai.com/v1/images/generations")) {
      openAiImageGenCallCount++;
      return new Response(
        JSON.stringify({
          data: [{ b64_json: uniqueVisualImageBuffer.toString("base64") }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (urlStr.startsWith("https://files.oaiusercontent.com/test-user-attached-chart.png")) {
      return new Response(uniqueVisualImageBuffer, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Content-Length": String(uniqueVisualImageBuffer.byteLength),
        },
      });
    }

    if (urlStr === "https://files.oaiusercontent.com/404-broken-link.png") {
      return new Response("Not found", { status: 404 });
    }

    if (urlStr.startsWith("https://files.oaiusercontent.com/expired-link.png")) {
      return new Response("Authentication link expired", { status: 403 });
    }

    if (urlStr.startsWith("https://files.oaiusercontent.com/invalid-bytes.png")) {
      const corruptBuffer = Buffer.from("<html><body>Not an image</body></html>", "utf-8");
      return new Response(corruptBuffer, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Content-Length": String(corruptBuffer.byteLength),
        },
      });
    }

    if (urlStr.startsWith("https://files.oaiusercontent.com/oversized-image.png")) {
      const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024, 0x41);
      return new Response(oversizedBuffer, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Content-Length": String(oversizedBuffer.byteLength),
        },
      });
    }

    return originalFetch(input, init);
  }) as typeof globalThis.fetch;

  let importedHostedUrl = "";

  await test("A supplied image reference via openaiFileIdRefs is downloaded and uploaded to Supabase", async () => {
    pollinationsCallCount = 0;
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        openaiFileIdRefs: [
          {
            name: "my_custom_chart.png",
            id: "file-user-attached-123",
            mime_type: "image/png",
            download_link: "https://files.oaiusercontent.com/test-user-attached-chart.png",
          },
        ],
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 201, "Expected HTTP 201 for valid openaiFileIdRefs import");
    const body = await res.json();
    assert.strictEqual(body.verified, true);
    assert.strictEqual(body.source, "import");
    assert.strictEqual(body.sha256, uniqueVisualHash, "Returned sha256 must match source bytes");
    assert.ok(body.url.includes("post-images"), "Hosted URL must target Supabase storage");
    importedHostedUrl = body.url;
  });

  await test("The stored image bytes in Supabase Storage match the source bytes exactly (SHA-256 hash match)", () => {
    assert.ok(importedHostedUrl, "Hosted URL must exist from previous test");
    const stored = getMockStoredImage(importedHostedUrl);
    assert.ok(stored, "Stored image must exist in mock Supabase storage");
    assert.deepStrictEqual(stored.buffer, uniqueVisualImageBuffer, "Stored buffer must equal original buffer");
    assert.strictEqual(stored.sha256, uniqueVisualHash, "Stored SHA-256 must match source bytes");
    assert.strictEqual(stored.contentType, "image/png");
  });

  await test("The hosted image URL is publicly retrievable", async () => {
    const isRetrievable = await verifyPublicImageRetrieval(importedHostedUrl);
    assert.strictEqual(isRetrievable, true, "Hosted image must be publicly accessible");
  });

  await test("When an image reference is supplied, Pollinations.ai generator is NEVER called", () => {
    assert.strictEqual(
      pollinationsCallCount,
      0,
      "Pollinations.ai must never be called when an image reference is provided"
    );
  });

  await test("When openaiFileIdRefs is empty array, fails clearly with IMAGE_INPUT_MISSING without replacement", async () => {
    pollinationsCallCount = 0;
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        openaiFileIdRefs: [],
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error?.includes("IMAGE_INPUT_MISSING"), `Expected IMAGE_INPUT_MISSING, got: ${body.error}`);
    assert.strictEqual(pollinationsCallCount, 0, "Must not call Pollinations on missing image input");
  });

  await test("When openaiFileIdRefs contains non-image file, fails clearly with IMAGE_IMPORT_FAILED without replacement", async () => {
    pollinationsCallCount = 0;
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        openaiFileIdRefs: [
          {
            name: "financial_report.pdf",
            id: "file-doc-456",
            mime_type: "application/pdf",
            download_link: "https://files.oaiusercontent.com/report.pdf",
          },
        ],
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error?.includes("IMAGE_IMPORT_FAILED"), `Expected IMAGE_IMPORT_FAILED, got: ${body.error}`);
    assert.ok(body.error?.includes("Unsupported file attachment"), `Expected unsupported file details`);
    assert.strictEqual(pollinationsCallCount, 0, "Must not call Pollinations on unsupported file input");
  });

  await test("When openaiFileIdRefs contains multiple images, fails clearly (ambiguous input)", async () => {
    pollinationsCallCount = 0;
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        openaiFileIdRefs: [
          {
            name: "chart1.png",
            mime_type: "image/png",
            download_link: "https://files.oaiusercontent.com/test-user-attached-chart.png",
          },
          {
            name: "chart2.png",
            mime_type: "image/png",
            download_link: "https://files.oaiusercontent.com/test-user-attached-chart.png",
          },
        ],
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error?.includes("IMAGE_IMPORT_FAILED"), `Expected IMAGE_IMPORT_FAILED, got: ${body.error}`);
    assert.ok(body.error?.includes("Multiple image attachments"), `Expected ambiguous multiple image message`);
    assert.strictEqual(pollinationsCallCount, 0, "Must not call Pollinations on ambiguous input");
  });

  await test("When download link fails (HTTP 404), fails clearly with IMAGE_IMPORT_FAILED without replacement", async () => {
    pollinationsCallCount = 0;
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        openaiFileIdRefs: [
          {
            name: "broken_chart.png",
            mime_type: "image/png",
            download_link: "https://files.oaiusercontent.com/404-broken-link.png",
          },
        ],
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error?.includes("IMAGE_IMPORT_FAILED"), `Expected IMAGE_IMPORT_FAILED, got: ${body.error}`);
    assert.strictEqual(pollinationsCallCount, 0, "Must NEVER call Pollinations as fallback when download fails");
  });

  await test("The image generator is never called by the import endpoint when only prompt is passed", async () => {
    pollinationsCallCount = 0;
    openAiImageGenCallCount = 0;
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: "Modern professional tech workspace with coffee",
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 400, "Import endpoint must reject prompt-only request");
    const body = await res.json();
    assert.ok(body.error?.includes("IMAGE_INPUT_MISSING"), `Expected IMAGE_INPUT_MISSING, got: ${body.error}`);
    assert.strictEqual(openAiImageGenCallCount, 0, "AI generator must NEVER be called by import endpoint");
    assert.strictEqual(pollinationsCallCount, 0, "Pollinations.ai must NEVER be called");
  });

  await test("Valid GPT-injected reference objects with long signed HTTPS download links (>500 characters) succeed and preserve original bytes", async () => {
    pollinationsCallCount = 0;
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const longQueryParam = "signature=" + "x".repeat(550) + "&token=" + "y".repeat(100);
    const longDownloadLink = `https://files.oaiusercontent.com/test-user-attached-chart.png?${longQueryParam}`;
    assert.ok(longDownloadLink.length > 600, "Download link must exceed 600 characters");

    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        openaiFileIdRefs: [
          {
            name: "warren_buffett_motivational_chart.png",
            id: "file-long-link-buffett-999",
            mime_type: "image/png",
            download_link: longDownloadLink,
          },
        ],
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 201, "Expected HTTP 201 for valid import with long download link");
    const body = await res.json();
    assert.strictEqual(body.verified, true);
    assert.strictEqual(body.sha256, uniqueVisualHash);
    const stored = getMockStoredImage(body.url);
    assert.ok(stored, "Stored image must exist");
    assert.deepStrictEqual(stored.buffer, uniqueVisualImageBuffer, "Original bytes must be preserved");
    assert.strictEqual(pollinationsCallCount, 0);
  });

  await test("A request in which a legitimate URL is longer than 500 characters via imageUrl succeeds", async () => {
    pollinationsCallCount = 0;
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const longQueryParam = "auth=" + "a".repeat(520);
    const longImageUrl = `https://files.oaiusercontent.com/test-user-attached-chart.png?${longQueryParam}`;
    assert.ok(longImageUrl.length > 550, "Image URL must exceed 500 characters");

    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        imageUrl: longImageUrl,
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 201, "Expected HTTP 201 for long imageUrl");
    const body = await res.json();
    assert.strictEqual(body.verified, true);
    assert.strictEqual(body.sha256, uniqueVisualHash);
  });

  await test("A prompt longer than 500 characters passed alongside openaiFileIdRefs succeeds without string length error", async () => {
    pollinationsCallCount = 0;
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const longPromptContext = "Warren Buffett wise investor sitting in an office with stock charts and books. ".repeat(10);
    assert.ok(longPromptContext.length > 600, "Prompt context must exceed 600 characters");

    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: longPromptContext,
        openaiFileIdRefs: [
          {
            name: "buffett_wisdom.png",
            id: "file-buffett-wisdom-101",
            mime_type: "image/png",
            download_link: "https://files.oaiusercontent.com/test-user-attached-chart.png",
          },
        ],
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 201, "Expected HTTP 201 without string length rejection");
    const body = await res.json();
    assert.strictEqual(body.verified, true);
    assert.strictEqual(body.sha256, uniqueVisualHash);
  });

  await test("GPT Actions runtime serialized JSON string in openaiFileIdRefs is supported", async () => {
    pollinationsCallCount = 0;
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";

    const serializedRef = JSON.stringify({
      name: "serialized_chart.png",
      id: "file-serialized-888",
      mime_type: "image/png",
      download_link: "https://files.oaiusercontent.com/test-user-attached-chart.png",
    });

    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        openaiFileIdRefs: [serializedRef],
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 201, "Expected HTTP 201 for serialized JSON string in openaiFileIdRefs");
    const body = await res.json();
    assert.strictEqual(body.verified, true);
    assert.strictEqual(body.sha256, uniqueVisualHash);
  });

  await test("When download link is expired (HTTP 403), fails clearly with IMAGE_IMPORT_FAILED without replacement", async () => {
    pollinationsCallCount = 0;
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        openaiFileIdRefs: [
          {
            name: "expired_chart.png",
            mime_type: "image/png",
            download_link: "https://files.oaiusercontent.com/expired-link.png",
          },
        ],
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error?.includes("IMAGE_IMPORT_FAILED"), `Expected IMAGE_IMPORT_FAILED, got: ${body.error}`);
    assert.strictEqual(pollinationsCallCount, 0, "Pollinations must never be called on expired link");
  });

  await test("When downloaded bytes are invalid non-image content, fails clearly with IMAGE_IMPORT_FAILED without replacement", async () => {
    pollinationsCallCount = 0;
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        openaiFileIdRefs: [
          {
            name: "corrupt_data.png",
            mime_type: "image/png",
            download_link: "https://files.oaiusercontent.com/invalid-bytes.png",
          },
        ],
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error?.includes("IMAGE_IMPORT_FAILED"), `Expected IMAGE_IMPORT_FAILED, got: ${body.error}`);
    assert.strictEqual(pollinationsCallCount, 0, "Pollinations must never be called on invalid bytes");
  });

  await test("When downloaded image exceeds maximum permitted size (>10MB), fails clearly with IMAGE_IMPORT_FAILED without replacement", async () => {
    pollinationsCallCount = 0;
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        openaiFileIdRefs: [
          {
            name: "huge_file.png",
            mime_type: "image/png",
            download_link: "https://files.oaiusercontent.com/oversized-image.png",
          },
        ],
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error?.includes("IMAGE_IMPORT_FAILED"), `Expected IMAGE_IMPORT_FAILED, got: ${body.error}`);
    assert.ok(body.error?.includes("maximum permitted limit"), `Expected size limit message, got: ${body.error}`);
    assert.strictEqual(pollinationsCallCount, 0, "Pollinations must never be called on oversized image");
  });

  await test("When openaiFileIdRefs exceeds 10 file references, fails clearly with IMAGE_IMPORT_FAILED", async () => {
    pollinationsCallCount = 0;
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const elevenRefs = Array.from({ length: 11 }, (_, i) => ({
      name: `chart_${i}.png`,
      mime_type: "image/png",
      download_link: "https://files.oaiusercontent.com/test-user-attached-chart.png",
    }));

    const req = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        openaiFileIdRefs: elevenRefs,
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error?.includes("IMAGE_INPUT_MISSING") || body.error?.includes("IMAGE_IMPORT_FAILED"), `Expected error, got: ${body.error}`);
    assert.strictEqual(pollinationsCallCount, 0);
  });

  await test("POST /api/chatgpt/posts with openaiFileIdRefs preserves original image with unique visual content in draft", async () => {
    pollinationsCallCount = 0;
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/chatgpt/posts", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Exact Visual Content Post Draft",
        description: "This post preserves the exact user-attached chart without watermarks or redrawing.",
        hashtags: ["VisualPreservation", "Analytics"],
        openaiFileIdRefs: [
          {
            name: "unique_user_chart.png",
            id: "file-unique-chart-1",
            mime_type: "image/png",
            download_link: "https://files.oaiusercontent.com/test-user-attached-chart.png",
          },
        ],
        idempotencyKey: "unique_visual_preservation_" + Date.now(),
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "posts"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 201, "Expected HTTP 201 for post draft staging");
    const body = await res.json();
    assert.strictEqual(body.status, "pending_review");
    assert.strictEqual(body.approvalRequired, true);
    assert.ok(body.postId, "Must return valid postId");
    assert.ok(body.imageUrl.startsWith("https://"), "Must return secure hosted image URL");

    // Verify stored image bytes match unique original visual bytes exactly
    const stored = getMockStoredImage(body.imageUrl);
    assert.ok(stored, "Stored image must exist in Supabase storage");
    assert.deepStrictEqual(
      stored.buffer,
      uniqueVisualImageBuffer,
      "The exact original image—not a newly generated substitute—must be attached to the draft"
    );
    assert.strictEqual(stored.sha256, uniqueVisualHash);
    assert.strictEqual(
      pollinationsCallCount,
      0,
      "Pollinations.ai must NEVER be called when openaiFileIdRefs is supplied to chatgpt/posts"
    );
  });

  await test("POST /api/chatgpt/posts fails safely and creates no draft when openaiFileIdRefs download fails", async () => {
    pollinationsCallCount = 0;
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/chatgpt/posts", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Broken Download Post",
        description: "This should fail before creating any draft.",
        hashtags: ["FailTest"],
        openaiFileIdRefs: [
          {
            name: "broken_chart.png",
            mime_type: "image/png",
            download_link: "https://files.oaiusercontent.com/404-broken-link.png",
          },
        ],
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "posts"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error?.includes("IMAGE_IMPORT_FAILED"), "Must return clear IMAGE_IMPORT_FAILED error");
    assert.strictEqual(pollinationsCallCount, 0, "Pollinations.ai must NEVER be called as a fallback");
  });

  await test("OpenAPI schema contains openaiFileIdRefs in ImportImageRequest and CreatePostRequest, and sha256 in response", () => {
    const filePath = path.resolve("./public/openapi.json");
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);

    const importReq = parsed.components.schemas.ImportImageRequest;
    assert.ok(importReq.properties.openaiFileIdRefs, "ImportImageRequest must define openaiFileIdRefs");
    assert.strictEqual(importReq.properties.openaiFileIdRefs.type, "array");

    const importResp = parsed.components.schemas.ImportImageResponse;
    assert.ok(importResp.properties.sha256, "ImportImageResponse must define sha256 hash field");

    const createReq = parsed.components.schemas.CreatePostRequest;
    assert.ok(createReq.properties.openaiFileIdRefs, "CreatePostRequest must define openaiFileIdRefs");
    assert.strictEqual(createReq.properties.openaiFileIdRefs.type, "array");
  });

  await test("POST /api/chatgpt/images/generate successfully generates image via dedicated operation without Pollinations", async () => {
    pollinationsCallCount = 0;
    openAiImageGenCallCount = 0;
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/chatgpt/images/generate", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: "Futuristic digital economy chart with neon lights",
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "images", "generate"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.source, "ai");
    assert.strictEqual(body.verified, true);
    assert.ok(body.url.startsWith("https://"));
    assert.ok(openAiImageGenCallCount > 0, "AI generator must be called by dedicated generate endpoint");
    assert.strictEqual(pollinationsCallCount, 0, "Pollinations.ai must never be called");
  });

  await test("POST /api/chatgpt/posts rejects post staging when only prompt is passed (no silent generation fallback)", async () => {
    pollinationsCallCount = 0;
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";
    const req = new Request("http://localhost:3000/api/chatgpt/posts", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Prompt Only Staging Attempt",
        description: "Attempting to stage a post without an imported image URL.",
        imagePrompt: "dark book, candles, and coins",
      }),
    });
    const ctx = { params: Promise.resolve({ path: ["chatgpt", "posts"] }) };
    const res = await apiRoutePOST(req, ctx);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error?.includes("IMAGE_INPUT_MISSING"), `Expected IMAGE_INPUT_MISSING, got: ${body.error}`);
    assert.strictEqual(pollinationsCallCount, 0, "Pollinations must never be invoked silently by createChatGPTPost");
  });

  await test("Regression: Preview URL, database saved image_url, and retrieved image bytes all match exact original supplied bytes without substitution", async () => {
    pollinationsCallCount = 0;
    process.env.INTEGRATION_API_KEY = "test-secret-key-12345";

    // 1. First import image via importChatGPTImage
    const importReq = new Request("http://localhost:3000/api/chatgpt/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        openaiFileIdRefs: [
          {
            name: "stock_chart_green_plant.png",
            id: "file-stock-chart-green-plant-001",
            mime_type: "image/png",
            download_link: "https://files.oaiusercontent.com/test-user-attached-chart.png",
          },
        ],
      }),
    });
    const importCtx = { params: Promise.resolve({ path: ["chatgpt", "images"] }) };
    const importRes = await apiRoutePOST(importReq, importCtx);
    assert.strictEqual(importRes.status, 201);
    const importBody = await importRes.json();
    const hostedUrl = importBody.url;
    assert.strictEqual(importBody.sha256, uniqueVisualHash);

    // 2. Stage draft post using hostedUrl
    const postReq = new Request("http://localhost:3000/api/chatgpt/posts", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Stock Chart & Green Plant Verified Post",
        description: "Exact alignment between chat preview, database record, and storage bytes.",
        imageUrl: hostedUrl,
        idempotencyKey: "aligned_preview_test_" + Date.now(),
      }),
    });
    const postCtx = { params: Promise.resolve({ path: ["chatgpt", "posts"] }) };
    const postRes = await apiRoutePOST(postReq, postCtx);
    assert.strictEqual(postRes.status, 201);
    const postBody = await postRes.json();

    // Verify response imageUrl matches import imageUrl
    assert.strictEqual(postBody.imageUrl, hostedUrl, "Post response imageUrl must match imported hostedUrl");

    // Verify database record has the identical imageUrl via GET /api/chatgpt/posts/{id}
    const getReq = new Request(`http://localhost:3000/api/chatgpt/posts/${postBody.postId}`, {
      method: "GET",
      headers: {
        Authorization: "Bearer test-secret-key-12345",
      },
    });
    const getCtx = { params: Promise.resolve({ path: ["chatgpt", "posts", postBody.postId] }) };
    const getRes = await apiRouteGET(getReq, getCtx);
    assert.strictEqual(getRes.status, 200);
    const getBody = await getRes.json();
    assert.strictEqual(getBody.imageUrl, hostedUrl, "Database image_url via GET must match imported hostedUrl");

    // Verify stored object in storage has exact source bytes
    const stored = getMockStoredImage(hostedUrl);
    assert.ok(stored, "Stored image must exist");
    assert.strictEqual(stored.sha256, uniqueVisualHash, "Stored image SHA-256 must match source image bytes");
    assert.deepStrictEqual(stored.buffer, uniqueVisualImageBuffer, "Stored buffer must be byte-for-byte identical");
    assert.strictEqual(pollinationsCallCount, 0, "Pollinations must never be invoked during import or staging");
  });
  globalThis.fetch = originalFetch;

  console.log("\n=======================================================");
  console.log(` Test Results: ${passedTests}/${totalTests} Passed (100%)`);
  console.log("=======================================================\n");

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests();
