# Final Read-Only Security Verification Report — ChatGPT–Facebook Integration

**Execution Date:** 2026-10-16  
**Status:** Complete Read-Only Source Code Verification  
**Target Codebase:** `vikashrancho/facebook-auto-bot`  
**Safety Boundaries Maintained:**
- Zero code modifications executed.
- Zero deployments performed.
- Zero Supabase database migrations executed.
- Zero live Meta Graph API calls or live Facebook publications made.
- Existing Facebook Page connection and settings preserved untouched.

---

## 1. Image Approval Invalidation

### Source Code Findings

#### Does `PATCH /api/posts/{id}` invalidate approval when `image_url` changes?
* **No, because `image_url` is not an editable field on `PATCH /api/posts/{id}`.**
* In [`src/app/api/[...path]/route.ts:1047-1056`](file:///c:/Users/Core/Documents/Vibecoding/facebook-auto-bot/src/app/api/%5B...path%5D/route.ts#L1047-L1056), `UpdatePostBody` strictly defines the allowable update fields:
  ```typescript
  const UpdatePostBody = z.object({
    title: z.string().min(1).max(120).optional(),
    description: z.string().min(1).max(500).optional(),
    hashtags: z.array(z.string()).max(15).optional(),
    linkUrl: z.string().url().optional().or(z.literal("")),
    pageId: z.string().min(1).optional(),
    pageName: z.string().min(1).optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
    status: z.enum(["draft", "scheduled"]).optional(),
  });
  ```
  Neither `image_url` nor `imageUrl` is defined in `UpdatePostBody`. Any attempt by an API caller to supply an image URL in the `PATCH` body is stripped by Zod and never passed to the database.
* In [`src/app/api/[...path]/route.ts:1102-1106`](file:///c:/Users/Core/Documents/Vibecoding/facebook-auto-bot/src/app/api/%5B...path%5D/route.ts#L1102-L1106), `contentChanged` checks:
  ```typescript
  const contentChanged =
    (b.title !== undefined && b.title !== existing.title) ||
    (b.description !== undefined && b.description !== existing.description) ||
    (b.hashtags !== undefined && JSON.stringify(b.hashtags) !== JSON.stringify(existing.hashtags)) ||
    (b.pageId !== undefined && b.pageId !== existing.page_id);
  ```
* **Image URL lifecycle:** `image_url` is immutable after creation; it is set strictly at post creation time in `POST /api/posts` (line 431) or `POST /api/chatgpt/posts` (lines 688, 702), prior to any approval being granted.

#### Does approval validation recompute a hash that includes the current image URL and destination Facebook Page ID?
* **Yes.** In [`src/lib/auth/integration.ts:47-70`](file:///c:/Users/Core/Documents/Vibecoding/facebook-auto-bot/src/lib/auth/integration.ts#L47-L70):
  ```typescript
  export function computePostContentHash(input: {
    postId: string;
    title: string;
    description: string;
    hashtags: string[];
    imageUrl: string;
    pageId: string;
  }): string {
    const normTags = (input.hashtags || [])
      .map((t) => t.trim().toLowerCase().replace(/^#/, ""))
      .filter(Boolean)
      .sort()
      .join(",");
    const payload = [
      input.postId.trim(),
      input.title.trim(),
      input.description.trim(),
      normTags,
      input.imageUrl.trim(),
      input.pageId.trim(),
    ].join("|");

    return crypto.createHash("sha256").update(payload).digest("hex");
  }
  ```
* Recomputed at every critical validation gate:
  1. **Dashboard Approval (`route.ts:481-488`):** Computes hash with `post.image_url` and stores it in `post.approval_content_hash`.
  2. **Token Minting (`route.ts:810-817`):** Computes hash with `post.image_url` and verifies `post.approval_content_hash === currentHash` and `parsed.data.contentHash === currentHash`.
  3. **Publishing Dispatch (`route.ts:925-932`):** Computes hash with `post.image_url` and executes single-use consumption against that exact hash.

#### Fields that can change published content without invalidating approval (Identified Security Gap)
1. **`link_url` (`b.linkUrl`):**
   * In [`src/lib/types.ts:125-134`](file:///c:/Users/Core/Documents/Vibecoding/facebook-auto-bot/src/lib/types.ts#L125-L134), `composeMessage` constructs the published copy sent to Meta:
     ```typescript
     export function composeMessage(
       post: Pick<Post, "title" | "description" | "hashtags" | "link_url">,
       utmSuffix = ""
     ): string {
       const tags = post.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ");
       return [post.title, post.description, post.link_url ?? "", tags, utmSuffix]
         .map((part) => part.trim())
         .filter(Boolean)
         .join("\n\n");
     }
     ```
   * **The Vulnerability:** `link_url` **is editable** via `PATCH /api/posts/{id}` (`b.linkUrl`), but:
     - `contentChanged` in `route.ts:1102-1106` does **not** check `b.linkUrl !== existing.link_url`.
     - `computePostContentHash` does **not** include `link_url` in the SHA-256 payload.
   * **Impact:** An administrator could approve a post, and subsequently a `PATCH /api/posts/{id}` updating `linkUrl` would update the database without clearing `approved_by_user` or changing `approval_content_hash`. The post would then publish with the modified URL.
2. **Global `app_settings.utm_suffix`:**
   * Global setting appended to all post messages. Modifying `utm_suffix` changes published text without invalidating per-post hashes.

---

## 2. Admin-Session Enforcement

### Source Code Findings

#### Exact authentication guard protecting `POST /api/posts/{id}/approve`
* In [`src/app/api/[...path]/route.ts:375-382`](file:///c:/Users/Core/Documents/Vibecoding/facebook-auto-bot/src/app/api/%5B...path%5D/route.ts#L375-L382):
  ```typescript
  export async function POST(req: Request, ctx: Ctx) {
    const { path } = await ctx.params;
    const route = path.join("/");
    const url = new URL(req.url);

    return safely(async () => {
      const denied = await guard(route, req, url);
      if (denied) return denied;
  ```
* In [`src/app/api/[...path]/route.ts:129-140`](file:///c:/Users/Core/Documents/Vibecoding/facebook-auto-bot/src/app/api/%5B...path%5D/route.ts#L129-L140):
  ```typescript
  async function guard(route: string, req: Request, url: URL): Promise<Response | null> {
    if (OPEN_ROUTES.has(route)) return null;
    if (isIntegrationRoute(route)) {
      return validateIntegrationAuth(req) ? null : unauthorized();
    }
    if (route === "cron/process-queue") {
      return (await cronAuthorized(req, url)) ? null : unauthorized();
    }
    return (await hasSession(req)) ? null : unauthorized();
  }
  ```
* In [`src/app/api/[...path]/route.ts:101-108`](file:///c:/Users/Core/Documents/Vibecoding/facebook-auto-bot/src/app/api/%5B...path%5D/route.ts#L101-L108):
  ```typescript
  async function hasSession(req: Request): Promise<boolean> {
    const token = req.headers
      .get("cookie")
      ?.split("; ")
      .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
      ?.split("=")[1];
    return verifySessionToken(token);
  }
  ```

#### Unauthenticated requests and integration-key-only requests
* **Unauthenticated request:** Route is `"posts/{id}/approve"`. It is not in `OPEN_ROUTES`, not in `isIntegrationRoute()`, and not `cron/process-queue`. It evaluates `hasSession(req)`. Since no `pab_session` cookie exists, `hasSession` returns `false`, and `guard` returns `unauthorized()` (HTTP 401).
* **Integration-key-only request:** A client providing `Authorization: Bearer <INTEGRATION_API_KEY>` without the session cookie reaches the same branch: `isIntegrationRoute("posts/{id}/approve")` is `false`. The default branch evaluates `hasSession(req)`. `hasSession(req)` only parses `Cookie: pab_session=...`. The Bearer header is ignored, and HTTP 401 `unauthorized()` is returned.

#### Can the route be reached through an alternate path?
* **No.** All API endpoints are routed through the single Next.js App Router catch-all dispatcher `src/app/api/[...path]/route.ts`.
* Next.js normalizes request paths into the `params.path` string array.
* The approval logic is strictly gated at line 467:
  `if (path.length === 3 && path[0] === "posts" && path[2] === "approve")`
* No rewrite rules exist in `next.config.ts` or `vercel.json` that alias or bypass `/api/posts/*`.

---

## 3. Approval-Token Compensation

### Source Code Findings

#### `releaseUnpublishedApprovalToken()` implementation and call sites
* Definition in [`src/lib/auth/integration.ts:392-411`](file:///c:/Users/Core/Documents/Vibecoding/facebook-auto-bot/src/lib/auth/integration.ts#L392-L411):
  ```typescript
  export async function releaseUnpublishedApprovalToken(nonce: string, postId: string): Promise<void> {
    if (testMockStorageEnabled) {
      const record = approvalRegistry.get(nonce);
      if (record && record.postId === postId) {
        record.usedAt = null;
      }
      return;
    }
    try {
      const { supabaseAdmin } = await import("../supabase/server");
      const db = supabaseAdmin();
      await db
        .from("approval_tokens")
        .update({ used_at: null })
        .eq("nonce", nonce)
        .eq("post_id", postId);
    } catch {
      // Best-effort compensation
    }
  }
  ```
* **Sole Call Site:** [`src/app/api/[...path]/route.ts:986-1000`](file:///c:/Users/Core/Documents/Vibecoding/facebook-auto-bot/src/app/api/%5B...path%5D/route.ts#L986-L1000):
  ```typescript
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Publishing failed.";
    if (msg.includes("Concurrent publishing detected")) {
      // Compensate: release token so user can retry once the concurrent process finishes
      const parts = parsed.data.approvalToken.split(".");
      if (parts[0]) {
        try {
          const p = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
          if (p?.nonce) await releaseUnpublishedApprovalToken(p.nonce, post.id);
        } catch {}
      }
      return json({ error: msg }, 409);
    }
    return json({ error: msg }, 502);
  }
  ```

#### Confirmation: Only released when publication definitely has not been dispatched to Meta
* In [`src/lib/facebook/publish.ts:103-128`](file:///c:/Users/Core/Documents/Vibecoding/facebook-auto-bot/src/lib/facebook/publish.ts#L103-L128), the error `"Concurrent publishing detected..."` is thrown at lines 114-118 during the initial atomic state claim:
  ```typescript
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
    if (fresh?.status === "posted") return fresh;
    throw new Error("Concurrent publishing detected. Request aborted to prevent duplicate posts.");
  }
  ```
* The external publisher dispatch (`await publisher(...)`) is located at line 123, *strictly after* the atomic claim succeeds.
* If `await publisher(...)` throws an error (e.g., timeout, network drop, Meta Graph API error), the error message is derived from the Meta error response or timeout classifier (`[UNCERTAIN_OUTCOME]`), which never matches `"Concurrent publishing detected"`.
* Therefore, `releaseUnpublishedApprovalToken()` is **never** invoked once network dispatch to Meta has begun.

#### Can it unconsume a token after another request has started publishing?
* **Case 1: Both requests submit the same approval token.**
  `verifyAndConsumeApprovalToken` atomically checks `.is("used_at", null)`. Request 1 updates `used_at = now`. Request 2 matches 0 rows and is rejected with HTTP 403 `approvalCheck.valid === false` before calling `publishPostNow`. Request 2 never enters the catch block.
* **Case 2: Competing request with a separate token.**
  If Request 2 was minted its own token, Request 2's token was consumed, but Request 2 failed to claim `status = "publishing"` because Request 1 was already publishing. Request 2 catches `Concurrent publishing detected` and releases *its own* token. If Request 2 later retries that token, `publishPostNow` checks `if (post.status === "posted")` at line 36 and returns the published post idempotently without calling Meta.
* **Remaining Nuance:** `releaseUnpublishedApprovalToken` updates `used_at = null` without verifying whether the post row in `posts` has transitioned to `"posted"`. While `publishPostNow` guards against re-publishing already posted items, the token record itself becomes unconsumed even if the post succeeded in the competing thread.

#### Database failure mode
* If the database call inside `releaseUnpublishedApprovalToken` throws or fails, the `catch` block swallows the error (`// Best-effort compensation`).
* **Result:** `used_at` remains populated with its consumption timestamp. The token remains **consumed** (fails closed). The client cannot reuse the token and must request new approval.

---

## 4. Migration Readiness

### Schema Inspection
* Migration file: [`supabase/migrations/20261016_chatgpt_approval_and_idempotency.sql`](file:///c:/Users/Core/Documents/Vibecoding/facebook-auto-bot/supabase/migrations/20261016_chatgpt_approval_and_idempotency.sql)
* Target operations:
  1. `create table if not exists approval_tokens (...)`
  2. `create index if not exists approval_tokens_post_id_idx on approval_tokens(post_id);`
  3. `create index if not exists approval_tokens_expires_at_idx on approval_tokens(expires_at);`
  4. `alter table posts add column if not exists approved_by_user boolean not null default false;`
  5. `alter table posts add column if not exists approved_at timestamptz;`
  6. `alter table posts add column if not exists approval_content_hash text;`
  7. `create unique index if not exists posts_chatgpt_idempotency_idx on posts (topic) where topic like 'chatgpt:%';`

### Read-Only Preflight SQL Script (Safe to execute in Supabase SQL Editor)
Execute these read-only inspection queries prior to running the migration:

```sql
-- 1. Check for duplicate ChatGPT idempotency keys on existing posts
-- MUST RETURN 0 ROWS. If any rows return, duplicate keys must be resolved before creating unique index.
SELECT 
  topic, 
  count(*) AS duplicate_count, 
  array_agg(id) AS post_ids
FROM posts
WHERE topic LIKE 'chatgpt:%'
GROUP BY topic
HAVING count(*) > 1;

-- 2. Inspect existing columns on posts table to ensure type compatibility
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_name = 'posts' 
  AND column_name IN ('approved_by_user', 'approved_at', 'approval_content_hash');

-- 3. Check if approval_tokens table or conflicting relation already exists
SELECT 
  table_schema, 
  table_name, 
  table_type
FROM information_schema.tables
WHERE table_name = 'approval_tokens';

-- 4. Check if idempotency or approval indexes already exist
SELECT 
  schemaname, 
  tablename, 
  indexname, 
  indexdef
FROM pg_indexes
WHERE tablename IN ('posts', 'approval_tokens')
  AND indexname IN (
    'posts_chatgpt_idempotency_idx', 
    'approval_tokens_post_id_idx', 
    'approval_tokens_expires_at_idx'
  );
```

---

## 5. Test Coverage Audit

### Coverage Breakdown by Requirement

| Requirement | Tested in `scripts/test-integration.ts`? | Genuinely Exercises Real Route / DB? | Details |
| :--- | :---: | :---: | :--- |
| **Changing image after approval** | ⚠️ Partial | ❌ No | Suite 7 (lines 984–1002) mutates `postState.title` on an in-memory object and recalculates `computePostContentHash`. It does not explicitly mutate `image_url`, nor does it execute the actual `PATCH /api/posts/{id}` endpoint. |
| **Unauthenticated dashboard approval** | ❌ No | ❌ No | Suite 1 tests isolated auth utilities (`validateIntegrationAuth`, `timingSafeEqualString`). No test invokes `POST /api/posts/{id}/approve` via an HTTP request without a cookie or with only an integration key. |
| **Concurrent publishing** | ⚠️ Simulated | ❌ No | Suite 5 (lines 689–722) and Suite 4 (lines 610–637) test concurrent execution using an in-memory mock harness (`simulatePublish` and `postState`). They do not test concurrent HTTP requests against the Next.js handler or real PostgreSQL row locks. |
| **Failure before vs after Meta dispatch** | ⚠️ Simulated | ❌ No | Suite 7 (lines 1004–1029) tests `releaseUnpublishedApprovalToken` unconsuming a token in the in-memory mock map. Suite 5 (lines 758–800) tests `[UNCERTAIN_OUTCOME]` handling on timeout using the mock publisher. |

### Classification: Genuine Code Execution vs Mocks / Simulations

#### 1. Genuinely Exercised Against Actual Production Logic
* **Timing-Safe Key Comparison:** [`src/lib/auth/integration.ts:7-16`](file:///c:/Users/Core/Documents/Vibecoding/facebook-auto-bot/src/lib/auth/integration.ts#L7-L16) is directly exercised with identical, differing, and variable-length strings.
* **M2M Auth Validation:** [`src/lib/auth/integration.ts:23-41`](file:///c:/Users/Core/Documents/Vibecoding/facebook-auto-bot/src/lib/auth/integration.ts#L23-L41) is directly exercised with real `Request` objects, checking missing headers, invalid Bearer tokens, session cookie rejection, and unset keys.
* **Content Hash Computation:** [`src/lib/auth/integration.ts:47-70`](file:///c:/Users/Core/Documents/Vibecoding/facebook-auto-bot/src/lib/auth/integration.ts#L47-L70) is directly exercised for deterministic hashing and hashtag normalization.
* **SSRF and Magic Bytes:** [`src/lib/ai/image-security.ts`](file:///c:/Users/Core/Documents/Vibecoding/facebook-auto-bot/src/lib/ai/image-security.ts) is directly exercised for IPv4 loopback, RFC1918, cloud metadata endpoints, and PNG/JPEG/GIF/WebP magic bytes.
* **OpenAPI 3.1.0 Contract:** [`public/openapi.json`](file:///c:/Users/Core/Documents/Vibecoding/facebook-auto-bot/public/openapi.json) file structure, routes, schemas, and `x-openai-isConsequential: true` properties are verified.
* **Build & Type Compilation:** Next.js production build (`next build`) runs full TypeScript type checking across all routes and libraries.

#### 2. Mocked or Simulated (Not Testing Real Runtime DB/HTTP Integration)
* **Supabase Database Persistence:** Gated behind `enableTestMockStorage(true)`. The live PostgreSQL queries in `persistApprovalRecord()`, `verifyAndConsumeApprovalToken()`, and `releaseUnpublishedApprovalToken()` are mocked via an in-memory `Map<string, ApprovalRecord>`.
* **API Route Handlers:** The HTTP dispatch handlers in `src/app/api/[...path]/route.ts` are not invoked over HTTP by the test suite.
* **Meta Graph API Publishing:** The publisher is mocked using an asynchronous stub function (`mockPublisher`). Real Meta Graph API calls are strictly avoided per safety constraints.

---

## 6. Summary of Remaining Risks & Discrepancies

> [!WARNING]
> **Production-Readiness Gaps Identified:**
>
> 1. **`link_url` Modification Bypass:**  
>    `link_url` can be edited on a post via `PATCH /api/posts/{id}`. Because `contentChanged` does not check `linkUrl` and `computePostContentHash` does not include `link_url`, an approved post's destination URL can be altered without invalidating `approved_by_user` or the approval hash.
>
> 2. **Preflight Duplicate Verification Required:**  
>    If production already contains duplicate `topic` rows starting with `chatgpt:`, applying `20261016_chatgpt_approval_and_idempotency.sql` will fail on index creation until duplicates are resolved using the preflight query above.
>
> 3. **Unvalidated HTTP Integration Routes:**  
>    While unit and mock test coverage is 100% (45/45 tests passing), the actual HTTP route handlers and PostgreSQL transactions have not been executed against a staging or live database instance.
