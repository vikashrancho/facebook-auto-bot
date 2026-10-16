# Read-Only Security Review: ChatGPT–Facebook Integration Fixes

This security evaluation investigates the three requested issues directly against the current source code.

---

## 1. Approval Authenticity

### Source Code Location & Excerpt
**File:** `src/app/api/[...path]/route.ts` (Lines 740–756)
```typescript
if (path.length === 4 && path[0] === "chatgpt" && path[1] === "posts" && path[3] === "approve") {
  const id = path[2];
  const post = await getPost(id);
  if (!post) return notFound();

  if (post.status === "posted") {
    return json({ error: "Post has already been published to Facebook." }, 400);
  }

  const parsed = ApproveChatGPTPostBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !parsed.data.userConfirmed) {
    return json(
      { error: "Explicit user confirmation (userConfirmed: true) is required to approve the post." },
      400
    );
  }
```

### Analysis & Technical Conclusion

1. **Does checking `userConfirmed: true` genuinely enforce human approval?**
   * **No.** Checking `userConfirmed: true` does **not** prove that a human user was involved.
   * From the server's perspective, this is a Machine-to-Machine (M2M) API endpoint protected solely by the Bearer API key (`INTEGRATION_API_KEY`). Any HTTP client that possesses this key (an automated script, a curl command, or an unconstrained LLM agent) can pass `{"userConfirmed": true, "contentHash": "..."}` in the JSON body.
   * The server is strictly **trusting the API caller** when the caller asserts `userConfirmed: true`.

2. **What does the server actually enforce?**
   * The server enforces **cryptographic payload integrity and binding** (lines 763–780): it guarantees that approval is strictly tied to the exact title hook, description, hashtags, image URL, and destination Facebook Page, and that none of those fields can be altered between approval and publication.
   * However, the server **cannot independently verify human presence or user intent**.

3. **How Custom GPT must enforce human confirmation before calling this endpoint:**
   * **System Prompt Contract (Conversational Halt):** The Custom GPT instructions must mandate a two-phase interaction:
     * *Phase 1:* The model calls `POST /api/chatgpt/posts` to stage the post, receives the `contentHash`, renders the preview to the user in chat, and **must stop generating**.
     * *Phase 2:* The model is explicitly forbidden from calling `POST /api/chatgpt/posts/{id}/approve` autonomously. It must require an explicit, unambiguous confirmation message from the human user (e.g., *"Yes, approve and post"*). Only after receiving that affirmative user turn may the model invoke `/approve`.
   * **OpenAPI Consequential Flag (`x-openai-isConsequential: true`):**
     * In OpenAPI schemas for Custom GPTs, setting `x-openai-isConsequential: true` on `/approve` causes ChatGPT's web UI to trigger an interactive client-side confirmation modal (*"Allow action to approve post?"*) before sending the HTTP request.

### Unresolved Risks
* If an LLM hallucinates, misinterprets ambiguity, or is prompt-injected, it can call `/approve` with `userConfirmed: true` without actual human consent.
* True human authentication on the server side would require an interactive human session (e.g., an OAuth flow or an admin dashboard confirmation link) rather than a pure M2M API call.

---

## 2. Distributed Approval Storage

### Source Code Location & Excerpt
**File:** `src/lib/auth/integration.ts` (Lines 84–85)
```typescript
// In-memory registry of server-issued approval tokens for single-use verification
const approvalRegistry = new Map<string, ApprovalRecord>();
```

**File:** `src/app/api/[...path]/route.ts` (Lines 370–371)
```typescript
// In-flight concurrency lock to serialize concurrent creation requests using the same idempotency key
const creationLocks = new Map<string, Promise<{ body: unknown; status: number }>>();
```

### Analysis & Multi-Instance Behavior

1. **How `approvalRegistry` and `creationLocks` behave across multiple Vercel serverless instances:**
   * Both `approvalRegistry` and `creationLocks` are Node.js in-memory `Map` objects stored in the private heap of a single Node process.
   * In a serverless environment like Vercel, requests are distributed across multiple isolated Lambda/container instances. These instances:
     1. **Do not share memory.**
     2. **Scale up and down independently.**
     3. **Are ephemeral and can be frozen or terminated at any moment.**
   * **Failure Scenario (False Rejections):** If a user approves a post via `POST /api/chatgpt/posts/{id}/approve` on Instance A, Instance A saves the nonce in its local `approvalRegistry`. When ChatGPT calls `POST /api/chatgpt/posts/{id}/publish`, if Vercel routes that request to Instance B, Instance B's `approvalRegistry` will be completely empty. Line 214 of `src/lib/auth/integration.ts` will fail:
     ```typescript
     const record = approvalRegistry.get(payload.nonce);
     if (!record) {
       return { valid: false, reason: "Approval record not found on server or has expired from registry." };
     }
     ```
     The publish request will be rejected with HTTP 403, even though the token was legitimately generated.
   * **Failure Scenario (Replay / Concurrent Race):** Two concurrent publishing requests routed to Instance A and Instance B will each check their local in-memory lock/registry, bypassing the in-memory single-use guard. (The database-level conditional lock in `publishPostNow()` mitigates double-posting, but the token itself will not be recognized as consumed across containers).

### Minimum Safe Shared-Storage & Atomic-Consumption Design

To make approval issuance, expiration, and single-use consumption reliable across multiple serverless instances without external services, use the existing Supabase PostgreSQL database:

1. **Database Schema (Dedicated Table or Column):**
   Add an `approval_tokens` table in Supabase:
   ```sql
   create table if not exists approval_tokens (
     nonce uuid primary key,
     post_id uuid not null references posts(id) on delete cascade,
     content_hash text not null,
     expires_at timestamptz not null,
     used_at timestamptz,
     created_at timestamptz not null default now()
   );
   create index if not exists approval_tokens_post_idx on approval_tokens(post_id);
   ```

2. **Atomic Single-Use Consumption SQL:**
   Rather than reading and then writing, consumption must be executed in a single atomic SQL statement with conditional row-locking:
   ```sql
   update approval_tokens
   set used_at = now()
   where nonce = $1
     and post_id = $2
     and content_hash = $3
     and expires_at > now()
     and used_at is null
   returning nonce;
   ```
   * If `rows_affected === 1`: The token was valid, unexpired, and has now been atomically consumed. No other instance can consume it.
   * If `rows_affected === 0`: The token was either non-existent, expired, or already consumed. Reject with HTTP 403.

### Unresolved Risks
* Until shared database persistence is applied, multi-container deployments on Vercel will experience intermittent HTTP 403 errors on `/publish` due to instance isolation.

---

## 3. Dry-Run Followed by Live Publication

### Source Code Location & Excerpt
**File:** `src/app/api/[...path]/route.ts` (Lines 853–885)
```typescript
const approvalCheck = verifyAndConsumeApprovalToken(
  parsed.data.approvalToken,
  post.id,
  currentHash
);

if (!approvalCheck.valid) {
  return json(
    {
      error:
        approvalCheck.reason ||
        "Invalid, expired, reused, or unapproved token. Explicit user approval is required to publish.",
    },
    403
  );
}

try {
  const published = await publishPostNow(post.id, {
    dryRun: parsed.data.dryRun,
    forceRetry: parsed.data.forceRetry,
  });

  // Completely non-destructive dry-run: return simulation metadata without DB changes
  if (parsed.data.dryRun) {
    return json({
      success: true,
      simulated: true,
      postId: post.id,
      status: post.status, // Still in draft
      simulatedFacebookPostId: published.simulatedFacebookPostId,
      simulatedFacebookPostUrl: published.simulatedFacebookPostUrl,
      message:
        "Dry-run simulation succeeded. The post remains in draft state, database was not modified, and no Facebook Graph API calls were made.",
    });
  }
```

**File:** `src/lib/auth/integration.ts` (Lines 221–230)
```typescript
if (record.usedAt !== null) {
  return {
    valid: false,
    reason: "Approval token has already been used. Approvals are strictly single-use.",
  };
}

// Atomically consume token
record.usedAt = Date.now();
return { valid: true };
```

### Trace Analysis & Technical Conclusion

1. **Trace of Execution Order:**
   * When `POST /api/chatgpt/posts/{id}/publish` is called with `{"approvalToken": "...", "dryRun": true}`:
     * Line 853 calls `verifyAndConsumeApprovalToken()`.
     * Inside `verifyAndConsumeApprovalToken()`, line 229 sets `record.usedAt = Date.now()`.
     * **The token is marked as consumed immediately.**
     * Next, line 871 invokes `publishPostNow(..., { dryRun: true })`, which returns simulated metadata without modifying the database post record.
     * Line 878 returns HTTP 200 with `simulated: true`.
   * When the caller subsequently calls `POST /api/chatgpt/posts/{id}/publish` with the **same** `approvalToken` and `{"dryRun": false}` to publish for real:
     * Line 853 calls `verifyAndConsumeApprovalToken()` again.
     * Line 221 detects that `record.usedAt !== null`.
     * **Line 223 returns `{ valid: false, reason: "Approval token has already been used. Approvals are strictly single-use." }`.**
     * Line 860 immediately returns **HTTP 403 Forbidden**.

2. **Conclusion:**
   * **A dry-run consumes the approval token and prevents later genuine publication with that same token.**
   * While the database post record remains in `status: "draft"`, the `approvalToken` is permanently invalidated upon the dry-run call.
   * To publish for real after a dry-run, the user/client must call `POST /api/chatgpt/posts/{id}/approve` a second time to mint a fresh token, or the publish route must differentiate between *validating* a token for dry-run versus *consuming* it for live publication.

### Safe Test Description for This Sequence (Mocks Only, Zero Live Calls)

A safe unit/integration test can execute this exact sequence in memory without live network calls:

```typescript
test("dry-run followed by live publication sequence behavior", async () => {
  resetApprovalRegistry();

  const samplePost = {
    postId: "post-uuid-test",
    title: "Test Hook",
    description: "Test Desc",
    hashtags: ["test"],
    imageUrl: "https://xyz.supabase.co/img.png",
    pageId: "page-123",
  };
  const hash = computePostContentHash(samplePost);

  // 1. Issue an approval token
  const { token } = issueApprovalToken({
    postId: samplePost.postId,
    contentHash: hash,
    ttlSeconds: 600,
  });

  // 2. Simulate Step 1: Dry-Run Publication
  // verifyAndConsumeApprovalToken consumes the token here
  const dryRunCheck = verifyAndConsumeApprovalToken(token, samplePost.postId, hash);
  assert.strictEqual(dryRunCheck.valid, true, "Dry-run token verification must succeed");

  // 3. Simulate Step 2: Attempting Genuine Publication with the SAME token
  const livePublishCheck = verifyAndConsumeApprovalToken(token, samplePost.postId, hash);

  // In the current implementation, this asserts FALSE because the token was consumed in step 2:
  assert.strictEqual(
    livePublishCheck.valid,
    false,
    "Current implementation consumes the token on dry-run, blocking immediate live publication"
  );
  assert.ok(livePublishCheck.reason?.includes("already been used"));
});
```

### Unresolved Risks
* If ChatGPT or a client issues a dry-run to test connectivity prior to publication, the subsequent live publication request will fail with an HTTP 403 error unless the workflow specifically accounts for re-requesting approval (`/approve`) between the dry-run and live publish steps, or unless the route avoids consuming the token when `dryRun: true`.

---

## Summary Matrix

| Issue | Current Verified Behavior in Code | Architectural Risk |
| :--- | :--- | :--- |
| **1. Approval Authenticity** | Server trusts `userConfirmed: true` from the Bearer caller. Server guarantees cryptographic content binding, but cannot prove human presence. | Unconstrained LLMs or external scripts with the API key can bypass human review unless Custom GPT instructions and UI prompts strictly enforce it. |
| **2. Distributed Storage** | `approvalRegistry` and `creationLocks` reside in Node process memory (`Map`). | Multiple serverless instances do not share memory; cross-container publish requests will be rejected with HTTP 403 until backed by shared storage (e.g. Supabase DB). |
| **3. Dry-Run Token Consumption** | `verifyAndConsumeApprovalToken()` is called before checking `dryRun`, setting `record.usedAt`. | Calling `/publish` with `dryRun: true` invalidates the token; a second call to publish for real with that same token fails with HTTP 403. |
