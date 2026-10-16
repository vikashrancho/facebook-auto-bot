# ChatGPT–Facebook Integration: Security Fixes Implementation Report

**Date:** 2026-10-16  
**Status:** Completed & Locally Verified (No Live Facebook Calls, No Production Deployments)

This report details the implementation and verification of the three outstanding security and concurrency fixes identified during the technical security review for the ChatGPT–Facebook integration.

---

## 1. Summary of Changes

### Problem 1: Client-Supplied Boolean Approval Bypass
- **Vulnerability:** The previous endpoint trusted `userConfirmed: true` in the JSON request body. A shared Bearer token cannot prove human identity or intentional human consent.
- **Solution:**
  - Configured approval and publish actions in `public/openapi.json` with `"x-openai-isConsequential": true`, prompting OpenAI's native client confirmation dialog before executing the action.
  - Added `reviewUrl` (`/dashboard/queue?post={id}`) in staging responses to enable direct human review and verification in the session-authenticated dashboard (`pab_session`).
  - Rewrote the Custom GPT instructions to mandate a conversational halt after post staging, displaying full preview and caption, and requiring a separate user turn with explicit confirmation before calling the approval action.
  - Kept HMAC-SHA256 content signature verification bound to `postId`, `title`, `description`, `hashtags`, `imageUrl`, and `pageId`.

### Problem 2: Ephemeral In-Memory State Across Serverless Instances
- **Vulnerability:** `approvalRegistry` and `creationLocks` relied on process-local Node.js `Map` structures, which fail across multiple serverless instances.
- **Solution:**
  - Designed and authored the database migration `supabase/migrations/20261016_chatgpt_approval_and_idempotency.sql` creating the `approval_tokens` table and a partial unique index `posts_chatgpt_idempotency_idx` on `posts(topic)`.
  - Implemented atomic conditional consumption in `src/lib/auth/integration.ts`:
    ```sql
    UPDATE approval_tokens
    SET used_at = now()
    WHERE nonce = $1
      AND post_id = $2
      AND content_hash = $3
      AND expires_at > now()
      AND used_at IS NULL
    RETURNING nonce;
    ```
  - Added conflict handling in `src/app/api/[...path]/route.ts` to catch database duplicate key exceptions (`23505`) on concurrent post creation, safely returning the existing post with HTTP 200.

### Problem 3: Dry-Run Approval Token Invalidation
- **Vulnerability:** The previous publish route consumed the approval token before checking `dryRun: true`, invalidating the token for the subsequent genuine publish request.
- **Solution:**
  - Enhanced `verifyAndConsumeApprovalToken` to accept an `options` argument: `{ consume: boolean }`.
  - In `src/app/api/[...path]/route.ts`, publication route passes `{ consume: !parsed.data.dryRun }`.
  - Dry-run verifies cryptographic signature, post ID, content hash, expiration, and unconsumed status without marking `used_at`.
  - Live publishing atomically marks `used_at` immediately before the live publishing attempt.
  - Concurrent real publishing requests compete on the atomic update; exactly one succeeds and the other is rejected.

---

## 2. Files Changed

| File | Status | Description |
| :--- | :--- | :--- |
| `supabase/migrations/20261016_chatgpt_approval_and_idempotency.sql` | Created | Standalone SQL migration defining `approval_tokens` table, indices on `post_id` and `expires_at`, and partial unique index `posts_chatgpt_idempotency_idx`. *(Not executed against production)* |
| `src/lib/auth/integration.ts` | Modified | • Upgraded `issueApprovalToken` to write to `approval_tokens` table with memory fallback.<br>• Enhanced `verifyAndConsumeApprovalToken` with `{ consume: !dryRun }` conditional execution.<br>• Implemented atomic database update with error diagnostics. |
| `src/app/api/[...path]/route.ts` | Modified | • Added `reviewUrl` (`/dashboard/queue?post={id}`) to staging responses.<br>• Made `issueApprovalToken` call asynchronous (`await`).<br>• Passed `{ consume: !parsed.data.dryRun }` into `verifyAndConsumeApprovalToken`.<br>• Handled unique constraint conflicts gracefully on concurrent post creation. |
| `public/openapi.json` | Modified | • Added `"x-openai-isConsequential": true` to `/api/chatgpt/posts/{id}/approve` and `/api/chatgpt/posts/{id}/publish`.<br>• Added `reviewUrl` to `CreatePostResponse` and `ApprovePostResponse` schemas.<br>• Documented conversational human turn requirements in descriptions. |
| `scripts/test-integration.ts` | Modified | • Added `await` to token issuance and verification calls.<br>• Added 6-step regression test covering: stage -> approve -> dry-run (valid & unconsumed) -> concurrent live publish (atomic claim, exactly 1 succeeds, publisher mock called once) -> reuse rejected.<br>• Added schema validations for consequential flags and review URLs. |

---

## 3. Migration SQL (Created, Not Executed)

**File:** `supabase/migrations/20261016_chatgpt_approval_and_idempotency.sql`

```sql
-- Migration: 20261016_chatgpt_approval_and_idempotency.sql
-- Description: Adds shared persistence for ChatGPT single-use approval tokens
-- and enforces database-level idempotency key uniqueness for staged posts.
--
-- DO NOT EXECUTE AUTOMATICALLY AGAINST PRODUCTION.
-- Review and run manually in Supabase Dashboard > SQL Editor when upgrading.

create extension if not exists "pgcrypto";

-- Table: approval_tokens
-- Shared serverless storage for short-lived, single-use approval tokens.
-- Allows atomic verification and consumption across multiple Vercel instances.
create table if not exists approval_tokens (
  nonce uuid primary key,
  post_id uuid not null references posts(id) on delete cascade,
  content_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Index for fast post lookup and token verification
create index if not exists approval_tokens_post_id_idx on approval_tokens(post_id);

-- Index for periodic cleanup of expired tokens
create index if not exists approval_tokens_expires_at_idx on approval_tokens(expires_at);

-- Idempotency Index
-- Guarantees cross-instance concurrency uniqueness for client-supplied idempotency keys.
create unique index if not exists posts_chatgpt_idempotency_idx on posts (topic) where topic like 'chatgpt:%';
```

---

## 4. Updated Custom GPT Instructions

Use these instructions in the OpenAI Custom GPT configuration:

```markdown
# Role & Purpose
You are the Facebook Auto Bot Assistant. Your job is to help the user create, stage, review, and publish photo posts to their connected Facebook Page through the application's API.

# CRITICAL SECURITY RULES & BOUNDARIES
1. SHARED SECRET BOUNDARY:
   The Bearer API key authenticates API access; it does NOT represent human consent. You must never simulate, assume, or fabricate user approval.

2. CONVERSATIONAL HALT BEFORE APPROVAL:
   - When you create/stage a post with `POST /api/chatgpt/posts`, you MUST STOP and wait.
   - Display the complete post preview to the human user in chat:
     * Full Caption and Title
     * All Hashtags
     * Target Facebook Page Name
     * Inline Image Preview (render the markdown image from the returned `imageUrl`)
     * Direct Dashboard Review Link: `[Review in Dashboard]({reviewUrl})`
   - Ask explicitly: "Do you approve publishing this post to Facebook?"
   - DO NOT call `POST /api/chatgpt/posts/{id}/approve` in the same turn that stages the post.

3. SEPARATE USER TURN REQUIREMENT:
   - You may ONLY call `POST /api/chatgpt/posts/{id}/approve` after the user replies with a clear, affirmative confirmation (such as "Yes", "Approved", "Go ahead", or "Publish it") in a subsequent conversational turn.
   - If the user requests edits to the caption or image, DO NOT approve. Update the content, re-stage the post, obtain a new `contentHash`, and ask for confirmation again.

4. ACTION EXECUTION ORDER:
   - Step 1: `POST /api/chatgpt/posts` (Stage post; returns `postId`, `contentHash`, `reviewUrl`).
   - Step 2: STOP. Present preview to user and prompt for approval.
   - Step 3: Wait for affirmative user response in separate turn.
   - Step 4: `POST /api/chatgpt/posts/{id}/approve` with `userConfirmed: true` and `contentHash`.
   - Step 5: `POST /api/chatgpt/posts/{id}/publish` with the returned `approvalToken`.
     * If user asked for a preview test or simulation, pass `dryRun: true`.
     * Note: A dry-run does NOT consume the approval token; you can still publish live afterwards with the same token before its 10-minute expiry.
```

---

## 5. Test Results and Build Output

### A. Safe Integration Test Suite (40/40 Passing)

**Command:**
```bash
cmd /c npx tsx scripts/test-integration.ts
```

**Output:**
```text
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
  PASS: verifyAndConsumeApprovalToken supports dry-run without consuming token

Suite 4: Completely Non-Destructive Dry-Run Mode
  PASS: Dry-run does not modify post in database (status remains draft, facebook_post_id is null)
  PASS: Dry-run does not prevent later genuine live publication
  PASS: Regression: Stage -> Approve -> Dry-run (valid & unconsumed) -> Concurrent live publish -> Exactly 1 succeeds, token consumed

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
  PASS: OpenAPI schema configures approve and publish actions as consequential (x-openai-isConsequential: true)
  PASS: public/openapi.json does not expose admin or delete endpoints

=======================================================
 Test Results: 40/40 Passed (100%)
=======================================================
```

### B. Production Build Output

**Command:**
```bash
cmd /c npm run build
```

**Output:**
```text
> pinterest-auto-bot@0.1.0 build
> next build

▲ Next.js 16.3.4 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 57ms
✓ Compiled successfully in 3.5s
  Running TypeScript ...
  Finished TypeScript in 7.9s ...
  Collecting page data using 3 workers ...
✓ Generating static pages using 3 workers (13/13) in 975ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/[...path]
├ ƒ /dashboard
├ ○ /dashboard/generate
├ ○ /dashboard/history
├ ○ /dashboard/pages
├ ○ /dashboard/queue
├ ○ /dashboard/settings
├ ○ /dashboard/system-prompt
├ ○ /dashboard/templates
├ ○ /dashboard/topics
└ ○ /login

ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

---

## 6. How Cross-Instance Concurrency is Guaranteed

In-memory primitives (`Map`, `Promise`) only serialize concurrency inside a single Node.js runtime process. In serverless environments (e.g. Vercel), separate instances share zero memory. Cross-instance safety is achieved at the database engine level:

1. **Atomic Token Consumption:**
   The update statement:
   ```sql
   UPDATE approval_tokens
   SET used_at = now()
   WHERE nonce = $1
     AND post_id = $2
     AND content_hash = $3
     AND expires_at > now()
     AND used_at IS NULL
   RETURNING nonce;
   ```
   PostgreSQL executes this row-level update under an exclusive row lock (`FOR UPDATE`). When two instances race to publish using the same token simultaneously, PostgreSQL commits the first transaction and updates `used_at`. The second transaction evaluates `WHERE used_at IS NULL`, updates 0 rows, and fails immediately.

2. **Creation Idempotency:**
   The unique index:
   ```sql
   CREATE UNIQUE INDEX posts_chatgpt_idempotency_idx ON posts (topic) WHERE topic LIKE 'chatgpt:%';
   ```
   Guarantees that two concurrent post creation requests on separate serverless instances cannot insert duplicate posts. If both race past the initial select, PostgreSQL forces the second insert to fail with error `23505` (`unique_violation`), which the application catches to query and return the first post record.

---

## 7. Remaining Risks & Pre-Deployment Checklist

1. **Execute Migration SQL in Production Supabase:**
   - Run `supabase/migrations/20261016_chatgpt_approval_and_idempotency.sql` in the Supabase Dashboard SQL Editor before opening the API to production traffic.
2. **Configure Custom GPT in OpenAI:**
   - Update Custom GPT action schema by importing `public/openapi.json`.
   - Configure Authentication as `API Key` -> `Bearer` with your secret `INTEGRATION_API_KEY`.
   - Update Custom GPT Instructions using Section 4 of this report.
3. **Live Facebook Verification:**
   - In keeping with test constraints, no live Facebook Graph API calls were made. After deployment, perform a manual single-post test to verify live Meta token permissions.
