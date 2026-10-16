# ChatGPT Integration Guide: Custom GPT Actions with Facebook Auto Bot

This guide explains how to connect your Facebook Auto Bot application to ChatGPT via a Custom GPT with Actions, allowing ChatGPT to generate post captions and images, stage them for your manual review, and publish the approved content to your connected Facebook Page.

---

## 1. Overview of the Architecture

```
[ChatGPT Custom GPT]
       │
       │ 1. User prompts ChatGPT to create a Facebook post
       │ 2. ChatGPT writes caption (title hook, description, hashtags) & generates image (DALL-E)
       │ 3. ChatGPT displays complete preview in the chat for your manual review
       │ 4. You approve: "Looks great, publish it"
       │
       ▼ (Bearer Authorization: Bearer <INTEGRATION_API_KEY>)
[Next.js API: /api/chatgpt/posts]
       │
       │ 5. Validates input schema via Zod
       │ 6. Validates image host against allowlist & verifies IP is public (SSRF protection)
       │ 7. Downloads image bytes, verifies PNG/JPEG/WebP magic bytes, and uploads to Supabase Storage
       │ 8. Resolves active default Facebook Page from server-side settings
       │ 9. Stages post in 'draft' status with a cryptographically signed approvalToken
       │
       ▼ (Returns post preview + approvalToken to ChatGPT)
[ChatGPT Custom GPT]
       │
       │ 10. Calls POST /api/chatgpt/posts/{id}/publish with approvalToken
       │
       ▼
[Next.js API: /api/chatgpt/posts/{id}/publish]
       │
       │ 11. Verifies HMAC-SHA256 signature of approvalToken matches current content hash
       │ 12. Atomically claims post to prevent concurrent or duplicate publishing
       │ 13. Calls Facebook Graph API v26.0 (POST /{page-id}/photos)
       │ 14. Records Facebook Post ID and sets status to 'posted'
       │
       ▼ (Returns confirmed live Facebook post URL)
[ChatGPT Custom GPT]
       │
       └─► 15. Reports: "Your post is live on Facebook! https://facebook.com/<post-id>"
```

---

## 2. Environment Configuration

### Required Environment Variable
To protect machine-to-machine integration routes without exposing your dashboard session cookies, set:

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
| `POST` | `/api/chatgpt/posts` | Ingests image, stages post for review, returns `approvalToken` | `Bearer <INTEGRATION_API_KEY>` |
| `GET` | `/api/chatgpt/posts/{id}` | Checks publication status and returns Facebook post ID | `Bearer <INTEGRATION_API_KEY>` |
| `POST` | `/api/chatgpt/posts/{id}/publish` | Publishes approved post to Facebook Graph API | `Bearer <INTEGRATION_API_KEY>` |

*All integration endpoints fail closed with HTTP 401 if the `Authorization: Bearer <INTEGRATION_API_KEY>` header is missing, invalid, or unconfigured.*

---

## 4. Security & Safety Safeguards

### A. SSRF & Network Protection for External Images
When ChatGPT generates an image (e.g., via DALL-E) and sends the image URL:
1. **Scheme Validation:** Only `https://` URLs are accepted.
2. **Domain Allowlist:** Restricted to verified OpenAI/DALL-E image hosts:
   * `oaidalleapiprodscus.blob.core.windows.net`
   * `dalleproduseast.blob.core.windows.net`
   * `dalleprodsus.blob.core.windows.net`
   * `files.oaiusercontent.com`
   * `images.openai.com`
   * `cdn.openai.com`
   *(Additional domains can be allowlisted via the `ALLOWED_IMAGE_DOMAINS` env var).*
3. **DNS Resolution & Private IP Guard:** The backend resolves the hostname via DNS and blocks loopback (`127.0.0.0/8`), private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), cloud metadata (`169.254.169.254`), and IPv6 ULA/link-local ranges.
4. **No Redirects:** Fetch is executed with `redirect: "error"` to eliminate redirect-based SSRF bypasses.
5. **Magic Byte Validation:** Downloaded bytes are checked for authentic binary file signatures (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF...WEBP`). Fake images or scripts are rejected.
6. **Re-hosting:** Validated images are uploaded directly to the Supabase Storage bucket `post-images` under a date-partitioned UUID path.

### B. Cryptographic Manual Approval Enforcement
1. When a post is staged via `POST /api/chatgpt/posts`, the server calculates a deterministic SHA-256 hash of:
   `postId | title | description | hashtags | supabaseImageUrl | defaultPageId`
2. The server signs this hash using HMAC-SHA256 and returns it as `approvalToken`.
3. When `POST /api/chatgpt/posts/{id}/publish` is called, the server recalculates the current content hash and validates the HMAC signature.
4. If any content field (or the target Page ID) has been altered after approval, verification fails with **HTTP 403 Forbidden**. A client-side `approved: true` boolean is never accepted as proof of approval.

### C. Idempotency & Duplicate Prevention
1. **Staging Idempotency:** The create endpoint accepts an optional `idempotencyKey`. If a request is repeated with the same key, the existing staged post is returned without re-downloading images or creating duplicate database rows.
2. **Publishing Idempotency:** If `publishPostNow()` is called on a post whose status is already `posted`, it returns the existing record immediately without calling Facebook.
3. **Atomic Claim Lock:** Before calling Facebook, the server updates status to `publishing` using an atomic conditional update (`status != 'posted' AND status != 'publishing'`). Concurrent requests for the same post are blocked.

---

## 5. Setting Up the ChatGPT Custom GPT Action

### Step 1: Create or Edit your Custom GPT
1. Open [ChatGPT](https://chatgpt.com) and navigate to **Explore GPTs > Create**.
2. Go to the **Configure** tab.
3. Set Name: `Facebook Auto Bot Assistant`.
4. Set Instructions:
   ```text
   You are the social media assistant for my connected Facebook Page.
   Your workflow:
   1. When I ask for a post or provide a topic, draft an engaging Facebook photo post:
      - Title: Hook under 80 characters, at most one emoji, no hashtags.
      - Description: 2-4 conversational sentences ending with a question.
      - Hashtags: 3 to 5 relevant tags without '#' symbols.
   2. Generate a matching visual image using DALL-E.
   3. Call the action `createChatGPTPost` with the title, description, hashtags, and the generated image URL.
   4. Display the complete post preview (title, description, hashtags, and image) to me in the chat.
   5. Explicitly ask for my confirmation: "Do you approve publishing this post to your Facebook Page?"
   6. DO NOT call `publishChatGPTPost` until I explicitly confirm my approval.
   7. Upon my approval, call `publishChatGPTPost` with the postId and approvalToken.
   8. Report the confirmed Facebook post link once published.
   ```

### Step 2: Add Actions
1. Under **Actions**, click **Create new action**.
2. In the **Schema** box, choose **Import from URL** and enter your deployed URL:
   `https://your-deployment.vercel.app/openapi.json`  
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
   npx tsx scripts/test-integration.ts
   ```

---

## 7. Next Steps & Production Deployment

To put this live on Vercel:
1. Commit the changes:
   ```bash
   git add .
   git commit -m "feat: add ChatGPT Custom GPT Action integration endpoints and security safeguards"
   git push origin main
   ```
2. In the [Vercel Dashboard](https://vercel.com):
   * Go to **Settings > Environment Variables**.
   * Add `INTEGRATION_API_KEY` with your generated secret.
   * Trigger a redeployment.
3. Update your ChatGPT Custom GPT Action schema with your production domain (`https://your-app.vercel.app`).
