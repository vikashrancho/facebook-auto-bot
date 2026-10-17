# Comprehensive Technical Audit Report: Facebook Auto Bot & ChatGPT Integration

**Target System:** `facebook-auto-bot`  
**Audit Type:** Read-Only Source Code & Architecture Inspection  
**Constraint Verification:** No files modified, no dependencies installed, no configurations altered, no services restarted, no Facebook API calls or test posts dispatched, no credentials exposed.

---

## 1. Executive Summary

This audit assesses the technical feasibility, architectural readiness, and security posture of connecting the existing **Facebook Auto Bot** application to **ChatGPT** (via a Custom GPT with Actions). 

### Overall Finding
The application possesses a solid foundation for Facebook Page publishing, with an active Facebook Graph API v26.0 integration, direct photo publishing, Supabase database persistence, and Supabase Storage asset hosting. However, **the application in its current state cannot be directly connected to ChatGPT without targeted enhancements**.

### Key Verdicts:
* **Facebook Publishing Engine:** **PASS** — Direct photo publishing to connected Facebook Pages via Graph API `/{page-id}/photos` is fully functional in the backend.
* **Asset Hosting Pipeline:** **PASS** — Automatically re-hosts media to a public Supabase Storage bucket (`post-images`) before submitting to Facebook.
* **Public Network Exposure:** **FAIL** — The app runs locally on `localhost:3000` or on Vercel without an external API Gateway, tunnel, or documented OpenAPI contract.
* **API Authentication for Integrations:** **FAIL** — All existing post creation and publishing endpoints require a browser-based HMAC-signed cookie (`pab_session`). There is no API key or Bearer token mechanism for third-party machine-to-machine integrations.
* **External Image Ingestion:** **PARTIAL** — The app accepts pre-hosted image URLs in `POST /api/posts` or base64 Data URLs in `POST /api/upload/image`, but lacks a server-side SSRF-protected download-and-rehost mechanism for images generated externally by ChatGPT / DALL-E.
* **Approval & Safety Controls:** **PARTIAL** — The system supports drafts and scheduled posts, but lacks an external approval lifecycle, idempotency tokens, or duplicate submission detection.

---

## 2. Application Architecture

| Dimension | Details | Source Reference |
| :--- | :--- | :--- |
| **Language & Framework** | TypeScript 5.x, Next.js 16.3.4 (App Router), React 19.2.8 | `package.json:L11-32` |
| **Frontend Technologies** | Tailwind CSS v4, `@phosphor-icons/react`, Recharts, React Server & Client Components | `package.json:L12-24` |
| **Backend Technologies** | Next.js Serverless Route Handlers (Node.js runtime), Zod 4.5.4 | `src/app/api/[...path]/route.ts:L1-65` |
| **Database & Storage** | Supabase PostgreSQL (`@supabase/supabase-js` 2.114.0) + Supabase Storage (`post-images`) | `supabase/schema.sql:L12-98` |
| **Application Type** | Full-stack web application (Monolithic Next.js project with UI and API dispatcher) | Entire repository |
| **Local Execution** | `npm run dev` running on `http://localhost:3000` | `package.json:L6` |
| **Public Deployment Status** | Configured for Vercel deployment (`vercel.json`, `scripts/deploy.sh`), but currently active on local workspace | `vercel.json:L1-10`, `src/lib/env.ts:L87-95` |

### Project Directory Structure
```
facebook-auto-bot/
├── .env.local                  # Local secrets (Supabase keys, admin password, AI keys)
├── package.json                # Dependencies and npm scripts
├── next.config.ts              # Next.js configuration
├── vercel.json                 # Vercel deployment & daily cron schedule
├── scripts/
│   └── deploy.sh               # Vercel production deployment script
├── supabase/
│   └── schema.sql              # PostgreSQL schema (app_settings, posts, topics, pages_cache)
└── src/
    ├── middleware.ts           # Route protection for UI pages (excludes /api/)
    ├── app/
    │   ├── page.tsx            # Redirects to /dashboard
    │   ├── login/              # Admin login page
    │   ├── dashboard/          # Admin UI (generate, queue, history, settings, templates)
    │   └── api/
    │       └── [...path]/
    │           └── route.ts    # Centralized monolithic API dispatcher (all endpoints)
    └── lib/
        ├── env.ts              # Typed environment variables
        ├── types.ts            # Type definitions, aspect ratios, composeMessage helper
        ├── autopilot.ts        # Cron autopilot automation
        ├── auth/session.ts     # Web Crypto HMAC-SHA256 session token management
        ├── facebook/           # Graph API client, OAuth flow, credentials, publish worker
        ├── ai/                 # Text generation (Gemini, Groq, OpenAI) & Image generation
        ├── db/                 # Supabase query helpers (posts, settings, topics, templates)
        └── supabase/server.ts  # Supabase admin client initialization
```

### Application Entry Points & Middleware
* **Web UI Entry Point:** `src/app/page.tsx:L3-5` redirects `/` to `/dashboard`.
* **Edge Middleware:** `src/middleware.ts:L4-33` checks for the signed `pab_session` cookie on all non-static paths. Line 32 explicitly excludes `/api/*` from Next.js middleware, deferring all API security to the API router.
* **Unified API Router:** `src/app/api/[...path]/route.ts:L63-65` acts as a catch-all dispatcher for all HTTP verbs (`GET`, `POST`, `PATCH`, `DELETE`). This single-dispatcher pattern was implemented to prevent Vercel Hobby plan serverless function limits.

---

## 3. Existing Facebook Integration

| Item | Status | Verification & Source Details |
| :--- | :---: | :--- |
| **Graph API Version** | **PASS** | Pinned to Meta Graph API version **`v26.0`** (`src/lib/facebook/oauth.ts:L4`). Base endpoint: `https://graph.facebook.com/v26.0`. |
| **Page Connection & Selection** | **PASS** | Pages are discovered via `GET /me/accounts` with `CREATE_CONTENT` permission filtering (`src/lib/facebook/client.ts:L57-86`). Selected page ID and name are stored in the database singleton table `app_settings` as `default_page_id` and `default_page_name`. |
| **Access Token Handling** | **PASS** | Tokens are stored in Supabase table `app_settings` (`facebook_user_token`, `default_page_token`). Tokens are never sent to the browser and are sanitized in API responses via `publicSettings()` (`src/app/api/[...path]/route.ts:L129-159`). Page tokens minted from long-lived user tokens do not expire (`src/lib/facebook/oauth.ts:L79-93`). |
| **Post Types Supported** | **PARTIAL** | **Photo/Image posts only**. Publishing calls `POST /{page-id}/photos` (`src/lib/facebook/client.ts:L137-149`). Text-only posts (`/{page-id}/feed`) are not implemented. |
| **Image Transmission Method** | **PASS** | Images are transmitted to Meta via public URL (`url: input.imageUrl`) (`src/lib/facebook/client.ts:L141`). Direct binary multipart uploads to Facebook are not used; the architecture relies on Facebook crawling the Supabase Storage URL. |
| **Working Publishing Endpoint** | **PASS** | Publishing is executed by `src/lib/facebook/publish.ts:L12-60` (`publishPostNow`). Accessible via `POST /api/posts` (with `action: "post_now"`) and `POST /api/posts/<id>/post-now`. |
| **Error Handling** | **PASS** | Facebook API errors are caught, inspected for `(#200)` permission failures, formatted into user-friendly error messages, and saved in `posts.error_message` with `status: "failed"` (`src/lib/facebook/publish.ts:L45-59`). |
| **Token Validity & Permissions** | **PARTIAL** | Verifies required permissions (`pages_show_list`, `pages_manage_posts`, `pages_read_engagement`) during OAuth exchange (`src/lib/facebook/client.ts:L89-115`), but does not perform active validity probing immediately prior to publishing. |
| **Duplicate Prevention** | **FAIL** | `publishPostNow()` does not verify whether `post.status === "posted"` prior to dispatching `publishPhoto()`. Triggering the publish endpoint twice for the same post record will publish duplicate photos to Facebook. |
| **Publication Record Persistence** | **PASS** | Facebook's returned post identifier is captured and saved to `posts.facebook_post_id`, timestamped in `posts.posted_at`, and status updated to `"posted"` (`src/lib/facebook/publish.ts:L39-44`). |

---

## 4. Existing Backend API Endpoint Inventory

All endpoints are hosted on the route dispatcher: `src/app/api/[...path]/route.ts`.

| Method | Path | Purpose | Auth Required | Request Payload | Response Shape | Safe for ChatGPT As-Is? |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| `GET` | `/api/trends` | Fetch trending topics | Cookie (`pab_session`) | None | `{ topics: string[] }` | **No** (Cookie required) |
| `GET` | `/api/settings` | Get sanitized settings | Cookie (`pab_session`) | None | Sanitized `AppSettings` object | **No** (Cookie required) |
| `GET` | `/api/posts` | List posts by status | Cookie (`pab_session`) | Query `?status=draft,scheduled` | `{ posts: Post[] }` | **No** (Cookie required) |
| `GET` | `/api/facebook/pages` | List managed Pages | Cookie (`pab_session`) | Query `?refresh=1` | `{ pages: PageCache[], defaultPageId }` | **No** (Cookie required) |
| `GET` | `/api/topics` | Get topic queue | Cookie (`pab_session`) | None | `{ ready, source, topics, nextId }` | **No** (Cookie required) |
| `GET` | `/api/templates` | List canvas templates | Cookie (`pab_session`) | None | `{ templates: Template[] }` | **No** (Cookie required) |
| `GET` | `/api/facebook/oauth/start` | Start Meta OAuth | Cookie (`pab_session`) | None | 302 Redirect to Meta Dialog | **No** (Interactive browser) |
| `GET` | `/api/facebook/oauth/callback`| Meta OAuth callback | State Cookie | Query params `code`, `state` | 302 Redirect to `/dashboard/settings` | **No** (Meta callback) |
| `GET` | `/api/cron/process-queue` | Process queue / Autopilot | `CRON_SECRET` or Cookie | None (Query `?secret=` or Bearer) | `{ processedFromQueue, autopilot }` | **No** (Batch cron trigger) |
| `POST` | `/api/auth/login` | Admin password login | None (Open) | `{ password: string }` | Sets HTTP-only `pab_session` cookie | **No** (Browser session) |
| `POST` | `/api/auth/logout` | Logout | None (Open) | None | Clears `pab_session` cookie | **No** (Browser session) |
| `POST` | `/api/generate/content` | LLM copy generation | Cookie (`pab_session`) | `{ topic: string, prompt?: string }` | `{ title, description, hashtags, image_prompt }` | **No** (Cookie required) |
| `POST` | `/api/generate/image` | AI/Stock image gen | Cookie (`pab_session`) | `{ prompt: string, source: "ai"\|"stock"\|"mixed" }` | `{ url: string, source: string }` | **No** (Cookie required) |
| `POST` | `/api/posts` | Create draft/scheduled post or post immediately | Cookie (`pab_session`) | `{ topic, title, description, hashtags, imageUrl, imageSource, linkUrl?, pageId, pageName, action: "draft"\|"schedule"\|"post_now", scheduledAt? }` | `{ post: Post }` | **No** (Cookie required; requires pageId) |
| `POST` | `/api/posts/<id>/post-now` | Publish specific post | Cookie (`pab_session`) | None | `{ post: Post }` | **No** (Cookie required) |
| `POST` | `/api/upload/image` | Upload Base64 image | Cookie (`pab_session`) | `{ dataUrl: "data:image/...;base64,..." }` | `{ url: string }` (Supabase URL) | **No** (Cookie required; large payload) |
| `POST` | `/api/facebook/default-page` | Set default Page | Cookie (`pab_session`) | `{ pageId: string }` | `{ ok: true, pageName: string }` | **No** (Cookie required) |
| `POST` | `/api/facebook/credentials` | Save Meta App credentials | Cookie (`pab_session`) | `{ appId: string, appSecret?: string, configId?: string }` | `{ ok: true, redirectUri: string }` | **No** (Cookie required) |
| `POST` | `/api/facebook/credentials/clear` | Clear Meta credentials | Cookie (`pab_session`) | None | `{ ok: true }` | **No** (Cookie required) |
| `POST` | `/api/facebook/disconnect` | Disconnect Facebook | Cookie (`pab_session`) | None | `{ ok: true }` | **No** (Cookie required) |
| `PATCH`| `/api/settings` | Update settings | Cookie (`pab_session`) | Partial `AppSettings` object | Updated `AppSettings` | **No** (Cookie required) |
| `PATCH`| `/api/posts/<id>` | Update post draft | Cookie (`pab_session`) | Partial post fields | `{ post: Post }` | **No** (Cookie required) |
| `DELETE`| `/api/posts/<id>` | Delete post record | Cookie (`pab_session`) | None | `{ ok: true }` | **No** (Cookie required) |

> **Critical Finding:** There is **no dedicated health check endpoint** (e.g., `GET /api/health`), and **no existing endpoint can be called by ChatGPT out of the box** because all core operations require the browser `pab_session` HMAC cookie.

---

## 5. ChatGPT Integration Readiness Checklist

| Evaluation Item | Status | Detailed Finding |
| :--- | :---: | :--- |
| **Publicly Reachable HTTPS URL** | **FAIL** (Local) / **PASS** (If on Vercel) | When running on `localhost:3000`, OpenAI's servers cannot reach the application. A public HTTPS endpoint (Vercel deployment domain or Cloudflare Tunnel/ngrok) is an absolute prerequisite. |
| **Authentication for GPT Actions** | **FAIL** | Custom GPT Actions require either **API Key** (Bearer / custom header) or **OAuth 2.0**. The app currently only supports browser cookie authentication via `hasSession()` (`src/app/api/[...path]/route.ts:L91-98`). |
| **CORS / Network Constraints** | **PASS** | Server-to-server HTTP calls originated from ChatGPT Action workers are not browser-bound and are unaffected by browser same-origin CORS policies. |
| **JSON Payload Handling** | **PASS** | The backend natively parses and validates JSON via Zod schemas. |
| **Receiving Caption & Image from ChatGPT** | **PARTIAL** | The backend can accept `{ title, description, hashtags, imageUrl }` in `POST /api/posts`, but expects an already hosted public image URL and requires `pageId` and `pageName`. It cannot accept an image generated inside ChatGPT without either re-hosting it or downloading it. |
| **OpenAPI 3.x Schema Availability** | **FAIL** | No OpenAPI or Swagger schema currently exists in the project. Custom GPT Actions require an OpenAPI 3.0.x / 3.1.x specification. |
| **Dedicated Integration Endpoint** | **FAIL** | A dedicated endpoint designed specifically for ChatGPT (accepting captions, external image URL, and handling approval/publishing modes) does not exist. |

---

## 6. Image Handling & Compatibility

### Current Flow in Code
1. **Generation:** When generating within the app, `fetchAiImageBytes` calls OpenAI DALL-E 3 or `fetchStockImageBytes` calls Pexels (`src/lib/ai/image.ts:L26-67`).
2. **Re-hosting:** The image bytes are uploaded to Supabase Storage bucket `post-images` with a date-partitioned UUID path: `YYYY-MM-DD/<uuid>.jpg` (`src/lib/ai/image.ts:L95-108`).
3. **Facebook Crawl:** The resulting Supabase public URL (`https://<project-ref>.supabase.co/storage/v1/object/public/post-images/...`) is supplied to Meta's `/{page-id}/photos` endpoint (`src/lib/facebook/client.ts:L137-149`).

### Compatibility with ChatGPT Workflow
* **Binary Upload vs URL:** Custom GPT Actions cannot stream binary multi-part files directly. ChatGPT outputs either:
  * A temporary OpenAI CDN image URL (e.g. DALL-E generated output, which expires in ~60 minutes).
  * A base64 Data URL (which often fails in GPT Actions due to JSON size restrictions and gateway timeouts).
* **Remote Ingestion Capability:** The app currently **does not have a helper to fetch an arbitrary external image URL and re-host it into Supabase Storage**.
* **Recommendation:** The simplest, most reliable approach is:
  1. Add a backend ingest function: `ingestExternalImage(remoteUrl: string)` that validates the URL, downloads image bytes server-side, uploads to Supabase `post-images` bucket, and returns the stable Supabase URL.
  2. Alternatively, allow ChatGPT to pass an `image_prompt` and let the app's internal `generateImage` service produce and re-host the image.

---

## 7. Approval and Publishing Safety Review

The user requested two operational modes:
* **Mode A — Manual Approval:** Content generated in ChatGPT; reviewed by user in ChatGPT; nothing posted until explicitly approved; app publishes upon approval.
* **Mode B — Explicit Auto-Approval:** Content meeting configured rules is published automatically; non-compliant content remains pending review; duplicate prevention enforced.

### Current Capabilities vs Gaps
| Capability | Status | Assessment |
| :--- | :---: | :--- |
| **Manual Approval in ChatGPT (Mode A)** | **PARTIAL** | The existing API has `action: "draft"` and `action: "post_now"`, but no external token-authorized API to execute a two-step flow ("Create Pending Review" $\rightarrow$ "Approve & Publish"). |
| **Explicit Auto-Approval (Mode B)** | **PARTIAL** | The app has an internal cron autopilot (`src/lib/autopilot.ts`), but no API endpoint allowing ChatGPT to submit posts that auto-publish if and only if an "auto-approve" flag is enabled in settings. |
| **Duplicate Prevention** | **FAIL** | No idempotency keys or hash-based duplicate checks exist in `src/lib/facebook/publish.ts` or `src/lib/db/posts.ts`. If an external client retries a request, duplicate posts will be created and published. |
| **Audit Logging** | **PARTIAL** | Published posts record `posted_at`, `facebook_post_id`, and `error_message`, but there is no audit log of *which client or agent* initiated the post (e.g., whether created via Dashboard, Autopilot Cron, or ChatGPT). |

---

## 8. Security Audit Findings

| Category | Status | Finding & Risk Assessment | Source Reference |
| :--- | :---: | :--- | :--- |
| **Hardcoded Secrets** | **PASS** | No hardcoded tokens, passwords, or secrets exist in the git tracked files. | Entire repository |
| **Secret Exposure in Responses** | **PASS** | `publicSettings()` explicitly strips `facebook_app_secret`, `facebook_user_token`, `default_page_token`, and all AI provider API keys before returning settings to clients. | `src/app/api/[...path]/route.ts:L129-159` |
| **API Authentication** | **FAIL** (for integrations) | The API relies exclusively on the browser `pab_session` cookie. There is no API key or Bearer token mechanism for server-to-server callers like ChatGPT. | `src/app/api/[...path]/route.ts:L91-117` |
| **Server-Side Request Forgery (SSRF)** | **FAIL** (if external URLs accepted) | Currently, external image downloads only fetch from fixed domains (OpenAI, Pexels, Unsplash). If a new endpoint is introduced to accept arbitrary image URLs from ChatGPT without validation, it could be exploited to query internal cloud metadata services (`169.254.169.254`) or local network resources. | `src/lib/ai/image.ts:L26-67` |
| **Request Rate Limiting** | **PARTIAL** | Vercel provides baseline edge DDoS protection, but application-level rate limiting is absent. | N/A |
| **Database Permissions** | **PASS** | Supabase database calls run through `supabaseAdmin()` using the server-side `SUPABASE_SERVICE_ROLE_KEY`. | `src/lib/supabase/server.ts:L7-14` |

---

## 9. Existing Features vs Missing Features

| Feature | Existing in Repository | Missing / Requires Development |
| :--- | :---: | :--- |
| Facebook Graph API v26.0 publishing | **Yes** (`src/lib/facebook/client.ts`) | — |
| Facebook Page token persistence | **Yes** (`supabase/schema.sql`) | — |
| Supabase Storage bucket (`post-images`) | **Yes** (`src/lib/ai/image.ts`) | — |
| Post composing helper (`composeMessage`) | **Yes** (`src/lib/types.ts`) | — |
| API Key / Bearer Authentication | No | **Yes** (Need `INTEGRATION_API_KEY`) |
| Dedicated ChatGPT Action Endpoint | No | **Yes** (e.g., `POST /api/chatgpt/post`) |
| Remote Image Ingestion & Re-hosting | No | **Yes** (SSRF-safe download to Supabase) |
| Idempotency / Duplicate Prevention | No | **Yes** (Check post status & idempotency key) |
| OpenAPI 3.1.0 Specification Document | No | **Yes** (`/api/openapi.json` or static spec) |
| Health Check Endpoint | No | **Yes** (`GET /api/health`) |
| Public Tunnel / Gateway for Local Dev | No | **Yes** (Cloudflare Tunnel or Vercel deploy) |

---

## 10. Recommended Architecture

### Integration Method: Custom GPT with Actions (OpenAPI 3.1.0)
A **ChatGPT Custom GPT Action** is strongly recommended over a Remote MCP server because:
1. Custom GPT Actions communicate directly via standard HTTPS OpenAPI endpoints, fitting Next.js serverless architecture seamlessly.
2. No long-lived stateful SSE (Server-Sent Events) or WebSocket transport daemon is needed.
3. Native support in ChatGPT for user interactive confirmations (Mode A "Always ask before publishing").

### Proposed Architecture Flow

```
+-----------+                +-------------------------+                +--------------------------+                +--------------------+
|   User    |                |   ChatGPT Custom GPT    |                |      Next.js Backend     |                | Facebook Graph API |
+-----------+                +-------------------------+                +--------------------------+                +--------------------+
      |                                   |                                           |                                       |
      | 1. "Create post on topic X"       |                                           |                                       |
      |---------------------------------->|                                           |                                       |
      |                                   |                                           |                                       |
      |                                   | 2. Generates caption + image              |                                       |
      |                                   |-----------------------------+             |                                       |
      |                                   |                             |             |                                       |
      |                                   |<----------------------------+             |                                       |
      | 3. Displays Preview               |                                           |                                       |
      |<----------------------------------|                                           |                                       |
      |                                   |                                           |                                       |
      | 4. User: "Approve & Publish"      |                                           |                                       |
      |---------------------------------->|                                           |                                       |
      |                                   | 5. POST /api/chatgpt/post                 |                                       |
      |                                   |    (Bearer Auth, caption, image_url)      |                                       |
      |                                   |------------------------------------------>|                                       |
      |                                   |                                           | 6. Download image bytes,              |
      |                                   |                                           |    upload to Supabase Storage         |
      |                                   |                                           |    bucket 'post-images'               |
      |                                   |                                           |--------------------------+            |
      |                                   |                                           |                          |            |
      |                                   |                                           |<-------------------------+            |
      |                                   |                                           |                                       |
      |                                   |                                           | 7. POST /{page-id}/photos             |
      |                                   |                                           |    (Supabase URL + message)           |
      |                                   |                                           |-------------------------------------->|
      |                                   |                                           |                                       |
      |                                   |                                           | 8. Returns { id: "post_id" }          |
      |                                   |                                           |<--------------------------------------|
      |                                   |                                           |                                       |
      |                                   |                                           | 9. Updates DB status='posted'         |
      |                                   | 10. Return 200 OK (postUrl, postId)       |                                       |
      |                                   |<------------------------------------------|                                       |
      | 11. "Published! URL: https://..." |                                           |                                       |
      |<----------------------------------|                                           |                                       |
```

---

## 11. Exact Implementation Plan (Ordered by Priority)

### Phase 1: Machine-to-Machine Security & Health Check (Priority 1)
1. Add `INTEGRATION_API_KEY` to `src/lib/env.ts`.
2. Update the API route guard in `src/app/api/[...path]/route.ts` to accept `Authorization: Bearer <INTEGRATION_API_KEY>`.
3. Add a lightweight health check endpoint `GET /api/health` that checks database connectivity and whether a Facebook default page is ready.

### Phase 2: Remote Image Ingestion & SSRF Protection (Priority 2)
1. Create a helper `ingestRemoteImage(imageUrl: string)` in `src/lib/ai/image.ts`.
2. Implement strict SSRF guards (only allow `http:` / `https:`, disallow private IP ranges `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.1`, `169.254.169.254`).
3. Stream/download the image into a buffer and upload to the Supabase `post-images` bucket.

### Phase 3: Dedicated ChatGPT Endpoints with Mode A & Mode B Support (Priority 3)
1. Implement `POST /api/chatgpt/post` supporting:
   * Input payload: `{ title, description, hashtags, imageUrl?, imagePrompt?, mode: "draft" | "publish", idempotencyKey? }`.
   * Automatically resolving the default connected Facebook Page from `app_settings` (so ChatGPT does not need to know internal Page IDs).
   * Mode A: If `mode === "draft"`, saves to database and returns post ID for user review.
   * Mode B: If `mode === "publish"`, verifies safety rules, publishes via `publishPostNow()`, and returns the live Facebook post URL.
   * Enforcing duplicate prevention using `idempotencyKey` and status checks.

### Phase 4: OpenAPI 3.1.0 Specification & Custom GPT Configuration (Priority 4)
1. Create a clean OpenAPI 3.1.0 JSON schema specifying the health check and post creation endpoints.
2. Provide exact Custom GPT Action configuration instructions (Authentication type: Bearer API Key, Privacy Policy URL, and system instructions for ChatGPT).

---

## 12. Files Likely to Require Changes

1. `src/lib/env.ts`: Add optional `INTEGRATION_API_KEY`.
2. `src/app/api/[...path]/route.ts`: Update `guard()` to support Bearer API key for integration routes; route new `/api/health` and `/api/chatgpt/*` endpoints.
3. `src/lib/ai/image.ts`: Add SSRF-safe `ingestRemoteImage()` to re-host images provided by ChatGPT/DALL-E.
4. `src/lib/facebook/publish.ts`: Add state guard to prevent publishing if `post.status === "posted"`.
5. `public/openapi.json`: New OpenAPI schema for ChatGPT Custom GPT Action.
6. `.env.example` / `.env.local`: Document `INTEGRATION_API_KEY`.

---

## 13. Questions & Information Not Resolvable from Source Code

1. **Deployment Target:** Do you plan to deploy this on **Vercel** (with a public HTTPS domain) for ChatGPT access, or do you intend to run it locally on your computer using a secure tunnel (e.g. **Cloudflare Tunnel** or **ngrok**)?
2. **Image Generation Preference:** In ChatGPT, do you intend to have ChatGPT generate the image directly using DALL-E (passing an image URL to your app), or would you prefer ChatGPT to generate an optimized visual prompt and let your backend generate and host the image using its OpenAI DALL-E / Pexels engine?
3. **Facebook Page Selection:** Should ChatGPT always default to whatever Facebook Page is currently marked active in your dashboard Settings, or should ChatGPT be able to list and choose between multiple Pages?
