# ChatGPT Integration Guide: Custom GPT Actions with Facebook Auto Bot

This guide explains how to connect your Facebook Auto Bot application to ChatGPT via a Custom GPT with Actions, allowing ChatGPT to generate post captions and images, host images securely in Supabase Storage, stage posts for manual review, and publish approved content to your connected Facebook Page.

---

## 1. Overview of the Architecture

```
[ChatGPT Custom GPT]
       │
       │ 1. User prompts ChatGPT to create a Facebook post
       │ 2. ChatGPT writes caption (hook, description, hashtags) and prepares image
       │
       ▼ (Bearer Authorization: Bearer <INTEGRATION_API_KEY>)
[Step A: POST /api/chatgpt/images]
       │
       │ 3. Ingests image:
       │    - From accessible HTTPS URL (with safe redirect defense & SSRF guard)
       │    - Or from raw base64 data
       │    - Or generates AI image directly from visual prompt fallback
       │ 4. Validates PNG/JPEG/WebP magic bytes and enforces 10MB limit
       │ 5. Stores image in Supabase Storage bucket 'post-images' under unique UUID path
       │ 6. Verifies image is publicly accessible via unauthenticated HEAD check
       │
       ▼ (Returns verified permanent Supabase Storage URL: { url, verified: true })
[Step B: POST /api/chatgpt/posts]
       │
       │ 7. Stages draft post in Supabase database ('draft' status, approved_by_user: false)
       │ 8. Calculates deterministic SHA-256 contentHash of copy, image, and page ID
       │ 9. Returns post preview with reviewUrl: "/dashboard/queue?post=<id>"
       │
       ▼
[ChatGPT Custom GPT]
       │
       │ 10. Displays complete preview in chat and shares reviewUrl with user
       │ 11. Prompts user: "Review and approve in dashboard at <reviewUrl>"
       │
       ▼
[Dashboard Review & Approval]
       │
       │ 12. Human owner reviews and approves the post in the authenticated web dashboard
       │ 13. Server records approved_by_user: true and approval_content_hash
       │
       ▼
[ChatGPT Custom GPT]
       │
       │ 14. Calls POST /api/chatgpt/posts/{id}/approve (mints short-lived approvalToken)
       │ 15. Calls POST /api/chatgpt/posts/{id}/publish with approvalToken
       │
       ▼
[Next.js API: /api/chatgpt/posts/{id}/publish]
       │
       │ 16. Verifies HMAC-SHA256 signature and content hash integrity
       │ 17. Atomically claims post to prevent concurrent publication
       │ 18. Calls Meta Graph API (POST /{page-id}/photos)
       │ 19. Records Facebook post ID and sets status to 'posted'
       │
       ▼
[ChatGPT Custom GPT]
       │
       └─► 20. Reports live Facebook post link to user
```

---

## 2. Environment Configuration

### Required Environment Variable
To protect machine-to-machine integration routes without exposing dashboard session cookies, set:

```env
INTEGRATION_API_KEY=your_secure_random_key_here
```

### How to Generate a Secure Integration Key
Generate a cryptographically secure 32-byte hexadecimal secret:

* **On Windows (PowerShell):**
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
* **On macOS / Linux:**
  ```bash
  openssl rand -hex 32
  ```

Add this variable to your local `.env.local` file for development and to your **Vercel Project Settings > Environment Variables** for production.

---

## 3. Endpoints Implemented

| Method | Endpoint | Purpose | Security |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Verifies DB connectivity and Facebook Page configuration | `Bearer <INTEGRATION_API_KEY>` |
| `POST` | `/api/chatgpt/images` | Uploads/imports/generates image and hosts in Supabase Storage | `Bearer <INTEGRATION_API_KEY>` |
| `POST` | `/api/chatgpt/posts` | Stages draft with hosted image URL, returns `contentHash` and `reviewUrl` | `Bearer <INTEGRATION_API_KEY>` |
| `GET` | `/api/chatgpt/posts/{id}` | Checks publication status and returns Facebook post ID | `Bearer <INTEGRATION_API_KEY>` |
| `POST` | `/api/chatgpt/posts/{id}/approve` | Mints single-use approvalToken after dashboard approval | `Bearer <INTEGRATION_API_KEY>` |
| `POST` | `/api/chatgpt/posts/{id}/publish` | Publishes approved post to Facebook Graph API | `Bearer <INTEGRATION_API_KEY>` |

*All integration endpoints fail closed with HTTP 401 if the `Authorization: Bearer <INTEGRATION_API_KEY>` header is missing, invalid, or unconfigured.*

---

## 4. Security & Safety Safeguards

### A. SSRF, Redirect, & Image Format Protection
When importing external images:
1. **HTTPS-Only:** Only `https://` URLs are accepted. Plaintext `http://` is rejected.
2. **Safe Redirect Defense:** Follows up to 3 redirects (`redirect: "manual"`). Each intermediate and destination URL must:
   - Be HTTPS.
   - Match approved host domains (OpenAI, Azure blob, Pexels, Unsplash, Supabase, or custom `ALLOWED_IMAGE_DOMAINS`).
   - Pass strict DNS resolution checks blocking private IPs (`10.x`, `172.16-31.x`, `192.168.x`), loopback (`127.x`), link-local/cloud metadata (`169.254.169.254`), and IPv6 ULA/link-local ranges.
3. **Magic Byte File Signature Validation:** Every uploaded or ingested payload is verified against binary signatures:
   - JPEG: `FF D8 FF`
   - PNG: `89 50 4E 47 0D 0A 1A 0A`
   - WebP: `RIFF....WEBP`
   - HTML, SVG, scripts, and non-image binaries are strictly rejected.
4. **File Size Limit:** Capped at 10MB per object.
5. **Public Accessibility Verification:** Stored objects in Supabase Storage bucket `post-images` are verified via an unauthenticated HEAD check before returning success. If verification fails, the file is deleted from storage and an error is returned.

### B. Two-Step Decoupled Workflow & Fallback
Because Custom GPT action runtimes cannot transmit raw local files from chat sandboxes and OpenAI session URLs frequently expire or require browser cookies:
- **Primary Method:** Custom GPT calls `importChatGPTImage` with `imageUrl` if an accessible URL is available.
- **Automated Fallback:** If direct URL or binary transfer is unsupported, Custom GPT passes `prompt` (e.g. `"Professional photography of modern tech workspace..."`). The backend automatically synthesizes the image, uploads it to Supabase Storage, verifies public access, and returns the stable URL.
- **Alternative:** GPT can supply `imagePrompt` directly to `createChatGPTPost`.

### C. Server-Enforced Human Approval & Content Integrity
1. Every created post starts in status `draft` with `approved_by_user: false`.
2. Draft creation **never** publishes to Facebook.
3. Posts must be explicitly reviewed in the dashboard at `reviewUrl` (`/dashboard/queue?post=<id>`).
4. `POST /api/chatgpt/posts/{id}/approve` strictly verifies that a human administrator approved the post in the dashboard before issuing an approval token.
5. Content modifications (title, description, image, hashtags, link, or UTM suffix) invalidate previous approvals.

---

## 5. Setting Up the ChatGPT Custom GPT Action

### Step 1: Create or Edit your Custom GPT
1. Open [ChatGPT](https://chatgpt.com) and navigate to **Explore GPTs > Create** (or edit **Vetechno FB Auto Post**).
2. Go to the **Configure** tab.
3. Set Name: `Vetechno FB Auto Post` (or `Facebook Auto Bot Assistant`).
4. Set Instructions:
   ```text
   # Role & Purpose
   You are the social media assistant for Facebook Auto Bot. You help discover connected Facebook Pages, create, stage, review, approve, and publish photo posts to a connected Facebook Page via the application API.

   # Connected Facebook Pages & Dynamic Selection
   1. The user may have multiple Facebook Pages connected. NEVER assume a single Page and NEVER guess or hardcode Page IDs.
   2. When starting or if the target Page is unknown, ambiguous, or unconfirmed, call action `getConnectedPages` to retrieve currently connected Pages:
      - Inspect the returned list (`pageId`, `pageName`, `isActive`, `status`, `permissions`).
      - Only target Pages with `isActive: true` and publishing permissions.
      - If user specifies a Page name (e.g., "Live Jesus Christ", "loving doggy", "Invest In Stock Market"), match it against the connected pages.
      - If the requested Page is missing or inactive, STOP and explain to the user, listing the available active pages. Never silently select another Page!
   3. Always pass the resolved `pageId` and `pageName` (or `targetPageId` / `targetPageName`) to `createChatGPTPost`.

   # Content Requests Bridge (When Request ID is provided)
   When given a queued content request (e.g. "Process queued request [REQUEST_ID]"):
   1. Call `getChatGPTContentRequest(requestId)`.
   2. The returned `topic` is the absolute source of truth. Do NOT replace it or let chat history override it.
   3. If `targetPageId` and `targetPageName` are specified in the content request, use them as the destination Page.

   # Image Generation & Hosting Rules
   1. Built-in DALL-E only:
      - Generate images using ChatGPT's built-in Image Generation capability (DALL-E) based specifically on the topic.
      - If user attached an image, use that image.
   2. Import via `openaiFileIdRefs`:
      - Immediately transfer the image into storage by calling `importChatGPTImage` passing the image reference in `openaiFileIdRefs`.
      - NEVER call `generateChatGPTImage` (external server-side generator).
      - If image upload fails or `openaiFileIdRefs` is missing, STOP and report the error. Never stage a post with a broken image.
   3. Preview alignment:
      - Always use the verified hosted Supabase URL returned by `importChatGPTImage` for both `createChatGPTPost` and displaying previews in chat.

   # Publishing Modes: Mode A vs Mode B

   ### Mode A — Draft Only (DEFAULT)
   Whenever the user asks to create, draft, or prepare a post, or processes a queued content request WITHOUT explicit instruction to immediately publish:
   1. Resolve the destination Page (call `getConnectedPages` if not already verified).
   2. Generate image with DALL-E and call `importChatGPTImage(openaiFileIdRefs)`.
   3. Call `createChatGPTPost` with:
      - `title`: Catchy hook under 120 characters.
      - `description`: 2-4 conversational sentences.
      - `hashtags`: 3 to 15 relevant tags without '#' symbol.
      - `imageUrl`: The hosted Supabase URL from importChatGPTImage.
      - `pageId`: The verified target Facebook Page ID.
      - `pageName`: The verified target Facebook Page name.
      - `requestId`: (optional) The content request ID if processing a queued request.
   4. Display the draft preview in chat with:
      - Inline image preview (`![Post Image Preview]({imageUrl})`)
      - Title, description, hashtags
      - Target Facebook Page name & ID
      - Post ID and review URL (`/dashboard/queue?post=<postId>`)
   5. STOP! Inform the user:
      "Draft created! Review and approve at {reviewUrl}, or tell me 'Approve and publish to {pageName}' to publish now."
      DO NOT approve or publish automatically in Mode A.

   ### Mode B — Explicit Approval & Immediate Publication
   ONLY when the user explicitly instructs: "Approve and publish", "Publish now", "Auto-approve and publish":
   1. Verify the exact target Page and its active publishing status.
   2. If draft post is not yet created, create it first using the Mode A draft sequence.
   3. Call `getChatGPTPost(postId)` to get the authoritative `contentHash` and current draft state.
   4. Call `approveChatGPTPost(postId, { userConfirmed: true, contentHash, expectedPageId })`.
      - Verify response returns `approved: true` and an `approvalToken`.
   5. Call `publishChatGPTPost(postId, { approvalToken, expectedPageId })`.
   6. Report the confirmed live Facebook post ID and post URL to the user once published.

   ### Safety Rules
   - A request to "approve only" must call `approveChatGPTPost` and then STOP without calling `publishChatGPTPost`.
   - Never invent IDs, tokens, or hashes.
   - If the backend returns `PAGE_MISMATCH`, `TARGET_PAGE_MISMATCH`, or `HASH_MISMATCH`, STOP immediately and explain the exact issue to the user.
   ```

### Step 2: Add Actions
1. Under **Actions**, click **Create new action**.
2. In the **Schema** box, choose **Import from URL** and enter your deployed URL:
   `https://fbautopost.vetechno.in/openapi.json`  
   *(Or paste the full contents of `public/openapi.json`).*
3. Under **Authentication**:
   * **Authentication Type:** `API Key`
   * **Auth Type:** `Bearer`
   * **API Key:** Paste your `INTEGRATION_API_KEY`.

---

## 6. How to Verify Without Calling Facebook (Dry-Run Mode)

To verify the entire pipeline without publishing a real post to your live Facebook Page:
1. In `POST /api/chatgpt/posts/{id}/publish`, pass `"dryRun": true` in the JSON body:
   ```json
   {
     "approvalToken": "<token>",
     "dryRun": true
   }
   ```
2. The backend validates credentials, verifies the approval token, confirms database state, and records a simulated post ID (`mock_dryrun_<id>`) without sending any request to the Meta Graph API.
3. You can also run the local automated test suite anytime:
   ```bash
   cmd /c npx tsx scripts/test-integration.ts
   ```

---

## 7. Next Steps & Production Deployment

To deploy updates to production:
1. Run local test suite:
   ```bash
   cmd /c npx tsx scripts/test-integration.ts
   ```
2. Run production build to ensure clean TypeScript compilation:
   ```bash
   cmd /c npm run build
   ```
3. Commit and push changes:
   ```bash
   git add .
   git commit -m "fix: robust image hosting in Supabase Storage with redirect defense and verified draft creation"
   git push origin main
   ```
4. Verify the live health endpoint:
   ```bash
   curl -H "Authorization: Bearer <INTEGRATION_API_KEY>" https://fbautopost.vetechno.in/api/health
   ```
