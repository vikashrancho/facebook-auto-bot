# ChatGPT-Only Content Generation Bridge Guide

**Production Application:** [https://fbautopost.vetechno.in](https://fbautopost.vetechno.in)  
**Custom GPT Name:** Vetechno FB Auto Post  

---

## 1. Executive Summary & Architecture

The **ChatGPT-Only Content Generation Bridge** allows you to leverage your existing ChatGPT Plus or Team subscription to write copy and generate images with DALL-E, and seamlessly import the results into Facebook Auto Bot **without paying for external AI APIs** (no OpenAI API key, Gemini API key, Claude API, or Pollinations.ai).

### Workflow Diagram

```
[ User in Dashboard: /dashboard/generate ]
       │
       ▼ (1) Submits idea (topic, content type, tone, audience, image style, aspect ratio)
[ Supabase: content_requests table (status: pending_chatgpt) ]
       │
       ▼ (2) Dashboard provides Request ID & Copyable Instructions + "Open Custom GPT" button
[ Custom GPT: Vetechno FB Auto Post ]
       │
       ├─► (3) Action: getChatGPTContentRequest(requestId) ➔ Status becomes "processing"
       ├─► (4) ChatGPT generates caption & DALL-E image natively
       ├─► (5) Action: importChatGPTImage(openaiFileIdRefs) ➔ Verified Supabase Storage URL
       └─► (6) Action: createChatGPTPost(title, description, imageUrl, requestId)
                 │
                 ▼
[ Supabase: content_requests table (status: draft_created, post_id, review_url) ]
       │
       ▼ (7) Dashboard live updates with "Draft Created" & direct link to review
[ User Reviews in /dashboard/queue ➔ Schedules or Publishes ]
```

---

## 2. Database Migration

The bridge utilizes the `content_requests` table and an additional column on `app_settings`.

### Migration Script: `supabase/migrations/20261018_content_requests.sql`

```sql
create extension if not exists "pgcrypto";

create table if not exists content_requests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'admin',
  platform text not null default 'facebook',
  target_page_id text,
  target_page_name text,
  topic text not null,
  content_type text not null default 'Motivational',
  tone text,
  audience text,
  image_style text,
  aspect_ratio text not null default '1:1',
  status text not null default 'pending_chatgpt', -- 'pending_chatgpt' | 'processing' | 'draft_created' | 'failed' | 'cancelled'
  post_id uuid references posts(id) on delete set null,
  review_url text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_requests_status_idx on content_requests(status);
create index if not exists content_requests_created_idx on content_requests(created_at desc);
create index if not exists content_requests_post_id_idx on content_requests(post_id);

alter table app_settings add column if not exists chatgpt_custom_gpt_url text;
```

> **Installation:** Run the above SQL in **Supabase Dashboard > SQL Editor > New query**. It is safe to re-run and only adds what is missing.

---

## 3. Endpoints & API Contracts

### A. Dashboard Endpoints (Protected by Admin Session Cookie)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/content-requests` | Creates a new content request with status `pending_chatgpt`. |
| `GET` | `/api/content-requests` | Lists recent content requests (`limit`, `status` query params). |
| `GET` | `/api/content-requests/{id}` | Fetches details and live status of a single content request. |
| `POST` | `/api/content-requests/{id}/cancel` | Cancels a pending request. |
| `PATCH` | `/api/settings` | Updates application settings including `chatgpt_custom_gpt_url`. |

### B. Machine-to-Machine Integration Actions (Protected by `INTEGRATION_API_KEY`)

All Custom GPT requests must include the HTTP header:
```http
Authorization: Bearer <INTEGRATION_API_KEY>
```

#### 1. `getChatGPTContentRequest`
- **Path:** `GET /api/chatgpt/requests/{requestId}`
- **Behavior:**
  - Fetches the stored request details.
  - Automatically transitions status from `pending_chatgpt` to `processing`.
  - Rejects cancelled requests with HTTP 409.
  - Does NOT call any AI model or image generator.
- **Response (200 OK):**
```json
{
  "requestId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "status": "processing",
  "topic": "Why compound interest beats day trading over 20 years",
  "platform": "facebook",
  "contentType": "Investing Tips",
  "tone": "Inspiring & Uplifting",
  "audience": "Long-term wealth builders",
  "imageStyle": "Modern Photorealistic",
  "aspectRatio": "1:1",
  "targetPageId": "100000000000001",
  "targetPageName": "Acme Media Studio",
  "constraints": {
    "maxTitleLength": 120,
    "maxDescriptionLength": 500,
    "maxHashtags": 15,
    "requireHostedImage": true,
    "mustNotPublishAutomatically": true
  },
  "createdAt": "2026-10-18T16:00:00Z"
}
```

#### 2. `createChatGPTPost` (Extended with `requestId`)
- **Path:** `POST /api/chatgpt/posts`
- **Request Body:**
```json
{
  "title": "Patience Beats Market Timing Every Single Decade",
  "description": "Consistent dollar-cost averaging into index funds historically outperforms 95% of active traders. Which strategy has served your portfolio best?",
  "hashtags": ["InvestingTips", "WealthBuilding", "CompoundInterest"],
  "imageUrl": "https://dlzttvnwhiygnlumkbvg.supabase.co/storage/v1/object/public/post-images/chatgpt/2026-10-18/uuid.png",
  "requestId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "pageId": "100000000000001",
  "pageName": "Sample Facebook Page"
}
```
- **Behavior:**
  - Staged draft in `posts` table with status `draft`.
  - Automatically links `post_id` to the content request.
  - Updates request status to `draft_created`.
  - Records `review_url: "/dashboard/queue?post=<postId>"`.
  - **Idempotency:** Re-submitting the same `requestId` returns the existing draft with HTTP 200 without creating duplicates.

#### 3. `failChatGPTContentRequest`
- **Path:** `POST /api/chatgpt/requests/{requestId}/fail`
- **Request Body:**
```json
{
  "error": "DALL-E generation failed content policy check for this topic."
}
```
- **Behavior:** Marks request as `failed` with safe error details visible in the dashboard.

---

## 4. How to Configure the Custom GPT URL

You can configure your Custom GPT URL in either of two ways:

1. **In Application Settings (Recommended):**
   - Open **Settings** (`/dashboard/settings`).
   - Under **Custom GPT Assistant (Vetechno FB Auto Post)**, enter your Custom GPT URL:
     `https://chatgpt.com/g/g-xxxxxxxx-vetechno-fb-auto-post`
   - Click outside the field to save.
2. **Via Environment Variable:**
   - In `.env.local` or Vercel project environment variables:
     ```env
     NEXT_PUBLIC_CHATGPT_CUSTOM_GPT_URL=https://chatgpt.com/g/g-xxxxxxxx-vetechno-fb-auto-post
     ```

Once configured, the **"Open Custom GPT"** button on the Generate page launches your assistant directly in a new tab.

---

## 5. Custom GPT Instructions (for Vetechno FB Auto Post)

Paste or update this section in your Custom GPT Instructions:

```markdown
### Content Request Bridge Workflow

When the user gives you a queued content request (e.g. "Process my queued content request [REQUEST_ID]"):

1. **Retrieve Authoritative Request**: Call `getChatGPTContentRequest` with the provided `requestId`.
2. **THE TOPIC IS THE ABSOLUTE SOURCE OF TRUTH**:
   - Extract the `topic` field from the returned record. This is the non-negotiable primary subject of the entire post.
   - The `contentCategory` (e.g. "Motivational") and `tone` (e.g. "Inspiring & Uplifting") are ONLY stylistic guides. NEVER replace a financial, technical, educational, or specific topic with generic motivational quotes, daily kindness, positive habits, sunrise artwork, or inspirational notebooks.
   - Do NOT let previous chat history, default examples, or general pleasantries override the retrieved topic.
3. **Formulate a Concrete Visual Scene First**:
   - Before generating an image, craft a prompt that specifically visualizes the retrieved topic.
   - For finance/investing topics (e.g., index funds, dollar-cost averaging vs emotional trading): depict a clean, high-aesthetic financial education infographic or modern trading scene showing disciplined long-term DCA growth curves vs chaotic emotional day-trading swings. Use a premium navy, gold, and dark green palette.
   - Do NOT create generic abstract art, sunrise landscapes, coffee cups, or notebooks.
   - Do NOT invent specific numerical returns or guarantees.
4. **Generate the Image**:
   - Use ChatGPT's built-in DALL-E Image Generation capability to render the formulated visual concept with the requested `aspectRatio`.
5. **Import the Exact Image**:
   - Immediately call `importChatGPTImage` passing the resulting image reference in `openaiFileIdRefs`.
   - Never call `generateChatGPTImage` or substitute another image generator.
6. **Write the Topic-Aligned Copy**:
   - Write a title (<=120 characters) and caption (<=500 characters) specifically explaining the retrieved topic.
   - For educational topics, provide balanced, accurate information (e.g., DCA removes emotional market timing, but does not eliminate market risk or guarantee profits). End with an engaging question for readers and up to 15 relevant hashtags.
7. **Create the Unpublished Draft**:
   - Call `createChatGPTPost` with:
     - `title`
     - `description`
     - `hashtags`
     - `imageUrl` (the verified hosted Supabase URL from step 5)
     - `requestId` (the exact requestId from step 1)
     - `pageId` (the targetPageId from step 1 if present)
     - `pageName` (the targetPageName from step 1 if present)
8. **Present for Dashboard Review**:
   - Show the complete image, title, caption, post ID, target Page, and dashboard review URL.
   - Inform the user that the post is saved as an unapproved draft in their dashboard queue. Do NOT approve or publish the post.
```

---

## 6. Distinction Between App-Side and ChatGPT-Only Workflows

| Feature | App-Side Generation (`/api/generate/*`) | ChatGPT-Only Bridge (`/dashboard/generate`) |
|---|---|---|
| **AI Provider** | Requires Gemini / Groq / OpenAI API keys | Uses your existing ChatGPT Plus/Team subscription |
| **Image Engine** | Free stock photos (Pexels) or API models | Built-in ChatGPT DALL-E generation |
| **Execution** | Runs in browser/serverless request | Runs interactively in ChatGPT conversation |
| **Handoff** | Direct in dashboard | Request ID + action handoff |
| **Cost** | Free tiers or paid API tokens | $0 additional API cost |
| **Approval** | Human review in Queue | Human review in Queue |

---

## 7. Safety, Idempotency & Failure Recovery

1. **Recovery from Browser Refresh:**
   - When a request is created, the URL is updated with `?request=<id>`.
   - Refreshing or reopening `/dashboard/generate?request=<id>` restores the active request and its live status.
2. **Safe Idempotency:**
   - If ChatGPT calls `createChatGPTPost` multiple times with the same `requestId`, the backend detects the existing draft and returns HTTP 200 with the staged draft instead of creating duplicates.
3. **No Blind Publishing:**
   - The Custom GPT can never approve or publish a post as part of the content request workflow. Posts always enter the queue as unapproved drafts.
4. **Failure Transparency:**
   - If image generation or import fails, the GPT calls `failChatGPTContentRequest`, and the dashboard displays a clear error explanation.
