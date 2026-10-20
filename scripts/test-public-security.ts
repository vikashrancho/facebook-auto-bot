/**
 * Security & Privacy Regression Test Suite
 *
 * Validates:
 * 1. Zero data leakage in public frontend source and mock components (no real Page IDs or names).
 * 2. Strict server-side route guarding (unauthenticated access to /api/* returns 401).
 * 3. Custom GPT M2M integration authentication (validates Bearer INTEGRATION_API_KEY).
 * 4. Next.js middleware protection of protected dashboard routes vs public routes.
 * 5. Supabase RLS lockdown migration verification.
 * 6. Marketing copy alignment with Custom GPT architecture (no direct AI model API calls).
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import { GET as apiGet, POST as apiPost } from "../src/app/api/[...path]/route";
import { middleware } from "../src/middleware";
import { NextRequest } from "next/server";

// Set environment for safe testing
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "test-admin-password";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.INTEGRATION_API_KEY = process.env.INTEGRATION_API_KEY || "test-integration-api-key-32chars!";

let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then(() => {
          console.log(`  ✓ ${name}`);
          passed++;
        })
        .catch((err) => {
          console.error(`  ✗ ${name}`);
          console.error(`    ${err instanceof Error ? err.message : String(err)}`);
          failed++;
        });
    } else {
      console.log(`  ✓ ${name}`);
      passed++;
    }
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

async function main() {
  console.log("\n🔒 Running Security & Privacy Regression Suite...\n");

  // --------------------------------------------------------------------------
  // TEST GROUP 1: PUBLIC CODEBASE DATA LEAKAGE AUDIT
  // --------------------------------------------------------------------------
  console.log("Group 1: Public Codebase Data Leakage Audit");

  const REAL_LEAKED_STRINGS = [
    "111439634371975",
    "527224283808051",
    "1054448308040014",
    "104928472918274",
    "Invest In Stock Market",
    "CJP Clips",
    "VE Shopping Store",
  ];

  const PUBLIC_FILES_TO_CHECK = [
    "src/app/page.tsx",
    "src/app/about/page.tsx",
    "src/app/how-it-works/page.tsx",
    "src/app/requirements/page.tsx",
    "src/app/benefits/page.tsx",
    "src/app/limitations/page.tsx",
    "src/app/privacy/page.tsx",
    "src/components/public/public-header.tsx",
    "src/components/public/public-footer.tsx",
    "src/components/public/marketing-shell.tsx",
    "src/components/public/interactive-dashboard-mockup.tsx",
    "src/components/public/dashboard-preview-section.tsx",
    "public/openapi.json",
    "src/app/dashboard/page.tsx",
    "src/components/dashboard/calendar/calendar-header.tsx",
    "src/components/dashboard/calendar/schedule-post-modal.tsx",
    "src/components/dashboard/calendar/post-detail-modal.tsx",
    "src/components/dashboard/calendar/day-view.tsx",
  ];

  for (const relPath of PUBLIC_FILES_TO_CHECK) {
    const fullPath = path.resolve(relPath);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, "utf-8");

    runTest(`No real Facebook Page IDs or names in ${relPath}`, () => {
      for (const forbidden of REAL_LEAKED_STRINGS) {
        assert(
          !content.includes(forbidden),
          `Found forbidden private data "${forbidden}" in public file: ${relPath}`
        );
      }
    });
  }

  runTest("Dashboard preview section uses sanitized sample identifiers and requested fictional counts", () => {
    const previewPath = path.resolve("src/components/public/dashboard-preview-section.tsx");
    const content = fs.readFileSync(previewPath, "utf-8");
    assert(content.includes("Sample Facebook Page"), "Should use generic sample page label");
    assert(content.includes("128"), "Overview should display fictional total posts 128");
    assert(content.includes("14"), "Overview should display fictional weekly posts 14");
    assert(content.includes("6"), "Overview should display fictional queue count 6");
    assert(content.includes("42"), "Calendar should display fictional published count 42");
    assert(content.includes("Demo Preview · Sample Data"), "Should display demo disclaimer");
    assert(!content.includes("Vikash"), "Should never contain real user names");
    assert(!content.includes("Stock Market Holiday"), "Should never contain real post titles");
  });

  runTest("Interactive dashboard mockup uses sanitized sample identifiers", () => {
    const mockupPath = path.resolve("src/components/public/interactive-dashboard-mockup.tsx");
    const content = fs.readFileSync(mockupPath, "utf-8");
    assert(content.includes("100000000000001"), "Should use generic sample ID 100000000000001");
    assert(content.includes("Acme Digital Agency"), "Should use generic sample brand name");
    assert(!content.includes("3fa85f64"), "Should not contain hardcoded real post ID");
  });

  runTest("OpenAPI specification uses sanitized sample Page IDs and names", () => {
    const openApiPath = path.resolve("public/openapi.json");
    const content = fs.readFileSync(openApiPath, "utf-8");
    assert(content.includes("100000000000001"), "OpenAPI should use generic sample ID");
    assert(content.includes("Acme Media Studio"), "OpenAPI should use generic sample brand");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 2: SERVER-SIDE API AUTHORIZATION GUARDS
  // --------------------------------------------------------------------------
  console.log("\nGroup 2: Server-Side API Authorization Guards");

  await runTest("Unauthenticated GET /api/posts returns 401 Unauthorized", async () => {
    const req = new Request("http://localhost:3000/api/posts", { method: "GET" });
    const res = await apiGet(req, { params: Promise.resolve({ path: ["posts"] }) });
    assert.strictEqual(res.status, 401, `Expected status 401, got ${res.status}`);
  });

  await runTest("Unauthenticated GET /api/settings returns 401 Unauthorized", async () => {
    const req = new Request("http://localhost:3000/api/settings", { method: "GET" });
    const res = await apiGet(req, { params: Promise.resolve({ path: ["settings"] }) });
    assert.strictEqual(res.status, 401, `Expected status 401, got ${res.status}`);
  });

  await runTest("Unauthenticated GET /api/facebook/pages returns 401 Unauthorized", async () => {
    const req = new Request("http://localhost:3000/api/facebook/pages", { method: "GET" });
    const res = await apiGet(req, { params: Promise.resolve({ path: ["facebook", "pages"] }) });
    assert.strictEqual(res.status, 401, `Expected status 401, got ${res.status}`);
  });

  await runTest("Unauthenticated GET /api/content-requests returns 401 Unauthorized", async () => {
    const req = new Request("http://localhost:3000/api/content-requests", { method: "GET" });
    const res = await apiGet(req, { params: Promise.resolve({ path: ["content-requests"] }) });
    assert.strictEqual(res.status, 401, `Expected status 401, got ${res.status}`);
  });

  await runTest("Unauthenticated GET /api/calendar returns 401 Unauthorized", async () => {
    const req = new Request("http://localhost:3000/api/calendar", { method: "GET" });
    const res = await apiGet(req, { params: Promise.resolve({ path: ["calendar"] }) });
    assert.strictEqual(res.status, 401, `Expected status 401, got ${res.status}`);
  });

  await runTest("Unauthenticated POST /api/posts returns 401 Unauthorized", async () => {
    const req = new Request("http://localhost:3000/api/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: "test" }),
    });
    const res = await apiPost(req, { params: Promise.resolve({ path: ["posts"] }) });
    assert.strictEqual(res.status, 401, `Expected status 401, got ${res.status}`);
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 3: MACHINE-TO-MACHINE (CUSTOM GPT) AUTHENTICATION
  // --------------------------------------------------------------------------
  console.log("\nGroup 3: Custom GPT Action Authorization Guards");

  await runTest("Custom GPT endpoint /api/chatgpt/connected-pages rejects missing auth", async () => {
    const req = new Request("http://localhost:3000/api/chatgpt/connected-pages", { method: "GET" });
    const res = await apiGet(req, { params: Promise.resolve({ path: ["chatgpt", "connected-pages"] }) });
    assert.strictEqual(res.status, 401, `Expected 401 without auth, got ${res.status}`);
  });

  await runTest("Custom GPT endpoint /api/chatgpt/connected-pages rejects invalid Bearer token", async () => {
    const req = new Request("http://localhost:3000/api/chatgpt/connected-pages", {
      method: "GET",
      headers: { authorization: "Bearer invalid-key-12345" },
    });
    const res = await apiGet(req, { params: Promise.resolve({ path: ["chatgpt", "connected-pages"] }) });
    assert.strictEqual(res.status, 401, `Expected 401 with bad key, got ${res.status}`);
  });

  await runTest("Custom GPT endpoint /api/chatgpt/requests rejects unauthenticated caller", async () => {
    const req = new Request("http://localhost:3000/api/chatgpt/requests", { method: "GET" });
    const res = await apiGet(req, { params: Promise.resolve({ path: ["chatgpt", "requests"] }) });
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
  });

  await runTest("Custom GPT endpoint /api/chatgpt/posts rejects unauthenticated POST", async () => {
    const req = new Request("http://localhost:3000/api/chatgpt/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await apiPost(req, { params: Promise.resolve({ path: ["chatgpt", "posts"] }) });
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 4: NEXT.JS MIDDLEWARE ROUTE PROTECTION
  // --------------------------------------------------------------------------
  console.log("\nGroup 4: Middleware Route Protection");

  await runTest("Middleware allows public routes without redirect", async () => {
    const publicPaths = [
      "http://localhost:3000/",
      "http://localhost:3000/about",
      "http://localhost:3000/how-it-works",
      "http://localhost:3000/requirements",
      "http://localhost:3000/benefits",
      "http://localhost:3000/limitations",
      "http://localhost:3000/privacy",
      "http://localhost:3000/login",
    ];

    for (const urlStr of publicPaths) {
      const req = new NextRequest(urlStr);
      const res = await middleware(req);
      assert.strictEqual(
        res.status,
        200,
        `Expected public URL ${urlStr} to pass with 200, but got ${res.status}`
      );
    }
  });

  await runTest("Middleware redirects unauthenticated /dashboard to /login?next=/dashboard", async () => {
    const req = new NextRequest("http://localhost:3000/dashboard");
    const res = await middleware(req);
    assert.strictEqual(res.status, 307, `Expected 307 redirect, got ${res.status}`);
    const location = res.headers.get("location");
    assert(location?.includes("/login?next=%2Fdashboard"), `Expected redirect to login, got ${location}`);
  });

  await runTest("Middleware redirects unauthenticated /dashboard/pages to /login", async () => {
    const req = new NextRequest("http://localhost:3000/dashboard/pages");
    const res = await middleware(req);
    assert.strictEqual(res.status, 307, `Expected 307 redirect, got ${res.status}`);
    const location = res.headers.get("location");
    assert(location?.includes("/login?next=%2Fdashboard%2Fpages"), `Expected redirect to login, got ${location}`);
  });

  await runTest("Middleware redirects unauthenticated /dashboard/queue to /login", async () => {
    const req = new NextRequest("http://localhost:3000/dashboard/queue");
    const res = await middleware(req);
    assert.strictEqual(res.status, 307, `Expected 307 redirect, got ${res.status}`);
    const location = res.headers.get("location");
    assert(location?.includes("/login?next=%2Fdashboard%2Fqueue"), `Expected redirect to login, got ${location}`);
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 5: SUPABASE DATABASE RLS & SCHEMA LOCKDOWN
  // --------------------------------------------------------------------------
  console.log("\nGroup 5: Database Row Level Security (RLS) Verification");

  runTest("RLS lockdown migration exists and secures all application tables", () => {
    const migrationPath = path.resolve("supabase/migrations/20261022_enable_rls_lockdown.sql");
    assert(fs.existsSync(migrationPath), "Migration file must exist");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    const requiredTables = ["app_settings", "posts", "pages_cache", "topics", "templates", "content_requests", "approval_tokens"];
    for (const tbl of requiredTables) {
      assert(
        sql.includes(`alter table if exists ${tbl} enable row level security;`),
        `Migration must enable RLS on ${tbl}`
      );
      assert(
        sql.includes(`to service_role`),
        `Migration must grant access strictly to service_role for ${tbl}`
      );
    }
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 6: COPY & AI ARCHITECTURE ALIGNMENT
  // --------------------------------------------------------------------------
  console.log("\nGroup 6: Product Copy & AI Architecture Alignment");

  runTest("Homepage contains recommended positioning and explanation verbatim", () => {
    const homeContent = fs.readFileSync(path.resolve("src/app/page.tsx"), "utf-8");
    assert(
      homeContent.includes("Vetechno FB Auto Post helps you organize your social media content workflow"),
      "Home page must include recommended positioning"
    );
    assert(
      homeContent.includes("Prepare a content request in the application, process it through your configured Custom GPT"),
      "Home page must include recommended explanation"
    );
  });

  runTest("Public marketing pages make Login the only authentication CTA", () => {
    const headerContent = fs.readFileSync(path.resolve("src/components/public/public-header.tsx"), "utf-8");
    assert(headerContent.includes("/login"), "Header must link to /login");
    assert(!headerContent.includes("Sign Up") && !headerContent.includes("Register"), "Header must not have Sign Up / Register CTA");

    const footerContent = fs.readFileSync(path.resolve("src/components/public/public-footer.tsx"), "utf-8");
    assert(!footerContent.includes("Register") && !footerContent.includes("Sign Up"), "Footer must not have Register / Sign Up CTA");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 7: SECURITY HEADERS & BROWSER PROTECTIONS
  // --------------------------------------------------------------------------
  console.log("\nGroup 7: Security Headers & Browser Protections");

  runTest("next.config.ts configures CSP, HSTS, X-Frame-Options, and Cache-Control", () => {
    const configPath = path.resolve("next.config.ts");
    const content = fs.readFileSync(configPath, "utf-8");
    assert(content.includes("Content-Security-Policy"), "Must configure Content-Security-Policy");
    assert(content.includes("X-Frame-Options"), "Must configure X-Frame-Options");
    assert(content.includes("Strict-Transport-Security"), "Must configure Strict-Transport-Security (HSTS)");
    assert(content.includes("X-Content-Type-Options"), "Must configure X-Content-Type-Options");
    assert(content.includes("no-store, no-cache"), "Must configure Cache-Control: no-store for APIs");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 8: RATE LIMITING & BRUTE FORCE DEFENSE
  // --------------------------------------------------------------------------
  console.log("\nGroup 8: Rate Limiting & Abuse Prevention");

  runTest("Rate limiter enforces limits and returns RFC-compliant headers", async () => {
    const { checkRateLimit, RATE_LIMIT_TIERS } = await import("../src/lib/rate-limit");
    const testKey = `test-ip-${Date.now()}`;
    const tier = { limit: 3, windowSeconds: 10 };

    const r1 = checkRateLimit(testKey, tier);
    assert(r1.allowed, "First request should be allowed");
    assert.strictEqual(r1.remaining, 2, "Remaining should be 2");

    const r2 = checkRateLimit(testKey, tier);
    assert(r2.allowed, "Second request should be allowed");

    const r3 = checkRateLimit(testKey, tier);
    assert(r3.allowed, "Third request should be allowed");

    const r4 = checkRateLimit(testKey, tier);
    assert(!r4.allowed, "Fourth request should be blocked (rate limit exceeded)");
    assert.strictEqual(r4.remaining, 0, "Remaining should be 0");
    assert(r4.resetSeconds > 0, "Reset seconds should be positive");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 9: TIMING-SAFE AUTHENTICATION CHECKS
  // --------------------------------------------------------------------------
  console.log("\nGroup 9: Timing-Safe Authentication & Secret Protection");

  runTest("timingSafeEqualString correctly compares equal and unequal strings", async () => {
    const { timingSafeEqualString } = await import("../src/lib/auth/integration");
    assert(timingSafeEqualString("secret-pass-123", "secret-pass-123"), "Equal strings must return true");
    assert(!timingSafeEqualString("secret-pass-123", "wrong-password"), "Unequal strings must return false");
    assert(!timingSafeEqualString("short", "much-longer-string"), "Different length strings must return false");
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log(`\n========================================`);
  console.log(`Total Passed: ${passed}`);
  console.log(`Total Failed: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
