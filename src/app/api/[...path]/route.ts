import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifySessionToken,
} from "@/lib/auth/session";
import {
  validateIntegrationAuth,
  computePostContentHash,
  createApprovalToken,
  verifyApprovalToken,
  issueApprovalToken,
  verifyAndConsumeApprovalToken,
  releaseUnpublishedApprovalToken,
  StoragePersistenceError,
} from "@/lib/auth/integration";
import { generateContent, DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/text";
import {
  generateImage,
  ingestExternalImage,
  ingestImageBytes,
  ingestOpenAiFileRefs,
  isImageHostAllowed,
} from "@/lib/ai/image";
import { getTrendingTopics } from "@/lib/trends";
import {
  createPostRecord,
  deletePostRecord,
  getPost,
  listDuePosts,
  listPosts,
  updatePostRecord,
} from "@/lib/db/posts";
import { getSettings, updateSettings } from "@/lib/db/settings";
import { listTemplates, saveTemplate, deleteTemplate } from "@/lib/db/templates";
import { TEMPLATE_PRESETS } from "@/lib/templates/presets";
import {
  addTopics,
  deleteTopic,
  listTopics,
  MAX_TOPIC_LENGTH,
  nextTopic,
  TopicsTableMissingError,
  updateTopic,
} from "@/lib/db/topics";
import {
  fetchAccount,
  fetchPages,
  missingPermissions,
  FacebookNotConnectedError,
} from "@/lib/facebook/client";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
} from "@/lib/facebook/oauth";
import { getFacebookCredentials, isFacebookConfigured } from "@/lib/facebook/credentials";
import { OAUTH_STATE_COOKIE } from "@/lib/facebook/oauth-state";
import { publishPostNow } from "@/lib/facebook/publish";
import { maybeRunAutopilot } from "@/lib/autopilot";
import { supabaseAdmin } from "@/lib/supabase/server";
import { facebookPostUrl, type PostStatus, type ImageSource } from "@/lib/types";

/**
 * Every API endpoint lives in this one catch-all handler on purpose.
 *
 * Next.js turns each `route.ts` into its own serverless function, and this
 * app's endpoints put the deployment over Vercel's per-deployment function
 * limit on the Hobby plan — the build succeeded every time and then died at
 * "Deploying outputs" with no log line explaining why. Collapsing them into one
 * dispatcher takes the deployment from ~16 functions to 2. The endpoint URLs
 * and behaviour are unchanged; only the file layout moved, and all real logic
 * still lives in `src/lib/*`.
 */

export const maxDuration = 60;

type Ctx = { params: Promise<{ path: string[] }> };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function notFound() {
  return json({ error: "Not found." }, 404);
}

function unauthorized() {
  return json({ error: "Unauthorized." }, 401);
}

/**
 * Routes reachable without the admin session.
 *
 * Everything else requires it. This app stores Meta app credentials and
 * non-expiring Page tokens, and the middleware deliberately does not cover
 * `/api/*`, so without this check the whole API — read settings, publish,
 * delete, disconnect — would be open to anyone who knew the deployment's URL.
 * The OAuth callback is exempt because it is a redirect back from Facebook and
 * is already protected by its single-use `state` cookie.
 */
const OPEN_ROUTES = new Set(["auth/login", "auth/logout", "facebook/oauth/callback"]);

async function hasSession(req: Request): Promise<boolean> {
  const token = req.headers
    .get("cookie")
    ?.split("; ")
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  return verifySessionToken(token);
}

/**
 * The cron route authenticates with CRON_SECRET when one is set. When it is
 * not, it falls back to requiring the admin session rather than being open —
 * an unset optional variable must not silently expose a publishing endpoint.
 */
async function cronAuthorized(req: Request, url: URL): Promise<boolean> {
  if (!env.cronSecret) return hasSession(req);
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${env.cronSecret}` || url.searchParams.get("secret") === env.cronSecret;
}

const INTEGRATION_ROUTES = new Set(["health", "chatgpt/posts", "chatgpt/images"]);

function isIntegrationRoute(route: string): boolean {
  if (INTEGRATION_ROUTES.has(route)) return true;
  if (route.startsWith("chatgpt/posts/")) return true;
  if (route.startsWith("chatgpt/images/")) return true;
  return false;
}

async function guard(route: string, req: Request, url: URL): Promise<Response | null> {
  if (OPEN_ROUTES.has(route)) return null;
  // ChatGPT / M2M integration routes strictly require Bearer INTEGRATION_API_KEY.
  // The dashboard session cookie is deliberately rejected here to avoid cross-context confusion.
  if (isIntegrationRoute(route)) {
    return validateIntegrationAuth(req) ? null : unauthorized();
  }
  if (route === "cron/process-queue") {
    return (await cronAuthorized(req, url)) ? null : unauthorized();
  }
  return (await hasSession(req)) ? null : unauthorized();
}

async function safely(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "Unexpected server error." }, 500);
  }
}

/** Tokens and API keys must never reach the browser, so they are stripped in one place. */
async function publicSettings(settings: Awaited<ReturnType<typeof getSettings>>) {
  const {
    facebook_user_token,
    default_page_token,
    facebook_app_secret,
    gemini_api_key,
    groq_api_key,
    openai_api_key,
    openrouter_api_key,
    ...safe
  } = settings;
  return {
    ...safe,
    system_prompt: settings.system_prompt || DEFAULT_SYSTEM_PROMPT,
    ai_provider: settings.ai_provider || "auto",
    gemini_configured: Boolean(gemini_api_key || env.geminiApiKey),
    groq_configured: Boolean(groq_api_key || env.groqApiKey),
    openai_configured: Boolean(openai_api_key || env.openaiApiKey),
    openrouter_configured: Boolean(openrouter_api_key || env.openrouterApiKey),
    gemini_enabled: settings.gemini_enabled ?? true,
    groq_enabled: settings.groq_enabled ?? true,
    openai_enabled: settings.openai_enabled ?? false,
    openrouter_enabled: settings.openrouter_enabled ?? false,
    // The App ID is public (it travels in the OAuth URL); the secret never
    // leaves the server, so the UI only learns whether one is stored.
    facebook_app_secret_set: Boolean(facebook_app_secret),
    facebook_connected: Boolean(facebook_user_token),
    facebook_page_ready: Boolean(default_page_token),
    facebook_configured: await isFacebookConfigured(),
  };
}

/* ------------------------------------------------------------------ GET */

export async function GET(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  const route = path.join("/");
  const url = new URL(req.url);

  return safely(async () => {
    const denied = await guard(route, req, url);
    if (denied) return denied;

    if (route === "trends") {
      return json(await getTrendingTopics());
    }

    if (route === "settings") {
      return json(await publicSettings(await getSettings()));
    }

    if (route === "posts") {
      const status = url.searchParams.get("status");
      const posts = await listPosts({
        status: status ? (status.split(",") as PostStatus[]) : undefined,
      });
      return json({ posts });
    }

    if (route === "facebook/pages") {
      return getPages(url.searchParams.get("refresh") === "1");
    }

    if (route === "topics") {
      const settings = await getSettings();
      const source = settings.topic_source ?? "mine";
      try {
        const [topics, next] = await Promise.all([listTopics(), nextTopic()]);
        return json({ ready: true, source, topics, nextId: next?.id ?? null });
      } catch (err) {
        // An install that predates topics: report it so the screen can say
        // how to upgrade, rather than failing the request.
        if (err instanceof TopicsTableMissingError) {
          return json({ ready: false, source, topics: [], nextId: null, message: err.message });
        }
        throw err;
      }
    }

    if (route === "templates") {
      const userTemplates = await listTemplates();
      return json({ templates: [...userTemplates, ...TEMPLATE_PRESETS] });
    }

    if (route === "facebook/oauth/start") {
      const creds = await getFacebookCredentials(url.origin);
      if (!creds) {
        return redirectToSettings(
          url.origin,
          "error",
          "Add your Meta App ID and App Secret in Settings first, then try connecting again."
        );
      }

      const state = crypto.randomUUID();
      const res = NextResponse.redirect(buildAuthorizeUrl(creds, state));
      res.cookies.set(OAUTH_STATE_COOKIE, state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 600,
      });
      return res;
    }

    if (route === "facebook/oauth/callback") {
      return oauthCallback(req, url);
    }

    if (route === "cron/process-queue") {
      return runCron(req, url);
    }

    if (route === "health") {
      const db = supabaseAdmin();
      const { data: settings, error: dbError } = await db
        .from("app_settings")
        .select("default_page_id")
        .eq("id", 1)
        .single();

      if (dbError) {
        return json({ status: "unavailable", database: "error" }, 503);
      }

      return json({
        status: "ok",
        database: "ok",
        facebookPageConfigured: Boolean(settings?.default_page_id),
      });
    }

    // chatgpt/posts/<id>
    if (path.length === 3 && path[0] === "chatgpt" && path[1] === "posts") {
      const id = path[2];
      const post = await getPost(id);
      if (!post) return notFound();

      // Reject corrupted or incomplete post records
      if (!post.title || !post.image_url) {
        return json({ error: "Post record is missing required fields (title, image_url)." }, 422);
      }

      const settings = await getSettings();
      const pageId = post.page_id ?? settings.default_page_id ?? "";
      const contentHash = computePostContentHash({
        postId: post.id,
        title: post.title,
        description: post.description,
        hashtags: post.hashtags,
        imageUrl: post.image_url,
        pageId,
        linkUrl: post.link_url,
        utmSuffix: settings.utm_suffix,
      });

      const isContentUnchangedSinceApproval = !post.approval_content_hash || post.approval_content_hash === contentHash;

      return json({
        postId: post.id,
        status: post.status === "draft" ? "pending_review" : post.status,
        title: post.title,
        description: post.description,
        hashtags: post.hashtags || [],
        imageUrl: post.image_url,
        pageName: post.page_name,
        contentHash,
        reviewUrl: `/dashboard/queue?post=${post.id}`,
        approvedByUser: Boolean(post.approved_by_user),
        approvedAt: post.approved_at,
        isContentUnchangedSinceApproval,
        facebookPostId: post.facebook_post_id,
        facebookPostUrl: post.facebook_post_id ? facebookPostUrl(post.facebook_post_id) : null,
        postedAt: post.posted_at,
        errorMessage: post.error_message,
      });
    }

    return notFound();
  });
}

/* ----------------------------------------------------------------- POST */

const LoginBody = z.object({ password: z.string() });

const ContentBody = z.object({
  topic: z.string().trim().min(2).max(200),
  prompt: z.string().max(10000).optional(),
});

const ImageBody = z.object({
  prompt: z.string().trim().min(2).max(300),
  source: z.enum(["ai", "stock", "mixed"]),
});

const CreatePostBody = z.object({
  topic: z.string().min(1).max(200),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  hashtags: z.array(z.string()).max(15).default([]),
  imageUrl: z.string().url(),
  imageSource: z.enum(["ai", "stock"]),
  linkUrl: z.string().url().optional().or(z.literal("")),
  pageId: z.string().min(1),
  pageName: z.string().min(1),
  action: z.enum(["draft", "schedule", "post_now"]),
  scheduledAt: z.string().datetime().optional(),
});

const DefaultPageBody = z.object({ pageId: z.string().min(1) });

// A pasted list is split client-side into lines; 500 is far more than anyone
// types, and bounds a single request.
const AddTopicsBody = z.object({
  texts: z.array(z.string().max(MAX_TOPIC_LENGTH * 2)).min(1).max(500),
});

const CredentialsBody = z.object({
  appId: z.string().trim().min(5).max(64),
  // Optional so the UI can save an edited App ID without re-typing a secret it
  // never received in the first place.
  appSecret: z.string().trim().min(10).max(128).optional(),
  // Empty string clears it, for an app that uses classic Facebook Login.
  configId: z.string().trim().max(64).optional(),
});

const ImportChatGPTImageBody = z
  .object({
    openaiFileIdRefs: z.array(z.any()).max(10).optional(),
    imageUrl: z
      .string()
      .trim()
      .min(1, "imageUrl cannot be empty.")
      .max(4096, "imageUrl cannot exceed 4096 characters.")
      .url("Invalid imageUrl format. Must be an absolute HTTPS URL.")
      .refine((u) => u.startsWith("https://"), {
        message: "Only secure HTTPS image URLs are permitted.",
      })
      .optional(),
    imageBase64: z.string().trim().min(1, "imageBase64 cannot be empty.").optional(),
    prompt: z
      .string()
      .trim()
      .max(4000, "prompt cannot exceed 4000 characters.")
      .optional(),
  })
  .refine(
    (data) =>
      Boolean(
        (data.openaiFileIdRefs && data.openaiFileIdRefs.length > 0) ||
        data.imageUrl ||
        data.imageBase64
      ),
    {
      message:
        "IMAGE_INPUT_MISSING: Either imageUrl (an approved HTTPS image URL), openaiFileIdRefs (attached image from ChatGPT), or imageBase64 is required. To generate an image from a topic prompt, call /api/chatgpt/images/generate instead.",
    }
  );

const GenerateChatGPTImageBody = z.object({
  prompt: z.string().trim().min(2, "Prompt must be at least 2 characters.").max(500),
});

const CreateChatGPTPostBody = z
  .object({
    title: z.string().trim().min(1, "title is required (1-120 characters).").max(120),
    description: z.string().trim().min(1, "description is required (1-500 characters).").max(500),
    hashtags: z.array(z.string().trim().min(1).max(50)).max(15).default([]),
    imageUrl: z
      .string()
      .trim()
      .min(1, "imageUrl cannot be empty. An authentic HTTPS image URL from an approved OpenAI/DALL-E host is required.")
      .max(4096, "imageUrl cannot exceed 4096 characters.")
      .url("Invalid imageUrl format. Must be a valid absolute HTTPS URL.")
      .refine((url) => url.startsWith("https://"), {
        message: "Only secure HTTPS image URLs are permitted.",
      })
      .refine(
        (url) => {
          try {
            return isImageHostAllowed(new URL(url).hostname);
          } catch {
            return false;
          }
        },
        {
          message:
            "Image host is not in the approved image-hosting domain allowlist (e.g. files.oaiusercontent.com, oaidalleapiprodscus.blob.core.windows.net).",
        }
      )
      .optional(),
    openaiFileIdRefs: z.array(z.any()).max(10).optional(),
    idempotencyKey: z.string().trim().min(1).max(128).optional(),
  })
  .refine(
    (data) =>
      Boolean(
        (data.openaiFileIdRefs && data.openaiFileIdRefs.length > 0) ||
        data.imageUrl
      ),
    {
      message:
        "IMAGE_INPUT_MISSING: Either imageUrl (a verified hosted image URL from importChatGPTImage) or openaiFileIdRefs (attached image) is required.",
    }
  );

const ApproveChatGPTPostBody = z.object({
  userConfirmed: z.boolean(),
  contentHash: z.string().trim().min(1),
});

const PublishChatGPTPostBody = z.object({
  approvalToken: z.string().trim().min(10),
  dryRun: z.boolean().optional(),
  forceRetry: z.boolean().optional(),
});

// In-flight concurrency lock to serialize concurrent creation requests using the same idempotency key
const creationLocks = new Map<string, Promise<{ body: unknown; status: number }>>();

export async function POST(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  const route = path.join("/");
  const url = new URL(req.url);

  return safely(async () => {
    const denied = await guard(route, req, url);
    if (denied) return denied;

    if (route === "auth/login") {
      const parsed = LoginBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success || parsed.data.password !== env.adminPassword) {
        return json({ error: "Incorrect password." }, 401);
      }
      const res = json({ ok: true });
      res.cookies.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions);
      return res;
    }

    if (route === "auth/logout") {
      const res = json({ ok: true });
      res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
      return res;
    }

    if (route === "generate/content") {
      const parsed = ContentBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return json({ error: "A topic (2-200 characters) is required." }, 400);
      return json(await generateContent(parsed.data.topic, parsed.data.prompt));
    }

    if (route === "generate/image") {
      const parsed = ImageBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return json({ error: "A prompt and image source are required." }, 400);
      try {
        return json(await generateImage(parsed.data.prompt, parsed.data.source));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : "Image generation failed." }, 502);
      }
    }

    if (route === "posts") {
      const parsed = CreatePostBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return json({ error: parsed.error.issues[0]?.message ?? "Invalid post." }, 400);
      }
      const b = parsed.data;
      if (b.action === "schedule" && !b.scheduledAt) {
        return json({ error: "scheduledAt is required to schedule a post." }, 400);
      }

      const post = await createPostRecord({
        topic: b.topic,
        title: b.title,
        description: b.description,
        hashtags: b.hashtags,
        image_url: b.imageUrl,
        image_source: b.imageSource,
        link_url: b.linkUrl || null,
        page_id: b.pageId,
        page_name: b.pageName,
        scheduled_at: b.action === "schedule" ? b.scheduledAt! : null,
        status: b.action === "schedule" ? "scheduled" : "draft",
      });

      if (b.action === "post_now") {
        return json({ post: await publishPostNow(post.id) });
      }
      return json({ post });
    }

    if (route === "topics") {
      const parsed = AddTopicsBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return json({ error: "Send at least one topic." }, 400);
      try {
        return json(await addTopics(parsed.data.texts));
      } catch (err) {
        if (err instanceof TopicsTableMissingError) return json({ error: err.message }, 409);
        throw err;
      }
    }

    // posts/<id>/post-now
    if (path.length === 3 && path[0] === "posts" && path[2] === "post-now") {
      try {
        return json({ post: await publishPostNow(path[1]) });
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : "Failed to publish." }, 502);
      }
    }

    // posts/<id>/approve — authenticated dashboard human approval action
    if (path.length === 3 && path[0] === "posts" && path[2] === "approve") {
      const id = path[1];
      const post = await getPost(id);
      if (!post) return notFound();
      if (post.status === "posted") {
        return json({ error: "Post has already been published to Facebook." }, 400);
      }

      const settings = await getSettings();
      const pageId = post.page_id ?? settings.default_page_id;
      if (!pageId) {
        return json({ error: "Destination Facebook Page is not configured in settings." }, 409);
      }

      const currentHash = computePostContentHash({
        postId: post.id,
        title: post.title,
        description: post.description,
        hashtags: post.hashtags,
        imageUrl: post.image_url,
        pageId,
        linkUrl: post.link_url,
        utmSuffix: settings.utm_suffix,
      });

      const updated = await updatePostRecord(post.id, {
        approved_by_user: true,
        approved_at: new Date().toISOString(),
        approval_content_hash: currentHash,
      });

      return json({
        ok: true,
        postId: updated.id,
        approvedByUser: true,
        approvedAt: updated.approved_at,
        approvalContentHash: updated.approval_content_hash,
        message: "Post successfully approved by human administrator in dashboard.",
      });
    }

    if (route === "facebook/default-page") {
      const parsed = DefaultPageBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return json({ error: "pageId is required." }, 400);

      // The Page token is fetched fresh rather than taken from the client, so
      // a token never has to travel to the browser and back.
      try {
        const page = (await fetchPages()).find((p) => p.id === parsed.data.pageId);
        if (!page) return json({ error: "That Page is not available on this account." }, 404);

        await updateSettings({
          default_page_id: page.id,
          default_page_name: page.name,
          default_page_token: page.access_token,
        });
        return json({ ok: true, pageName: page.name });
      } catch (err) {
        if (err instanceof FacebookNotConnectedError) return json({ error: err.message }, 409);
        throw err;
      }
    }

    if (route === "facebook/credentials") {
      const parsed = CredentialsBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return json({ error: "Enter a valid App ID, and an App Secret of at least 10 characters." }, 400);
      }

      const existing = await getSettings();
      if (!parsed.data.appSecret && !existing.facebook_app_secret) {
        return json({ error: "An App Secret is required the first time." }, 400);
      }

      await updateSettings({
        facebook_app_id: parsed.data.appId,
        ...(parsed.data.appSecret ? { facebook_app_secret: parsed.data.appSecret } : {}),
        ...(parsed.data.configId !== undefined
          ? { facebook_config_id: parsed.data.configId || null }
          : {}),
      });
      return json({ ok: true, redirectUri: `${url.origin}/api/facebook/oauth/callback` });
    }

    if (route === "facebook/credentials/clear") {
      await updateSettings({
        facebook_app_id: null,
        facebook_app_secret: null,
        facebook_config_id: null,
      });
      return json({ ok: true });
    }

    if (route === "templates") {
      const body = await req.json().catch(() => null);
      if (!body || !body.name || !body.ratio) {
        return json({ error: "Template name and ratio are required." }, 400);
      }
      try {
        const saved = await saveTemplate(body);
        return json({ template: saved });
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : "Failed to save template." }, 500);
      }
    }

    if (route === "upload/image") {
      const body = await req.json().catch(() => null);
      if (!body?.dataUrl) {
        return json({ error: "dataUrl is required." }, 400);
      }
      const matches = (body.dataUrl as string).match(/^data:([A-Za-z0-9-+/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return json({ error: "Invalid dataUrl format." }, 400);
      }
      const contentType = matches[1];
      const buffer = Buffer.from(matches[2], "base64");
      const ext = contentType.includes("png")
        ? "png"
        : contentType.includes("webp")
          ? "webp"
          : "jpg";
      const path = `templates/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;

      const db = supabaseAdmin();
      const { error } = await db.storage.from("post-images").upload(path, buffer, {
        contentType,
        upsert: false,
      });
      if (error) throw new Error(`Storage upload failed: ${error.message}`);

      const { data } = db.storage.from("post-images").getPublicUrl(path);
      return json({ url: data.publicUrl });
    }

    if (route === "chatgpt/images/generate") {
      const parsed = GenerateChatGPTImageBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return json({ error: parsed.error.issues[0]?.message ?? "Invalid generation prompt." }, 400);
      }
      try {
        const res = await generateImage(parsed.data.prompt, "ai");
        return json(
          {
            url: res.url,
            verified: true,
            source: "ai",
            message: "Image generated, verified, and hosted in Supabase Storage.",
          },
          201
        );
      } catch (err: any) {
        return json({ error: `IMAGE_GENERATION_FAILED: ${err.message || "Failed to generate image."}` }, 500);
      }
    }

    if (route === "chatgpt/images") {
      const parsed = ImportChatGPTImageBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? "Invalid image request.";
        const errorText = msg.startsWith("IMAGE_") ? msg : `IMAGE_INPUT_MISSING: ${msg}`;
        return json({ error: errorText }, 400);
      }
      const b = parsed.data;

      try {
        // Priority 1: User-attached image from Custom GPT via openaiFileIdRefs
        if (b.openaiFileIdRefs && b.openaiFileIdRefs.length > 0) {
          const res = await ingestOpenAiFileRefs(b.openaiFileIdRefs);
          return json(
            {
              url: res.url,
              verified: true,
              source: "import",
              sha256: res.sha256,
              fileName: res.fileName,
              mimeType: res.mimeType,
              byteLength: res.byteLength,
              message: "Attached image successfully verified, hosted in Supabase Storage, and exact bytes preserved.",
            },
            201
          );
        }

        // Priority 2: Verified external HTTPS image URL
        if (b.imageUrl) {
          const res = await ingestExternalImage(b.imageUrl);
          return json(
            {
              url: res.url,
              verified: true,
              source: "import",
              sha256: res.sha256,
              message: "Image successfully verified and hosted in Supabase Storage.",
            },
            201
          );
        }

        // Priority 3: Uploaded raw image bytes
        if (b.imageBase64) {
          const raw = b.imageBase64.replace(/^data:image\/[a-z0-9.+_-]+;base64,/i, "");
          const buffer = Buffer.from(raw, "base64");
          const res = await ingestImageBytes(buffer);
          return json(
            {
              url: res.url,
              verified: true,
              source: "upload",
              sha256: res.sha256,
              message: "Image successfully uploaded, verified, and hosted in Supabase Storage.",
            },
            201
          );
        }

        return json(
          {
            error:
              "IMAGE_INPUT_MISSING: Either imageUrl (an approved HTTPS image URL), openaiFileIdRefs (attached image from ChatGPT), or imageBase64 is required. To generate an image from a topic prompt, call /api/chatgpt/images/generate instead.",
          },
          400
        );
      } catch (err: any) {
        const message = err.message || "Failed to process image.";
        const formatted = message.startsWith("IMAGE_") ? message : `IMAGE_IMPORT_FAILED: ${message}`;
        return json({ error: formatted }, 400);
      }
    }

    if (route === "chatgpt/posts") {
      const parsed = CreateChatGPTPostBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return json({ error: parsed.error.issues[0]?.message ?? "Invalid post data." }, 400);
      }
      const b = parsed.data;

      // Concurrency handling for same idempotencyKey
      if (b.idempotencyKey) {
        const key = b.idempotencyKey;
        const existingPromise = creationLocks.get(key);
        if (existingPromise) {
          const res = await existingPromise;
          return json(res.body, res.status);
        }
      }

      const executeCreation = async (): Promise<{ body: unknown; status: number }> => {
        const db = supabaseAdmin();
        const settings = await getSettings();

        if (b.idempotencyKey) {
          const { data: existing } = await db
            .from("posts")
            .select("*")
            .eq("topic", `chatgpt:${b.idempotencyKey}`)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existing) {
            const contentHash = computePostContentHash({
              postId: existing.id,
              title: existing.title,
              description: existing.description,
              hashtags: existing.hashtags,
              imageUrl: existing.image_url,
              pageId: existing.page_id || settings.default_page_id || "",
              linkUrl: existing.link_url,
              utmSuffix: settings.utm_suffix,
            });
            return {
              status: 200,
              body: {
                postId: existing.id,
                status: existing.status === "draft" ? "pending_review" : existing.status,
                title: existing.title,
                description: existing.description,
                hashtags: existing.hashtags,
                imageUrl: existing.image_url,
                pageName: existing.page_name,
                contentHash,
                reviewUrl: `/dashboard/queue?post=${existing.id}`,
                approvalRequired: true,
                message:
                  "Existing post returned for idempotency key. Please display the complete preview to the user. " +
                  "Ask: 'Do you approve publishing this post to Facebook?' and wait for explicit confirmation in the next turn before calling approve.",
              },
            };
          }
        }

        if (!settings.default_page_id || !settings.default_page_token) {
          return {
            status: 409,
            body: {
              error:
                "No Facebook Page is currently configured in the application. Please select a default Page in Settings first.",
            },
          };
        }

        let ingested: { url: string; source: ImageSource; sha256?: string };
        try {
          if (b.openaiFileIdRefs && b.openaiFileIdRefs.length > 0) {
            const res = await ingestOpenAiFileRefs(b.openaiFileIdRefs);
            ingested = { url: res.url, source: "ai", sha256: res.sha256 };
          } else if (b.imageUrl) {
            const res = await ingestExternalImage(b.imageUrl);
            ingested = { url: res.url, source: "ai", sha256: res.sha256 };
          } else {
            return {
              status: 400,
              body: {
                error: "IMAGE_INPUT_MISSING: Either imageUrl (a verified hosted image URL from importChatGPTImage) or openaiFileIdRefs (attached image) is required.",
              },
            };
          }
        } catch (err: any) {
          const message = err instanceof Error ? err.message : "Failed to import image.";
          const formatted = message.startsWith("IMAGE_") ? message : `IMAGE_IMPORT_FAILED: ${message}`;
          return {
            status: 400,
            body: {
              error: formatted,
            },
          };
        }

        try {
          const post = await createPostRecord({
            topic: b.idempotencyKey ? `chatgpt:${b.idempotencyKey}` : "chatgpt",
            title: b.title,
            description: b.description,
            hashtags: b.hashtags,
            image_url: ingested.url,
            image_source: ingested.source,
            link_url: null,
            page_id: settings.default_page_id,
            page_name: settings.default_page_name,
            scheduled_at: null,
            status: "draft",
          });

          const contentHash = computePostContentHash({
            postId: post.id,
            title: post.title,
            description: post.description,
            hashtags: post.hashtags,
            imageUrl: post.image_url,
            pageId: settings.default_page_id,
            linkUrl: post.link_url,
            utmSuffix: settings.utm_suffix,
          });

          return {
            status: 201,
            body: {
              postId: post.id,
              status: "pending_review",
              title: post.title,
              description: post.description,
              hashtags: post.hashtags,
              imageUrl: post.image_url,
              pageName: post.page_name,
              contentHash,
              reviewUrl: `/dashboard/queue?post=${post.id}`,
              approvalRequired: true,
              message:
                "Post staged and awaiting explicit user review. Please display the complete image preview and caption to the user. " +
                "Ask: 'Do you approve publishing this post to Facebook?' and wait for explicit confirmation in the next turn before calling approve. " +
                "Alternatively, the user can review and approve directly in the authenticated dashboard at reviewUrl.",
            },
          };
        } catch (insertErr) {
          // If a concurrent insert succeeded or unique constraint fired, return existing
          if (b.idempotencyKey) {
            const { data: existingAfterConflict } = await db
              .from("posts")
              .select("*")
              .eq("topic", `chatgpt:${b.idempotencyKey}`)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (existingAfterConflict) {
              const contentHash = computePostContentHash({
                postId: existingAfterConflict.id,
                title: existingAfterConflict.title,
                description: existingAfterConflict.description,
                hashtags: existingAfterConflict.hashtags,
                imageUrl: existingAfterConflict.image_url,
                pageId: existingAfterConflict.page_id || settings.default_page_id || "",
                linkUrl: existingAfterConflict.link_url,
                utmSuffix: settings.utm_suffix,
              });
              return {
                status: 200,
                body: {
                  postId: existingAfterConflict.id,
                  status:
                    existingAfterConflict.status === "draft"
                      ? "pending_review"
                      : existingAfterConflict.status,
                  title: existingAfterConflict.title,
                  description: existingAfterConflict.description,
                  hashtags: existingAfterConflict.hashtags,
                  imageUrl: existingAfterConflict.image_url,
                  pageName: existingAfterConflict.page_name,
                  contentHash,
                  reviewUrl: `/dashboard/queue?post=${existingAfterConflict.id}`,
                  approvalRequired: true,
                  message:
                    "Existing post returned for idempotency key. Please review preview with user before approving.",
                },
              };
            }
          }
          throw insertErr;
        }
      };

      if (b.idempotencyKey) {
        const p = executeCreation();
        creationLocks.set(b.idempotencyKey, p);
        try {
          const res = await p;
          return json(res.body, res.status);
        } finally {
          creationLocks.delete(b.idempotencyKey);
        }
      } else {
        const res = await executeCreation();
        return json(res.body, res.status);
      }
    }

    // chatgpt/posts/<id>/approve
    if (path.length === 4 && path[0] === "chatgpt" && path[1] === "posts" && path[3] === "approve") {
      const id = path[2];
      const post = await getPost(id);
      if (!post) return notFound();

      if (post.status === "posted") {
        return json({ error: "Post has already been published to Facebook." }, 400);
      }

      if (post.status === "publishing") {
        return json({ error: "Post is currently being published by another request." }, 409);
      }

      const parsed = ApproveChatGPTPostBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success || !parsed.data.userConfirmed) {
        return json(
          { error: "Explicit user confirmation (userConfirmed: true) is required to approve the post." },
          400
        );
      }

      const settings = await getSettings();
      const pageId = post.page_id ?? settings.default_page_id;
      if (!pageId) {
        return json({ error: "Destination Facebook Page is not configured." }, 409);
      }

      const currentHash = computePostContentHash({
        postId: post.id,
        title: post.title,
        description: post.description,
        hashtags: post.hashtags,
        imageUrl: post.image_url,
        pageId,
        linkUrl: post.link_url,
        utmSuffix: settings.utm_suffix,
      });

      if (parsed.data.contentHash !== currentHash) {
        return json(
          {
            error:
              "Content hash mismatch. Post content has been modified since review or does not match staged copy.",
          },
          400
        );
      }

      // Record human user approval in the database (persisting approval state)
      await updatePostRecord(post.id, {
        approved_by_user: true,
        approved_at: new Date().toISOString(),
        approval_content_hash: currentHash,
      });

      try {
        const { token, expiresAt } = await issueApprovalToken({
          postId: post.id,
          contentHash: currentHash,
          ttlSeconds: 600,
        });

        return json({
          approved: true,
          postId: post.id,
          contentHash: currentHash,
          approvalToken: token,
          expiresAt: new Date(expiresAt).toISOString(),
          reviewUrl: `/dashboard/queue?post=${post.id}`,
          message:
            "Post explicitly approved by user. You may now call POST /api/chatgpt/posts/{id}/publish with this single-use approvalToken before it expires (10 minutes).",
        });
      } catch (err) {
        if (err instanceof StoragePersistenceError) {
          return json({ error: err.message }, err.status);
        }
        throw err;
      }
    }

    // chatgpt/posts/<id>/publish
    if (path.length === 4 && path[0] === "chatgpt" && path[1] === "posts" && path[3] === "publish") {
      const parsed = PublishChatGPTPostBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return json({ error: "approvalToken is required to publish." }, 400);
      }

      const id = path[2];
      const post = await getPost(id);
      if (!post) return notFound();

      // If already posted, return success idempotently
      if (post.status === "posted") {
        return json({
          success: true,
          postId: post.id,
          status: "posted",
          facebookPostId: post.facebook_post_id,
          facebookPostUrl: post.facebook_post_id ? facebookPostUrl(post.facebook_post_id) : null,
          postedAt: post.posted_at,
          message: "Post has already been published.",
        });
      }

      // Block automatic retries on posts with uncertain publication outcomes (e.g. timeouts)
      if (post.status === "failed" && post.error_message?.includes("[UNCERTAIN_OUTCOME]")) {
        if (!parsed.data.forceRetry) {
          return json(
            {
              error:
                "This post previously encountered an uncertain timeout. The photo may already have been published to Facebook. " +
                "Automatic retries are blocked to prevent duplicate posts. Please verify your Facebook Page before retrying. " +
                "If confirmed not published, supply forceRetry: true to retry publishing.",
            },
            409
          );
        }
      }

      const settings = await getSettings();
      const pageId = post.page_id ?? settings.default_page_id;
      if (!pageId || !settings.default_page_token) {
        return json({ error: "Default Facebook Page is not configured or token is missing." }, 409);
      }

      // Cryptographically verify and conditionally consume the approval token against current post content
      const currentHash = computePostContentHash({
        postId: post.id,
        title: post.title,
        description: post.description,
        hashtags: post.hashtags,
        imageUrl: post.image_url,
        pageId,
        linkUrl: post.link_url,
        utmSuffix: settings.utm_suffix,
      });

      const approvalCheck = await verifyAndConsumeApprovalToken(
        parsed.data.approvalToken,
        post.id,
        currentHash,
        { consume: !parsed.data.dryRun }
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

        if (published.status === "failed") {
          return json({ error: published.error_message || "Facebook publishing failed." }, 502);
        }

        return json({
          success: true,
          postId: published.id,
          status: "posted",
          facebookPostId: published.facebook_post_id,
          facebookPostUrl: published.facebook_post_id
            ? facebookPostUrl(published.facebook_post_id)
            : null,
          postedAt: published.posted_at,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Publishing failed.";
        if (msg.includes("Concurrent publishing detected")) {
          // Compensate: attempt to safely release token ONLY if the post has not already been published
          // and another request is not actively publishing it.
          const parts = parsed.data.approvalToken.split(".");
          if (parts[0]) {
            try {
              const p = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
              if (p?.nonce) {
                const freshPost = await getPost(post.id);
                await releaseUnpublishedApprovalToken(p.nonce, post.id, {
                  postStatus: freshPost?.status,
                });
              }
            } catch {}
          }
          return json({ error: msg }, 409);
        }
        return json({ error: msg }, 502);
      }
    }

    if (route === "facebook/disconnect") {
      await updateSettings({
        facebook_user_token: null,
        facebook_token_expires_at: null,
        facebook_user_name: null,
        default_page_id: null,
        default_page_name: null,
        default_page_token: null,
      });
      await supabaseAdmin().from("pages_cache").delete().neq("page_id", "");
      return json({ ok: true });
    }

    return notFound();
  });
}

/* ---------------------------------------------------------------- PATCH */

const SettingsBody = z.object({
  image_source: z.enum(["ai", "stock", "mixed"]).optional(),
  utm_suffix: z.string().max(200).optional(),
  auto_post_enabled: z.boolean().optional(),
  posts_per_day: z.number().int().min(1).max(20).optional(),
  posting_hours: z.array(z.number().int().min(0).max(23)).min(1).max(24).optional(),
  timezone: z.string().min(1).max(64).optional(),
  topic_source: z.enum(["mine", "trending", "mixed"]).optional(),
  system_prompt: z.string().max(10000).nullable().optional(),
  ai_provider: z.enum(["gemini", "groq", "openai", "openrouter", "auto"]).optional(),
  gemini_api_key: z.string().trim().nullable().optional(),
  groq_api_key: z.string().trim().nullable().optional(),
  openai_api_key: z.string().trim().nullable().optional(),
  openrouter_api_key: z.string().trim().nullable().optional(),
  gemini_enabled: z.boolean().optional(),
  groq_enabled: z.boolean().optional(),
  openai_enabled: z.boolean().optional(),
  openrouter_enabled: z.boolean().optional(),
});

const UpdateTopicBody = z.object({
  enabled: z.boolean().optional(),
  text: z.string().trim().min(1).max(MAX_TOPIC_LENGTH).optional(),
});

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

export async function PATCH(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  const route = path.join("/");
  const url = new URL(req.url);

  return safely(async () => {
    const denied = await guard(route, req, url);
    if (denied) return denied;

    if (route === "settings") {
      const parsed = SettingsBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return json({ error: "Invalid settings payload." }, 400);
      try {
        if (parsed.data.utm_suffix !== undefined) {
          const currentSettings = await getSettings();
          const oldSuffix = (currentSettings.utm_suffix || "").trim();
          const newSuffix = (parsed.data.utm_suffix || "").trim();
          if (oldSuffix !== newSuffix) {
            // Global UTM suffix modified: invalidate approval on any unposted posts
            await supabaseAdmin()
              .from("posts")
              .update({
                approved_by_user: false,
                approved_at: null,
                approval_content_hash: null,
              })
              .neq("status", "posted")
              .eq("approved_by_user", true);
          }
        }
        return json(await publicSettings(await updateSettings(parsed.data)));
      } catch (err) {
        // Installs made before topics existed lack the column until
        // schema.sql is run again.
        if (err instanceof Error && (/topic_source/.test(err.message) || /system_prompt|ai_provider|gemini_api_key/.test(err.message))) {
          return json({ error: "Database needs migration. Please run the SQL migration script in Supabase SQL Editor." }, 409);
        }
        throw err;
      }
    }

    // topics/<id>
    if (path.length === 2 && path[0] === "topics") {
      const parsed = UpdateTopicBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return json({ error: "Invalid topic update." }, 400);
      return json({ topic: await updateTopic(path[1], parsed.data) });
    }

    // posts/<id>
    if (path.length === 2 && path[0] === "posts") {
      const id = path[1];
      const existing = await getPost(id);
      if (!existing) return json({ error: "Post not found." }, 404);
      if (existing.status === "posted") {
        return json({ error: "A published post can no longer be edited here." }, 409);
      }

      const parsed = UpdatePostBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return json({ error: "Invalid update payload." }, 400);
      const b = parsed.data;

      const contentChanged =
        (b.title !== undefined && b.title !== existing.title) ||
        (b.description !== undefined && b.description !== existing.description) ||
        (b.hashtags !== undefined && JSON.stringify(b.hashtags) !== JSON.stringify(existing.hashtags)) ||
        (b.linkUrl !== undefined && (b.linkUrl || null) !== (existing.link_url || null)) ||
        (b.pageId !== undefined && b.pageId !== existing.page_id);

      const updated = await updatePostRecord(id, {
        ...(b.title !== undefined && { title: b.title }),
        ...(b.description !== undefined && { description: b.description }),
        ...(b.hashtags !== undefined && { hashtags: b.hashtags }),
        ...(b.linkUrl !== undefined && { link_url: b.linkUrl || null }),
        ...(b.pageId !== undefined && { page_id: b.pageId }),
        ...(b.pageName !== undefined && { page_name: b.pageName }),
        ...(b.scheduledAt !== undefined && { scheduled_at: b.scheduledAt }),
        ...(b.status !== undefined && { status: b.status }),
        ...(contentChanged && {
          approved_by_user: false,
          approved_at: null,
          approval_content_hash: null,
        }),
      });

      return json({ post: updated });
    }

    return notFound();
  });
}

/* --------------------------------------------------------------- DELETE */

export async function DELETE(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  const route = path.join("/");
  const url = new URL(req.url);

  return safely(async () => {
    const denied = await guard(route, req, url);
    if (denied) return denied;

    if (path.length === 2 && path[0] === "posts") {
      await deletePostRecord(path[1]);
      return json({ ok: true });
    }

    if (path.length === 2 && path[0] === "topics") {
      await deleteTopic(path[1]);
      return json({ ok: true });
    }

    if (path.length === 2 && path[0] === "templates") {
      await deleteTemplate(path[1]);
      return json({ ok: true });
    }
    return notFound();
  });
}

/* ------------------------------------------------------------- handlers */

async function getPages(refresh: boolean) {
  const db = supabaseAdmin();
  try {
    if (refresh) {
      const pages = await fetchPages();
      if (pages.length > 0) {
        await db.from("pages_cache").delete().neq("page_id", "");
        await db
          .from("pages_cache")
          .insert(pages.map((p) => ({ page_id: p.id, name: p.name, category: p.category })));
      }
    }

    const { data: cached } = await db.from("pages_cache").select("*").order("name");
    const settings = await getSettings();
    return json({ pages: cached ?? [], defaultPageId: settings.default_page_id });
  } catch (err) {
    if (err instanceof FacebookNotConnectedError) return json({ error: err.message }, 409);
    return json({ error: err instanceof Error ? err.message : "Failed to load Pages." }, 502);
  }
}

/**
 * Send the browser back to Settings on the SAME origin it arrived from. The
 * project answers on more than one Vercel alias, and the session cookie is
 * scoped to whichever one the user is actually on, so redirecting to a
 * configured canonical URL would silently drop their login.
 */
function redirectToSettings(origin: string, status: "connected" | "error", message?: string) {
  const target = new URL("/dashboard/settings", origin || env.siteUrl);
  target.searchParams.set("facebook", status);
  if (message) target.searchParams.set("message", message);
  return NextResponse.redirect(target);
}

async function oauthCallback(req: Request, url: URL) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.headers
    .get("cookie")
    ?.split("; ")
    .find((c) => c.startsWith(`${OAUTH_STATE_COOKIE}=`))
    ?.split("=")[1];

  if (!code || !state || !cookieState || state !== cookieState) {
    return redirectToSettings(
      url.origin,
      "error",
      "Login was cancelled or the request expired. Please try again."
    );
  }

  const creds = await getFacebookCredentials(url.origin);
  if (!creds) {
    return redirectToSettings(url.origin, "error", "Meta app credentials are no longer set.");
  }

  try {
    // The short-lived token is immediately traded up: Page tokens minted from a
    // long-lived user token never expire, which is what the autopilot needs.
    const shortLived = await exchangeCodeForToken(creds, code);
    const longLived = await exchangeForLongLivedToken(creds, shortLived.access_token);

    await updateSettings({
      facebook_user_token: longLived.access_token,
      facebook_token_expires_at: longLived.expires_in
        ? new Date(Date.now() + longLived.expires_in * 1000).toISOString()
        : null,
    });

    // Catch a half-granted connection here rather than at publish time, where
    // Facebook reports it as a bare "(#200) Permissions error".
    const missing = await missingPermissions(longLived.access_token);
    if (missing.length > 0) {
      return redirectToSettings(
        url.origin,
        "error",
        `Connected, but these permissions were not granted: ${missing.join(", ")}. ` +
          `Add them to your Meta app (use case permissions, and the Login for Business ` +
          `configuration if you use one), then disconnect and connect again.`
      );
    }

    // Best-effort extras: the connection still counts as successful without a
    // display name, and without a Page the user simply picks one next.
    try {
      const account = await fetchAccount();
      await updateSettings({ facebook_user_name: account.name });
    } catch {}

    try {
      const pages = await fetchPages();
      if (pages.length === 1) {
        await updateSettings({
          default_page_id: pages[0].id,
          default_page_name: pages[0].name,
          default_page_token: pages[0].access_token,
        });
      }
    } catch {}

    const res = redirectToSettings(url.origin, "connected");
    res.cookies.set(OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    return redirectToSettings(
      url.origin,
      "error",
      err instanceof Error ? err.message : "Connection failed."
    );
  }
}

/**
 * Autopilot tick. Vercel's Hobby plan permits only one cron run per day — a
 * more frequent schedule in vercel.json is rejected at deploy time — so the
 * built-in cron fires once at 04:00 UTC (09:00 Asia/Karachi, the first default
 * posting hour). Every guard in maybeRunAutopilot is idempotent, so the
 * remaining posting slots can be driven by pointing any free external cron
 * (cron-job.org, UptimeRobot) at this same path with the CRON_SECRET.
 */
async function runCron(req: Request, url: URL) {
  if (env.cronSecret) {
    const auth = req.headers.get("authorization");
    const provided = url.searchParams.get("secret");
    if (auth !== `Bearer ${env.cronSecret}` && provided !== env.cronSecret) {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  const due = await listDuePosts(new Date().toISOString());
  const queueResults = [];
  for (const post of due) {
    const result = await publishPostNow(post.id);
    queueResults.push({ id: result.id, status: result.status });
  }

  return json({
    processedFromQueue: queueResults.length,
    queueResults,
    autopilot: await maybeRunAutopilot(),
  });
}
