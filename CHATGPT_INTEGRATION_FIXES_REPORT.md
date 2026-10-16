# Deliverables: ChatGPT–Facebook Integration Fixes Report

All four critical issues have been resolved strictly in the local development environment. No live Facebook Graph API calls were dispatched, no live Facebook posts were created, and no production data was altered.

---

## 1. List of Files Changed and Why

| File | Why Changed |
| :--- | :--- |
| `src/lib/auth/integration.ts` | Implemented server-enforced, short-lived (10-min), single-use approval issuance (`issueApprovalToken`) and atomic consumption (`verifyAndConsumeApprovalToken`). Staging signatures are prevented from authorizing publications. |
| `src/lib/facebook/publish.ts` | Made `dryRun` completely non-destructive (database post remains untouched in `draft`, fake Facebook IDs are never saved to the DB, external publisher is called 0 times); classified network/timeouts as `[UNCERTAIN_OUTCOME]`; blocked automatic blind retries without explicit `forceRetry=true`. |
| `src/app/api/[...path]/route.ts` | (1) Added in-flight concurrency locks on `idempotencyKey`; (2) Staging endpoint `POST /api/chatgpt/posts` no longer returns approval tokens; (3) Added dedicated `POST /api/chatgpt/posts/{id}/approve` requiring `userConfirmed: true` and content hash matching; (4) Updated `POST /api/chatgpt/posts/{id}/publish` to consume single-use approval tokens and return non-destructive simulation metadata on dry-run. |
| `supabase/schema.sql` | Added `create unique index if not exists posts_chatgpt_idempotency_idx on posts (topic) where topic like 'chatgpt:%';` to define concurrency-safe idempotency at the database level. |
| `public/openapi.json` | Added `POST /api/chatgpt/posts/{id}/approve`; updated `POST /api/chatgpt/posts` and `POST /api/chatgpt/posts/{id}/publish` schemas; labeled the server URL with an explicit placeholder (`https://YOUR_DEPLOYED_DOMAIN.vercel.app`). |
| `scripts/test-integration.ts` | Added automated test suites for unapproved, expired, reused, and content-modified approval attempts; non-destructive dry-runs; concurrent creation; concurrent publishing; and uncertain timeout recovery (37/37 tests passing). |
| `CHATGPT_REVIEW_PACKAGE.md` | Synchronized the complete review document and OpenAPI 3.1.0 schema with the updated endpoints. |

---

## 2. Summary of Implementation Changes

### 1. Server-Enforced Explicit Approval
- **Staging (`POST /api/chatgpt/posts`):** Accepts copy and image URL, re-hosts image in Supabase Storage, and stages post record in `status: "draft"`. Computes deterministic SHA-256 `contentHash` across caption, hashtags, image URL, and destination Page. **Does NOT issue an approval token.**
- **Explicit Approval (`POST /api/chatgpt/posts/{id}/approve`):** Required before publishing. Validates `userConfirmed === true` and verifies that the provided `contentHash` matches the current staged post. Mints a short-lived (10-minute) single-use cryptographic approval token backed by a server-side registry.
- **Publishing (`POST /api/chatgpt/posts/{id}/publish`):** Requires `approvalToken`. Validates HMAC signature, checks 10-minute expiration, verifies content hash integrity, and atomically marks the token nonce as consumed. Unapproved staging tokens, expired tokens, or reused tokens are rejected with HTTP 403 Forbidden.

### 2. Completely Non-Destructive Dry-Run
- In `publishPostNow()`, when `options.dryRun === true`:
  - Validates prerequisites (Facebook Page configured, Page access token available, image URL present, message composable).
  - Immediately returns simulation metadata (`simulated: true`, `simulatedFacebookPostId`, `simulatedFacebookPostUrl`).
  - **Does NOT claim or update the database record:** `status` remains `"draft"`, `facebook_post_id` remains `null`.
  - **Does NOT invoke `publishPhoto()` or any Facebook API** (0 calls).
  - Does not obstruct later genuine live publishing.

### 3. Strengthened Duplicate Prevention and Recovery
- **Concurrent Creation:** Protected by an in-flight Promise mutex map (`creationLocks`) on `idempotencyKey` so concurrent requests join the same execution, plus a unique index on `posts (topic) where topic like 'chatgpt:%'` in `supabase/schema.sql`.
- **Concurrent Publishing:** Protected by an atomic conditional database claim `update({ status: "publishing" }).neq("status", "publishing").neq("status", "posted")`. A second concurrent request fails the claim and aborts with a concurrency error without calling Meta Graph API.
- **Already-Published Posts:** Instant return if `post.status === "posted"` without invoking publisher.
- **Uncertain Outcomes & Timeouts:** Network errors and timeouts classify the post with `[UNCERTAIN_OUTCOME]`. Automatic blind retries are blocked with HTTP 409 to prevent duplicate posts if Facebook actually published the photo. Retries require manual Facebook inspection and explicit `forceRetry: true`.

### 4. OpenAPI Placeholder & Schema Alignment
- Kept the OpenAPI server URL as a placeholder: `https://YOUR_DEPLOYED_DOMAIN.vercel.app` with description clearly marked as a placeholder until actual deployment domain is assigned.
- Added `POST /api/chatgpt/posts/{id}/approve` operation and schema models.
- Updated `CreatePostResponse` and `PublishPostResponse` schemas to match actual runtime behavior.

---

## 3. Test Results (Including Failures Encountered & Fixed)

### Test Execution Command
```bash
cmd /c npx tsx scripts/test-integration.ts
```

### Initial Run Failure & Resolution
During the first test execution of Suite 5, one test failed:
* **Failure:** `Uncertain publication timeout marks [UNCERTAIN_OUTCOME] and blocks automatic retry without forceRetry`
* **Root Cause:** Error message regex in `publishPostNow()` checked `/timeout/i`, but mock error threw `"Facebook request timed out after 30s"` ("timed out" with a space did not match "timeout").
* **Fix Applied:** Updated the regex in both `src/lib/facebook/publish.ts` and the test harness to `/timeout|timed out|aborted|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|504|502/i`.

### Final Test Suite Results: 37/37 Passed (100%)
```
=======================================================
 Running Safe Verification Test Suite (No Live Publishing)
=======================================================

Suite 1: Machine-to-Machine Integration Authentication
  PASS: timingSafeEqualString handles identical strings
  PASS: timingSafeEqualString rejects different strings of same length
  PASS: timingSafeEqualString rejects strings of different lengths
  PASS: validateIntegrationAuth rejects missing Authorization header
  PASS: validateIntegrationAuth rejects invalid Bearer token
  PASS: validateIntegrationAuth accepts valid Bearer token
  PASS: validateIntegrationAuth rejects dashboard session cookie
  PASS: validateIntegrationAuth fails closed if INTEGRATION_API_KEY is not set

Suite 2: SSRF & Remote Image Security
  PASS: isRestrictedIp detects IPv4 loopback (127.0.0.1)
  PASS: isRestrictedIp detects cloud metadata endpoint (169.254.169.254)
  PASS: isRestrictedIp detects private RFC1918 subnets (10.x, 172.16.x, 192.168.x)
  PASS: isRestrictedIp detects IPv6 loopback and private ranges
  PASS: isRestrictedIp allows valid public IPv4 addresses
  PASS: detectImageSignature identifies authentic JPEG
  PASS: detectImageSignature identifies authentic PNG
  PASS: detectImageSignature identifies authentic WebP
  PASS: detectImageSignature rejects HTML/script disguised as image
  PASS: detectImageSignature rejects truncated/empty buffer

Suite 3: Server-Enforced Explicit Approval Workflow
  PASS: computePostContentHash produces deterministic SHA-256 hash
  PASS: computePostContentHash changes if any content field is modified
  PASS: verifyAndConsumeApprovalToken rejects unapproved publication attempt (staging token without approval)
  PASS: verifyAndConsumeApprovalToken succeeds and consumes valid approval on untampered post
  PASS: verifyAndConsumeApprovalToken rejects reused approval token (single-use enforcement)
  PASS: verifyAndConsumeApprovalToken rejects expired approval token
  PASS: verifyAndConsumeApprovalToken rejects content-modified approval attempt
  PASS: verifyAndConsumeApprovalToken rejects forged or tampered signatures

Suite 4: Completely Non-Destructive Dry-Run Mode
  PASS: Dry-run does not modify post in database (status remains draft, facebook_post_id is null)
  PASS: Dry-run does not prevent later genuine live publication

Suite 5: Strengthened Duplicate Prevention & Recovery
  PASS: Concurrent post creation with same idempotency key returns identical post and creates only 1 record
  PASS: Concurrent publishing requests cannot create two Facebook posts (atomic claim prevents race)
  PASS: Already-published post returns immediately without calling Facebook publisher
  PASS: Uncertain publication timeout marks [UNCERTAIN_OUTCOME] and blocks automatic retry without forceRetry

Suite 6: OpenAPI 3.1.0 Schema Validation
  PASS: public/openapi.json exists and is valid OpenAPI 3.1.0
  PASS: public/openapi.json server URL is clearly marked as a placeholder
  PASS: POST /api/chatgpt/posts does not return approvalToken, returns contentHash
  PASS: POST /api/chatgpt/posts/{id}/approve schema requires userConfirmed and contentHash
  PASS: public/openapi.json does not expose admin or delete endpoints

=======================================================
 Test Results: 37/37 Passed (100%)
=======================================================
```

### Production Build Validation
```bash
cmd /c npm run build
```
Turbopack compiled all static and dynamic routes (`/api/[...path]`, `/dashboard/*`) with **exit code 0** and zero TypeScript compilation errors.

---

## 4. Relevant Code Excerpts

### A. Approval Enforcement & Token Consumption
**File:** `src/lib/auth/integration.ts`
```typescript
export function verifyAndConsumeApprovalToken(
  token: string,
  expectedPostId: string,
  currentContentHash: string
): VerificationResult {
  // 1. Structural & HMAC signature verification
  const [b64, hmac] = token.split(".");
  const secret = env.integrationApiKeyOptional || env.sessionSecret;
  const expectedHmac = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
  if (!timingSafeEqualString(hmac, expectedHmac)) {
    return { valid: false, reason: "Forged or invalid cryptographic signature." };
  }

  const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf-8"));

  // 2. Reject staging tokens
  if (payload.type !== "user_approval") {
    return { valid: false, reason: "Token is not a user approval token. Staging signatures cannot authorize publication." };
  }

  // 3. Post ID & Content Integrity Check
  if (payload.postId !== expectedPostId) {
    return { valid: false, reason: "Approval token does not match the requested post ID." };
  }
  if (payload.contentHash !== currentContentHash) {
    return { valid: false, reason: "Post content has been modified since approval was granted. Please re-review and approve again." };
  }

  // 4. Expiration Check
  if (Date.now() > payload.expiresAt) {
    return { valid: false, reason: "Approval token has expired. Approvals are short-lived. Please approve again." };
  }

  // 5. Single-Use Nonce Check & Atomic Consumption
  const record = approvalRegistry.get(payload.nonce);
  if (!record) {
    return { valid: false, reason: "Approval record not found on server or has expired from registry." };
  }
  if (record.usedAt !== null) {
    return { valid: false, reason: "Approval token has already been used. Approvals are strictly single-use." };
  }

  record.usedAt = Date.now();
  return { valid: true };
}
```

### B. Non-Destructive Dry-Run & Uncertain Timeout Guard
**File:** `src/lib/facebook/publish.ts`
```typescript
  // Block automatic blind retries on posts with uncertain publication outcomes
  if (post.status === "failed" && post.error_message?.includes("[UNCERTAIN_OUTCOME]")) {
    if (!options.forceRetry) {
      throw new Error(
        "This post previously encountered an uncertain timeout. The photo may already have been published to your Facebook Page. " +
        "Automatic retry is blocked to prevent duplicate posts. Please verify your Facebook Page. " +
        "If confirmed not published, supply forceRetry=true to proceed."
      );
    }
  }

  // COMPLETELY NON-DESTRUCTIVE DRY-RUN:
  // Validate prerequisites and return simulation result without modifying DB or calling publisher
  if (options.dryRun) {
    return {
      ...post,
      simulated: true,
      simulatedFacebookPostId: `simulated_dryrun_${postId}`,
      simulatedFacebookPostUrl: `https://facebook.com/simulated_dryrun_${postId}`,
    };
  }

  // Catch block classifying uncertain network timeouts:
  const isTimeoutOrNetwork =
    /timeout|timed out|aborted|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|504|502/i.test(errorMessage) ||
    (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError"));

  if (isTimeoutOrNetwork) {
    errorMessage =
      "[UNCERTAIN_OUTCOME] Facebook publishing request timed out or network connection was lost. " +
      "The post may have already been accepted and published by Facebook. " +
      "Automatic retries are blocked to prevent duplicate posts. Please verify your Facebook Page before retrying.";
  }
```

### C. Concurrency Deduplication in Route Handler
**File:** `src/app/api/[...path]/route.ts`
```typescript
const creationLocks = new Map<string, Promise<{ body: unknown; status: number }>>();

// Inside POST /api/chatgpt/posts:
if (b.idempotencyKey) {
  const existingPromise = creationLocks.get(b.idempotencyKey);
  if (existingPromise) {
    const res = await existingPromise;
    return json(res.body, res.status);
  }
}
```

---

## 5. Remaining Risks and Safe Step-by-Step Local Verification Procedure

> [!WARNING]
> While all local unit and structural integration tests pass (37/37), this does not mean the application is production-ready. The following residual risks remain until verified against a real staging environment.

### Residual Risks
1. **Multi-Instance Serverless In-Memory State:** Single-use nonces and in-flight mutex locks currently operate in process memory. If deployed across multiple concurrent Vercel serverless containers, two concurrent requests routed to different lambdas will rely on database-level locks. Applying the index in `supabase/schema.sql` is necessary for multi-container uniqueness.
2. **Facebook Photo Publishing Rate Limits & Crawler Access:** When `publishPhoto` is called, Facebook's crawler fetches the image from Supabase Storage. Storage permissions on bucket `post-images` must remain public.
3. **No Live Facebook Call Executed:** By requirement, live Graph API calls (`/{page-id}/photos`) were not invoked during testing.

### Safe Step-by-Step Local Verification Procedure
To verify the endpoints locally without publishing real content or using live Facebook credentials:

1. **Start Local Server:**
   ```bash
   cmd /c npm run dev
   ```
2. **Verify Health Check:**
   ```bash
   curl -i http://localhost:3000/api/health \
     -H "Authorization: Bearer <YOUR_INTEGRATION_API_KEY>"
   ```
   *Expected:* HTTP 200 with `{"status":"ok","database":"ok","facebookPageConfigured":...}`.
3. **Stage a Post (Verify No Approval Token Issued):**
   ```bash
   curl -i -X POST http://localhost:3000/api/chatgpt/posts \
     -H "Authorization: Bearer <YOUR_INTEGRATION_API_KEY>" \
     -H "Content-Type: application/json" \
     -d "{\"title\":\"Test Hook\",\"description\":\"Test Description?\",\"imageUrl\":\"https://files.oaiusercontent.com/test.png\"}"
   ```
   *Expected:* HTTP 201 with `postId`, `contentHash`, `status: "pending_review"`. Verify `approvalToken` is **not** in the response.
4. **Attempt Publishing Without Approval (Verify Rejection):**
   ```bash
   curl -i -X POST http://localhost:3000/api/chatgpt/posts/<POST_ID>/publish \
     -H "Authorization: Bearer <YOUR_INTEGRATION_API_KEY>" \
     -H "Content-Type: application/json" \
     -d "{\"approvalToken\":\"invalid_or_staging_token\"}"
   ```
   *Expected:* HTTP 403 Forbidden ("Token is not a user approval token").
5. **Request Explicit Approval:**
   ```bash
   curl -i -X POST http://localhost:3000/api/chatgpt/posts/<POST_ID>/approve \
     -H "Authorization: Bearer <YOUR_INTEGRATION_API_KEY>" \
     -H "Content-Type: application/json" \
     -d "{\"userConfirmed\":true,\"contentHash\":\"<CONTENT_HASH_FROM_STEP_3>\"}"
   ```
   *Expected:* HTTP 200 with `approved: true`, `approvalToken`, and `expiresAt` (10-min window).
6. **Execute Safe Non-Destructive Dry-Run:**
   ```bash
   curl -i -X POST http://localhost:3000/api/chatgpt/posts/<POST_ID>/publish \
     -H "Authorization: Bearer <YOUR_INTEGRATION_API_KEY>" \
     -H "Content-Type: application/json" \
     -d "{\"approvalToken\":\"<APPROVAL_TOKEN_FROM_STEP_5>\",\"dryRun\":true}"
   ```
   *Expected:* HTTP 200 with `success: true`, `simulated: true`, `status: "draft"`. Check database to confirm the post record is still in `draft` with `facebook_post_id: null`.
