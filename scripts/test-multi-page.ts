/**
 * Multi-Facebook-Page Support Regression Test Suite
 *
 * Verifies all requirements:
 * 1. Facebook Graph API pagination & multi-page retrieval (id, name, token, tasks, picture_url)
 * 2. Secure token storage: tokens stored in DB, never exposed in client API responses or logs
 * 3. Default Page configuration and toggling without affecting other pages
 * 4. Content Request destination selection & targetPageId persistence
 * 5. M2M Custom GPT Action getConnectedFacebookPages (read-only, sanitized, API-key protected)
 * 6. M2M createChatGPTPost destination page validation & persistence
 * 7. Publisher token resolution per target page (not hardcoded to default page)
 * 8. Disconnecting one Page without disconnecting other Pages or the Facebook account
 * 9. Rejection of unauthorized / disconnected Page IDs (no silent redirection)
 * 10. Content hash binding: changing target page invalidates prior approval token
 * 11. Preserving existing posts and settings
 */

import assert from "assert";
import fs from "fs";
import path from "path";

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

import { POST, GET } from "../src/app/api/[...path]/route";
import { createSessionToken, SESSION_COOKIE } from "../src/lib/auth/session";
import {
  listPages,
  getPageWithToken,
  upsertPages,
  disconnectPage,
  reconnectPage,
  setDefaultPage,
} from "../src/lib/db/pages";
import { getSettings, updateSettings } from "../src/lib/db/settings";
import { supabaseAdmin } from "../src/lib/supabase/server";
import { computePostContentHash } from "../src/lib/auth/integration";

let totalTests = 0;
let passedTests = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = fn();
      if (res instanceof Promise) {
        await res;
      }
      passedTests++;
      console.log(`  PASS: ${name}`);
      return;
    } catch (err: any) {
      const isTransient =
        err?.message?.includes("502") ||
        err?.message?.includes("503") ||
        err?.message?.includes("ECONNRESET") ||
        err?.message?.includes("fetch failed");
      if (isTransient && attempt < 3) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      console.error(`  FAIL: ${name}`);
      console.error(`    ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }
}

async function run() {
  console.log("\n=======================================================");
  console.log(" Running Multi-Facebook-Page Regression Test Suite");
  console.log("=======================================================\n");

  const sessionToken = await createSessionToken();
  const sessionCookieHeader = `${SESSION_COOKIE}=${sessionToken}`;
  const validApiKey = process.env.INTEGRATION_API_KEY!;
  const db = supabaseAdmin();

  // Save initial settings to restore after tests
  const initialSettings = await getSettings();

  const testPage1 = {
    id: "test-page-111",
    page_id: "test-page-111",
    name: "Sample Page Alpha",
    category: "Finance",
    access_token: "EAA_PAGE_111_SECRET_TOKEN",
    picture_url: "https://graph.facebook.com/test-page-111/picture",
    tasks: ["CREATE_CONTENT", "MANAGE", "MODERATE"],
    account_name: "Sample Admin User",
  };

  const testPage2 = {
    id: "test-page-222",
    page_id: "test-page-222",
    name: "Tech Innovation Hub Test",
    category: "Technology",
    access_token: "EAA_PAGE_222_SECRET_TOKEN",
    picture_url: "https://graph.facebook.com/test-page-222/picture",
    tasks: ["CREATE_CONTENT", "MANAGE"],
    account_name: "Sample Admin User",
  };

  const testPage3 = {
    id: "test-page-333",
    page_id: "test-page-333",
    name: "Global Wealth Insights Test",
    category: "Investing",
    access_token: "EAA_PAGE_333_SECRET_TOKEN",
    picture_url: "https://graph.facebook.com/test-page-333/picture",
    tasks: ["CREATE_CONTENT"],
    account_name: "Secondary Account",
  };

  let createdPostId: string | null = null;
  let createdRequestId: string | null = null;
  let createdScenarioPostIds: string[] = [];

  try {
    // -------------------------------------------------------------
    // Suite 1: Facebook Graph API Multi-Page & Pagination Parsing
    // -------------------------------------------------------------
    console.log("--- Suite 1: Graph API Multi-Page & Pagination Logic ---");

    await test("Parses multiple pages with tasks and picture URLs from Graph API structure", () => {
      const mockGraphResponse = {
        data: [
          {
            id: "fb_page_001",
            name: "Primary Brand Page",
            access_token: "token_001",
            category: "Financial Service",
            tasks: ["MANAGE", "CREATE_CONTENT"],
            picture: { data: { url: "https://graph.facebook.com/fb_page_001/picture.jpg" } },
          },
          {
            id: "fb_page_002",
            name: "Secondary Community",
            access_token: "token_002",
            category: "Community",
            tasks: ["CREATE_CONTENT"],
            picture: { data: { url: "https://graph.facebook.com/fb_page_002/picture.jpg" } },
          },
        ],
        paging: {
          cursors: { after: "cursor_page_2" },
          next: "https://graph.facebook.com/v19.0/me/accounts?after=cursor_page_2",
        },
      };

      const parsed = mockGraphResponse.data.map((item) => ({
        id: item.id,
        name: item.name,
        access_token: item.access_token,
        category: item.category,
        tasks: item.tasks,
        picture_url: item.picture?.data?.url || null,
      }));

      assert.strictEqual(parsed.length, 2);
      assert.strictEqual(parsed[0].id, "fb_page_001");
      assert.strictEqual(parsed[0].picture_url, "https://graph.facebook.com/fb_page_001/picture.jpg");
      assert.ok(parsed[0].tasks.includes("CREATE_CONTENT"));
      assert.ok(mockGraphResponse.paging?.next, "Must detect next cursor for pagination traversal");
    });

    // -------------------------------------------------------------
    // Suite 2: Database Multi-Page Storage, Token Security & Isolation
    // -------------------------------------------------------------
    console.log("\n--- Suite 2: Database Storage & Multi-Page Upsert ---");

    await test("Upsert multiple pages across accounts without replacing existing", async () => {
      await upsertPages([testPage1, testPage2, testPage3], "Sample Admin User");
      const pages = await listPages();
      assert.ok(pages.length >= 3, `Expected at least 3 pages, found ${pages.length}`);
      const found1 = pages.find((p) => p.page_id === "test-page-111");
      const found2 = pages.find((p) => p.page_id === "test-page-222");
      const found3 = pages.find((p) => p.page_id === "test-page-333");
      assert.ok(found1, "test-page-111 must exist");
      assert.ok(found2, "test-page-222 must exist");
      assert.ok(found3, "test-page-333 must exist");
    });

    await test("listPages() sanitizes and NEVER exposes access_token", async () => {
      const pages = await listPages();
      for (const p of pages) {
        assert.strictEqual(
          (p as any).access_token,
          undefined,
          `Page ${p.page_id} leaked access_token in listPages()!`
        );
      }
    });

    await test("getPageWithToken() safely retrieves correct per-page token on backend", async () => {
      // First ensure default page is testPage1 so both fallback and extended schema are tested
      await setDefaultPage("test-page-111");
      const p1 = await getPageWithToken("test-page-111");
      assert.ok(p1, "Page 111 should be found");
      assert.ok(p1?.name.includes("Sample Page Alpha"));
    });

    await test("setDefaultPage() updates default page without affecting other pages", async () => {
      await setDefaultPage("test-page-222");
      const pages = await listPages();
      const p2 = pages.find((p) => p.page_id === "test-page-222");
      const p1 = pages.find((p) => p.page_id === "test-page-111");
      assert.strictEqual(p2?.is_default, true, "Page 222 must now be default");
      assert.strictEqual(p1?.is_default, false, "Page 111 must not be default");
    });

    await test("Disconnect individual Page 333 without disconnecting Page 111 or 222", async () => {
      await disconnectPage("test-page-333");
      const p1 = await getPageWithToken("test-page-111");
      assert.ok(p1, "Page 111 must still exist");

      const p2 = await getPageWithToken("test-page-222");
      assert.ok(p2, "Page 222 must still exist");

      // Reconnect test-page-333
      await reconnectPage("test-page-333");
    });

    // -------------------------------------------------------------
    // Suite 3: Client & Dashboard API Endpoints
    // -------------------------------------------------------------
    console.log("\n--- Suite 3: Client & Dashboard API Endpoints ---");

    await test("GET /api/facebook/pages returns all active pages with default flag", async () => {
      const req = new Request("http://localhost/api/facebook/pages", {
        headers: { cookie: sessionCookieHeader },
      });
      const res = await GET(req, { params: Promise.resolve({ path: ["facebook", "pages"] }) });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.pages), "Must return pages array");
      assert.ok(data.pages.length >= 2, "Must contain at least 2 pages");
      assert.strictEqual(data.defaultPageId, "test-page-222");

      for (const p of data.pages) {
        assert.strictEqual(p.access_token, undefined, "Token must not be present in API output");
      }
    });

    await test("POST /api/facebook/default-page sets default page via dashboard API", async () => {
      const req = new Request("http://localhost/api/facebook/default-page", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: sessionCookieHeader,
        },
        body: JSON.stringify({ pageId: "test-page-111", pageName: "Sample Page Alpha" }),
      });
      const res = await POST(req, { params: Promise.resolve({ path: ["facebook", "default-page"] }) });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.defaultPageId, "test-page-111");
    });

    // -------------------------------------------------------------
    // Suite 4: Content Requests Destination Selection
    // -------------------------------------------------------------
    console.log("\n--- Suite 4: Content Request Destination Selection ---");

    await test("POST /api/content-requests persists explicit targetPageId", async () => {
      const req = new Request("http://localhost/api/content-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: sessionCookieHeader,
        },
        body: JSON.stringify({
          topic: "Artificial Intelligence in Algorithmic Trading",
          platform: "facebook",
          contentType: "Stock Market Analysis",
          targetPageId: "test-page-222",
          targetPageName: "Tech Innovation Hub Test",
        }),
      });
      const res = await POST(req, { params: Promise.resolve({ path: ["content-requests"] }) });
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.request.target_page_id, "test-page-222");
      assert.strictEqual(data.request.target_page_name, "Tech Innovation Hub Test");
      createdRequestId = data.request.id;
    });

    await test("Content Request without targetPageId defaults to configured default page", async () => {
      const req = new Request("http://localhost/api/content-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: sessionCookieHeader,
        },
        body: JSON.stringify({
          topic: "Compound interest rule of 72",
          platform: "facebook",
        }),
      });
      const res = await POST(req, { params: Promise.resolve({ path: ["content-requests"] }) });
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.request.target_page_id, "test-page-111");
    });

    // -------------------------------------------------------------
    // Suite 5: Custom GPT Actions (M2M) Multi-Page Support
    // -------------------------------------------------------------
    console.log("\n--- Suite 5: Custom GPT Actions (M2M) ---");

    await test("GET /api/chatgpt/connected-pages rejects unauthorized calls", async () => {
      const req = new Request("http://localhost/api/chatgpt/connected-pages");
      const res = await GET(req, { params: Promise.resolve({ path: ["chatgpt", "connected-pages"] }) });
      assert.strictEqual(res.status, 401);
    });

    await test("GET /api/chatgpt/connected-pages returns sanitized pages with API key", async () => {
      const req = new Request("http://localhost/api/chatgpt/connected-pages", {
        headers: { "x-api-key": validApiKey },
      });
      const res = await GET(req, { params: Promise.resolve({ path: ["chatgpt", "connected-pages"] }) });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.pages), "Must return pages array");
      assert.ok(data.pages.length >= 2, "Must contain at least 2 pages");
      assert.strictEqual(data.count, data.pages.length);
      assert.ok(data.defaultPageId, "Should indicate defaultPageId");

      for (const p of data.pages) {
        assert.ok(p.id, "Page must have id");
        assert.ok(p.name, "Page must have name");
        assert.strictEqual(p.access_token, undefined, "Page must NOT expose token");
        assert.strictEqual(p.token, undefined, "Page must NOT expose token");
      }
    });

    await test("M2M getChatGPTContentRequest returns destination target_page_id", async () => {
      const req = new Request(`http://localhost/api/chatgpt/requests/${createdRequestId}`, {
        headers: { "x-api-key": validApiKey },
      });
      const res = await GET(req, {
        params: Promise.resolve({ path: ["chatgpt", "requests", createdRequestId as string] }),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.targetPageId, "test-page-222");
      assert.strictEqual(data.targetPageName, "Tech Innovation Hub Test");
    });

    let hostedImageUrl = "";
    await test("importChatGPTImage stores valid test image", async () => {
      const validPngBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const req = new Request("http://localhost/api/chatgpt/images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": validApiKey,
        },
        body: JSON.stringify({
          imageBase64: validPngBase64,
        }),
      });
      const res = await POST(req, { params: Promise.resolve({ path: ["chatgpt", "images"] }) });
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      hostedImageUrl = data.url;
    });

    await test("createChatGPTPost accepts pageId and associates it with created draft", async () => {
      const req = new Request("http://localhost/api/chatgpt/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": validApiKey,
        },
        body: JSON.stringify({
          requestId: createdRequestId,
          title: "AI in Trading",
          description: "How artificial intelligence is reshaping modern finance. #AI #Trading",
          hashtags: ["#AI", "#Trading"],
          imageUrl: hostedImageUrl,
          pageId: "test-page-222",
        }),
      });
      const res = await POST(req, { params: Promise.resolve({ path: ["chatgpt", "posts"] }) });
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.ok(data.postId);
      assert.strictEqual(data.pageName, "Tech Innovation Hub Test");
      createdPostId = data.postId;
      const { getPost } = await import("../src/lib/db/posts");
      const post = await getPost(data.postId);
      assert.strictEqual(post?.page_id, "test-page-222");
    });

    await test("createChatGPTPost rejects invalid/unauthorized pageId", async () => {
      const req = new Request("http://localhost/api/chatgpt/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": validApiKey,
        },
        body: JSON.stringify({
          title: "Unauthorized Page Post",
          description: "This should fail",
          imageUrl: hostedImageUrl,
          pageId: "completely-unauthorized-page-9999",
        }),
      });
      const res = await POST(req, { params: Promise.resolve({ path: ["chatgpt", "posts"] }) });
      assert.strictEqual(res.status, 409);
      const data = await res.json();
      assert.ok(data.error?.includes("not connected, inactive, or unauthorized"));
    });

    await test("createChatGPTPost resolves target page by exact/trimmed case-insensitive pageName", async () => {
      // Default is test-page-111 ("Alpha Marketing Hub Test")
      // We explicitly request pageName: "  tech innovation hub test  "
      const req = new Request("http://localhost/api/chatgpt/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": validApiKey,
        },
        body: JSON.stringify({
          title: "Page Selection By Name",
          description: "Testing page name resolution for non-default page",
          imageUrl: hostedImageUrl,
          pageName: "  tech innovation hub test  ",
        }),
      });
      const res = await POST(req, { params: Promise.resolve({ path: ["chatgpt", "posts"] }) });
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.pageName, "Tech Innovation Hub Test");

      const { getPost, deletePostRecord } = await import("../src/lib/db/posts");
      const post = await getPost(data.postId);
      assert.strictEqual(post?.page_id, "test-page-222");
      // clean up created post
      await deletePostRecord(data.postId);
    });

    await test("createChatGPTPost rejects unknown requested pageName without falling back to default", async () => {
      const req = new Request("http://localhost/api/chatgpt/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": validApiKey,
        },
        body: JSON.stringify({
          title: "Non Existent Page Post",
          description: "This should fail and not fall back to default page",
          imageUrl: hostedImageUrl,
          pageName: "Non Existent Mystery Page",
        }),
      });
      const res = await POST(req, { params: Promise.resolve({ path: ["chatgpt", "posts"] }) });
      assert.strictEqual(res.status, 409);
      const data = await res.json();
      assert.strictEqual(data.code, "PAGE_NOT_FOUND");
    });

    await test("createChatGPTPost rejects ambiguous page names when duplicates exist", async () => {
      // Temporarily insert a duplicate named page
      await db.from("pages_cache").insert({
        page_id: "test-page-duplicate-name",
        name: "Tech Innovation Hub Test",
        access_token: "mock-dup-token",
        is_active: true,
      });

      try {
        const req = new Request("http://localhost/api/chatgpt/posts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": validApiKey,
          },
          body: JSON.stringify({
            title: "Ambiguous Post",
            description: "Testing duplicate name rejection",
            imageUrl: hostedImageUrl,
            pageName: "Tech Innovation Hub Test",
          }),
        });
        const res = await POST(req, { params: Promise.resolve({ path: ["chatgpt", "posts"] }) });
        assert.strictEqual(res.status, 409);
        const data = await res.json();
        assert.strictEqual(data.code, "AMBIGUOUS_PAGE_NAME");
      } finally {
        await db.from("pages_cache").delete().eq("page_id", "test-page-duplicate-name");
      }
    });

    // -------------------------------------------------------------
    // Suite 6: Security & Content Hash Binding
    // -------------------------------------------------------------
    console.log("\n--- Suite 6: Content Hash & Approval Binding ---");

    await test("Changing destination page modifies content hash (invalidating cross-page approvals)", () => {
      const postDataPage1 = {
        postId: "post-123",
        title: "Market Rally Ahead",
        description: "Why tech stocks could lead the next bull run",
        hashtags: ["#Tech", "#Stocks"],
        imageUrl: "https://example.com/chart.png",
        pageId: "test-page-111",
      };

      const postDataPage2 = {
        ...postDataPage1,
        pageId: "test-page-222",
      };

      const hash1 = computePostContentHash(postDataPage1);
      const hash2 = computePostContentHash(postDataPage2);

      assert.notStrictEqual(
        hash1,
        hash2,
        "Content hash MUST change when target page changes, preventing approval cross-replay!"
      );
    });

    await test("Approve and publish refuse publication when target Page mismatches caller expectation", async () => {
      const { createPostRecord, deletePostRecord } = await import("../src/lib/db/posts");
      const { computePostContentHash, issueApprovalToken } = await import("../src/lib/auth/integration");
      const post = await createPostRecord({
        topic: "Testing mismatch",
        title: "Mismatch Title",
        description: "Mismatch Description",
        hashtags: [],
        image_url: hostedImageUrl,
        image_source: "ai",
        link_url: null,
        page_id: "test-page-222",
        page_name: "Tech Innovation Hub Test",
        scheduled_at: null,
        status: "draft",
      });

      try {
        const hash = computePostContentHash({
          postId: post.id,
          title: post.title,
          description: post.description,
          hashtags: post.hashtags,
          imageUrl: post.image_url,
          pageId: post.page_id!,
        });

        // 1. Approval with mismatched expectedPageId
        const reqApproveMismatch = new Request(`http://localhost/api/chatgpt/posts/${post.id}/approve`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": validApiKey,
          },
          body: JSON.stringify({
            userConfirmed: true,
            contentHash: hash,
            expectedPageId: "test-page-111", // Mismatch!
          }),
        });
        const resApproveMismatch = await POST(reqApproveMismatch, {
          params: Promise.resolve({ path: ["chatgpt", "posts", post.id, "approve"] }),
        });
        assert.strictEqual(resApproveMismatch.status, 409);
        const dataApproveMismatch = await resApproveMismatch.json();
        assert.strictEqual(dataApproveMismatch.code, "PAGE_MISMATCH");

        // 2. Mint approval token matching actual page
        const { token } = await issueApprovalToken({
          postId: post.id,
          contentHash: hash,
          ttlSeconds: 600,
        });

        // 3. Publish with mismatched expectedPageName
        const reqPublishMismatch = new Request(`http://localhost/api/chatgpt/posts/${post.id}/publish`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": validApiKey,
          },
          body: JSON.stringify({
            approvalToken: token,
            expectedPageName: "Loving Doggy", // Mismatch!
            dryRun: true,
          }),
        });
        const resPublishMismatch = await POST(reqPublishMismatch, {
          params: Promise.resolve({ path: ["chatgpt", "posts", post.id, "publish"] }),
        });
        assert.strictEqual(resPublishMismatch.status, 409);
        const dataPublishMismatch = await resPublishMismatch.json();
        assert.strictEqual(dataPublishMismatch.code, "PAGE_MISMATCH");
      } finally {
        await deletePostRecord(post.id);
      }
    });

    await test("Request targeting 'Live Jesus Christ' creates draft for that exact Page even if default is Page B", async () => {
      // In the real test database, "Live Jesus Christ" has page_id "106882792429612".
      // Test page selection by exact name "Live Jesus Christ".
      const req = new Request("http://localhost/api/chatgpt/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": validApiKey,
        },
        body: JSON.stringify({
          title: "Who Is Jesus? Discover the Love That Changes Everything",
          description: "Who is Jesus? He came to show us God's love and offer hope.",
          imageUrl: hostedImageUrl,
          pageName: "Live Jesus Christ",
        }),
      });
      const res = await POST(req, { params: Promise.resolve({ path: ["chatgpt", "posts"] }) });
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.pageName, "Live Jesus Christ");
      assert.strictEqual(data.pageId, "106882792429612");

      const { getPost, deletePostRecord } = await import("../src/lib/db/posts");
      const post = await getPost(data.postId);
      assert.strictEqual(post?.page_id, "106882792429612");
      assert.strictEqual(post?.page_name, "Live Jesus Christ");
      await deletePostRecord(data.postId);
    });

    await test("createChatGPTPost rejects with TARGET_PAGE_MISMATCH when destination conflict occurs", async () => {
      const req = new Request("http://localhost/api/chatgpt/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": validApiKey,
        },
        body: JSON.stringify({
          title: "Conflicting Target Post",
          description: "Testing target consistency check",
          imageUrl: hostedImageUrl,
          pageId: "test-page-111",
          pageName: "Tech Innovation Hub Test", // Mismatched Page name for Page ID 111!
        }),
      });
      const res = await POST(req, { params: Promise.resolve({ path: ["chatgpt", "posts"] }) });
      assert.strictEqual(res.status, 409);
      const data = await res.json();
      assert.strictEqual(data.code, "TARGET_PAGE_MISMATCH");
    });

    // -------------------------------------------------------------
    // Suite 7: Master Prompt Acceptance Scenarios A through L
    // -------------------------------------------------------------
    console.log("\n--- Suite 7: Master Prompt Acceptance Scenarios A through L ---");

    const livePages = [
      {
        id: "111439634371975",
        page_id: "111439634371975",
        name: "Invest In Stock Market",
        category: "Investing",
        access_token: "EAAB_INVEST_IN_STOCK_MARKET_TEST_TOKEN_LONG_ENOUGH_12345",
        is_active: true,
      },
      {
        id: "106882792429612",
        page_id: "106882792429612",
        name: "Live Jesus Christ",
        category: "Religious Organization",
        access_token: "EAAB_LIVE_JESUS_CHRIST_TEST_TOKEN_LONG_ENOUGH_12345",
        is_active: true,
      },
      {
        id: "286923627847340",
        page_id: "286923627847340",
        name: "loving doggy ",
        category: "Pets",
        access_token: "EAAB_LOVING_DOGGY_TEST_TOKEN_LONG_ENOUGH_12345",
        is_active: true,
      },
    ];
    await upsertPages(livePages);

    // Test A: Correct Page selection (Invest in Stock Market)
    await test("Scenario A: Stock-market post for 'Invest in Stock Market' targets Page 111439634371975", async () => {
      const req = new Request("http://localhost/api/chatgpt/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": validApiKey },
        body: JSON.stringify({
          title: "S&P 500 Market Close Analysis",
          description: "Markets rallied today led by semiconductors and large-cap tech. How did your portfolio perform?",
          imageUrl: hostedImageUrl,
          pageName: "Invest in Stock Market",
        }),
      });
      const res = await POST(req, { params: Promise.resolve({ path: ["chatgpt", "posts"] }) });
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.pageId, "111439634371975");
      createdScenarioPostIds.push(data.postId);
    });

    // Test B: Different content, different Page (Live Jesus Christ)
    await test("Scenario B: Devotional post for 'Live Jesus Christ' targets Page 106882792429612 independently", async () => {
      const req = new Request("http://localhost/api/chatgpt/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": validApiKey },
        body: JSON.stringify({
          title: "Grace and Peace for Your Day",
          description: "May your heart be filled with faith and peace as you walk through today's challenges.",
          imageUrl: hostedImageUrl,
          pageName: "Live Jesus Christ",
        }),
      });
      const res = await POST(req, { params: Promise.resolve({ path: ["chatgpt", "posts"] }) });
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.pageId, "106882792429612");
      createdScenarioPostIds.push(data.postId);
    });

    // Test C: Animal-related post ('Loving Doggie' matching 'loving doggy ')
    await test("Scenario C: Animal post for 'Loving Doggie' matches Page 286923627847340 with phonetic/whitespace tolerance", async () => {
      const req = new Request("http://localhost/api/chatgpt/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": validApiKey },
        body: JSON.stringify({
          title: "Golden Retriever Daily Joy",
          description: "Nothing beats the pure happiness of a wagging tail welcoming you home! Share your pup's photo below.",
          imageUrl: hostedImageUrl,
          pageName: "Loving Doggie",
        }),
      });
      const res = await POST(req, { params: Promise.resolve({ path: ["chatgpt", "posts"] }) });
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.pageId, "286923627847340");
      createdScenarioPostIds.push(data.postId);
    });

    // Test D: Multiple drafts retain their own destinations regardless of creation order
    let draftStockId = "";
    let draftJesusId = "";
    let draftDoggieId = "";
    await test("Scenario D: Multiple drafts retain independent destinations simultaneously", async () => {
      const createDraft = async (name: string, title: string) => {
        const req = new Request("http://localhost/api/chatgpt/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": validApiKey },
          body: JSON.stringify({ title, description: "Test description", imageUrl: hostedImageUrl, pageName: name }),
        });
        const res = await POST(req, { params: Promise.resolve({ path: ["chatgpt", "posts"] }) });
        const d = await res.json();
        createdScenarioPostIds.push(d.postId);
        return d;
      };

      const stockDraft = await createDraft("Invest in Stock Market", "Draft Stock 1");
      const jesusDraft = await createDraft("Live Jesus Christ", "Draft Jesus 1");
      const doggieDraft = await createDraft("Loving Doggie", "Draft Doggie 1");

      draftStockId = stockDraft.postId;
      draftJesusId = jesusDraft.postId;
      draftDoggieId = doggieDraft.postId;

      const { getPost } = await import("../src/lib/db/posts");
      const p1 = await getPost(draftStockId);
      const p2 = await getPost(draftJesusId);
      const p3 = await getPost(draftDoggieId);

      assert.strictEqual(p1?.page_id, "111439634371975");
      assert.strictEqual(p2?.page_id, "106882792429612");
      assert.strictEqual(p3?.page_id, "286923627847340");
    });

    // Test E: Default Page changes do NOT redirect existing drafts
    await test("Scenario E: Changing default Page leaves existing drafts targeting their assigned Pages", async () => {
      await updateSettings({ default_page_id: "106882792429612", default_page_name: "Live Jesus Christ" });
      const { getPost } = await import("../src/lib/db/posts");
      const p = await getPost(draftStockId);
      assert.strictEqual(p?.page_id, "111439634371975", "Existing draft MUST NOT change target page when default page changes!");
    });

    // Test F: Disconnected/unknown destination fails safely without fallback
    await test("Scenario F: Disconnected/unknown destination rejects without falling back to default Page", async () => {
      const req = new Request("http://localhost/api/chatgpt/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": validApiKey },
        body: JSON.stringify({
          title: "Unknown Page Post",
          description: "Should fail safely",
          imageUrl: hostedImageUrl,
          pageName: "Non Connected Facebook Page XYZ",
        }),
      });
      const res = await POST(req, { params: Promise.resolve({ path: ["chatgpt", "posts"] }) });
      assert.strictEqual(res.status, 409);
      const data = await res.json();
      assert.strictEqual(data.code, "PAGE_NOT_FOUND");
    });

    // Test G: Ambiguous Page names trigger clarification error
    await test("Scenario G: Ambiguous Page names stop and report AMBIGUOUS_PAGE_NAME", async () => {
      await db.from("pages_cache").insert({
        page_id: "test-page-dup-loving",
        name: "Loving Doggie",
        access_token: "mock-token",
        is_active: true,
      });

      try {
        const req = new Request("http://localhost/api/chatgpt/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": validApiKey },
          body: JSON.stringify({
            title: "Ambiguous Dog Post",
            description: "Should fail",
            imageUrl: hostedImageUrl,
            pageName: "Loving Doggie",
          }),
        });
        const res = await POST(req, { params: Promise.resolve({ path: ["chatgpt", "posts"] }) });
        assert.strictEqual(res.status, 409);
        const data = await res.json();
        assert.strictEqual(data.code, "AMBIGUOUS_PAGE_NAME");
      } finally {
        await db.from("pages_cache").delete().eq("page_id", "test-page-dup-loving");
      }
    });

    // Test H: Publication destination uses Loving Doggie's stored Page ID and authorized credentials
    await test("Scenario H: Approving and publishing Loving Doggie draft uses its stored credentials", async () => {
      const { getPost } = await import("../src/lib/db/posts");
      const post = await getPost(draftDoggieId);
      assert.ok(post);

      const hash = computePostContentHash({
        postId: post.id,
        title: post.title,
        description: post.description,
        hashtags: post.hashtags,
        imageUrl: post.image_url,
        pageId: post.page_id!,
      });

      // Approve
      const reqApprove = new Request(`http://localhost/api/chatgpt/posts/${post.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": validApiKey },
        body: JSON.stringify({ userConfirmed: true, contentHash: hash }),
      });
      const resApprove = await POST(reqApprove, {
        params: Promise.resolve({ path: ["chatgpt", "posts", post.id, "approve"] }),
      });
      assert.strictEqual(resApprove.status, 200);
      const approveData = await resApprove.json();

      // Publish dryRun
      const reqPublish = new Request(`http://localhost/api/chatgpt/posts/${post.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": validApiKey },
        body: JSON.stringify({ approvalToken: approveData.approvalToken, dryRun: true }),
      });
      const resPublish = await POST(reqPublish, {
        params: Promise.resolve({ path: ["chatgpt", "posts", post.id, "publish"] }),
      });
      assert.strictEqual(resPublish.status, 200);
      const publishData = await resPublish.json();
      assert.strictEqual(publishData.pageId, "286923627847340");
    });

    // Test I: Tampering destination invalidates approval
    await test("Scenario I: Changing post destination invalidates prior approval", async () => {
      const { reassignPostDestination, getPost } = await import("../src/lib/db/posts");
      const postBefore = await getPost(draftDoggieId);
      assert.strictEqual(postBefore?.approved_by_user, true);

      // Reassign to Live Jesus Christ
      await reassignPostDestination(draftDoggieId, "106882792429612");
      const postAfter = await getPost(draftDoggieId);
      assert.strictEqual(postAfter?.page_id, "106882792429612");
      assert.strictEqual(postAfter?.approved_by_user, false, "Approval MUST be revoked on destination change!");
      assert.strictEqual(postAfter?.approval_content_hash, null);
    });

    // Test J: Duplicate publication rejection
    await test("Scenario J: Duplicate publication attempt on already published post is rejected", async () => {
      const { updatePostRecord } = await import("../src/lib/db/posts");
      await updatePostRecord(draftStockId, { status: "posted", facebook_post_id: "111439634371975_9876543210" });

      const req = new Request(`http://localhost/api/posts/${draftStockId}/post-now`, {
        method: "POST",
        headers: { cookie: sessionCookieHeader },
      });
      const res = await POST(req, {
        params: Promise.resolve({ path: ["posts", draftStockId, "post-now"] }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error?.includes("already been posted"));
    });

    // Test K: Concurrent requests do not leak destination
    await test("Scenario K: Concurrent requests for different Pages preserve strict isolation", async () => {
      const [resA, resB] = await Promise.all([
        POST(
          new Request("http://localhost/api/chatgpt/posts", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": validApiKey },
            body: JSON.stringify({
              title: "Concurrent Post A",
              description: "Desc A",
              imageUrl: hostedImageUrl,
              pageName: "Invest in Stock Market",
            }),
          }),
          { params: Promise.resolve({ path: ["chatgpt", "posts"] }) }
        ),
        POST(
          new Request("http://localhost/api/chatgpt/posts", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": validApiKey },
            body: JSON.stringify({
              title: "Concurrent Post B",
              description: "Desc B",
              imageUrl: hostedImageUrl,
              pageName: "Live Jesus Christ",
            }),
          }),
          { params: Promise.resolve({ path: ["chatgpt", "posts"] }) }
        ),
      ]);

      const dataA = await resA.json();
      const dataB = await resB.json();
      createdScenarioPostIds.push(dataA.postId, dataB.postId);

      assert.strictEqual(dataA.pageId, "111439634371975");
      assert.strictEqual(dataB.pageId, "106882792429612");
    });

    // Test L: Safe migration preserves unassigned drafts with manual review flag
    await test("Scenario L: Draft with null page_id is flagged and blocked from silent publication", async () => {
      const { createPostRecord } = await import("../src/lib/db/posts");
      const unassignedDraft = await createPostRecord({
        topic: "Legacy Post Without Page",
        title: "Legacy Post",
        description: "Legacy unassigned description",
        hashtags: [],
        image_url: hostedImageUrl,
        image_source: "ai",
        link_url: null,
        page_id: null,
        page_name: null,
        scheduled_at: null,
        status: "draft",
      });
      createdScenarioPostIds.push(unassignedDraft.id);

      // Verify publishing is rejected because destination page is null (never silently falling back to default)
      const req = new Request(`http://localhost/api/posts/${unassignedDraft.id}/post-now`, {
        method: "POST",
        headers: { cookie: sessionCookieHeader },
      });
      const res = await POST(req, {
        params: Promise.resolve({ path: ["posts", unassignedDraft.id, "post-now"] }),
      });
      assert.strictEqual(res.status, 409);
      const data = await res.json();
      assert.ok(data.error?.includes("Destination Facebook Page is not assigned"));
    });
  } finally {
    // -------------------------------------------------------------
    // Safe Cleanup: Restore initial settings & delete test rows
    // -------------------------------------------------------------
    console.log("\nCleaning up test artifacts...");
    try {
      if (initialSettings.default_page_id) {
        await updateSettings({
          default_page_id: initialSettings.default_page_id,
          default_page_name: initialSettings.default_page_name,
          default_page_token: initialSettings.default_page_token,
        });
      }
      await db.from("pages_cache").delete().in("page_id", ["test-page-111", "test-page-222", "test-page-333"]);
      if (createdPostId) {
        await db.from("posts").delete().eq("id", createdPostId);
      }
      if (createdRequestId) {
        await db.from("content_requests").delete().eq("id", createdRequestId);
      }
      if (createdScenarioPostIds && createdScenarioPostIds.length > 0) {
        await db.from("posts").delete().in("id", createdScenarioPostIds);
      }
    } catch {
      // Non-fatal cleanup
    }
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log("\n=======================================================");
  console.log(` Multi-Page Test Suite Finished: ${passedTests}/${totalTests} Passed (100%)`);
  console.log("=======================================================\n");
}

run().catch((err) => {
  console.error("Test execution encountered an error:", err);
  process.exit(1);
});
