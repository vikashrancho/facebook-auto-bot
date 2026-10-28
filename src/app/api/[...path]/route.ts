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
  timingSafeEqualString,
  computePostContentHash,
  createApprovalToken,
  verifyApprovalToken,
  issueApprovalToken,
  verifyAndConsumeApprovalToken,
  releaseUnpublishedApprovalToken,
  StoragePersistenceError,
} from "@/lib/auth/integration";
import {
  checkRateLimit,
  RATE_LIMIT_TIERS,
  rateLimitExceededResponse,
  getClientIp,
} from "@/lib/rate-limit";
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
  listCalendarPosts,
  updatePostRecord,
  reassignPostDestination,
} from "@/lib/db/posts";
import { processDueScheduledPosts } from "@/lib/scheduler";
import { localParts, DEFAULT_TIMEZONE, normalizeTimezone, isValidTimezone } from "@/lib/time";
import { buildDashboardReviewUrl } from "@/lib/urls";
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
  getContentRequestRecord,
  listContentRequestRecords,
  createContentRequestRecord,
  markContentRequestProcessing,
  markContentRequestDraftCreated,
  markContentRequestFailed,
  cancelContentRequestRecord,
  ContentRequestsTableMissingError,
} from "@/lib/db/content-requests";
import {
  listPages,
  getPageWithToken,
  resolveTargetFacebookPage,
  normalizePageName,
  upsertPages,
  disconnectPage,
  reconnectPage,
  setDefaultPage,
  disconnectAllPages,
} from "@/lib/db/pages";
import {
  fetchAccount,
  fetchPages,
  fetchSinglePage,
  missingPermissions,
  revokeFacebookAccess,
  FacebookNotConnectedError,
  diagnoseFacebookConnection,
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
 * The cron route authenticates with CRON_SECRET when one is set, or with an
 * authenticated admin dashboard session. This allows background client-side
 * schedule flushing while keeping the route strictly protected from public access.
 */
async function cronAuthorized(req: Request, url: URL): Promise<boolean> {
  if (await hasSession(req)) return true;
  if (!env.cronSecret) return false;
  const auth = req.headers.get("authorization");
  if (auth && auth.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    return timingSafeEqualString(token, env.cronSecret);
  }
  const secretParam = url.searchParams.get("secret");
  if (secretParam) {
    return timingSafeEqualString(secretParam.trim(), env.cronSecret);
  }
  return false;
}


const INTEGRATION_ROUTES = new Set([
  "health",
  "chatgpt/posts",
  "chatgpt/images",
  "chatgpt/requests",
  "chatgpt/connected-pages",
  "chatgpt/pages",
]);

function isIntegrationRoute(route: string): boolean {
  if (INTEGRATION_ROUTES.has(route)) return true;
  if (route.startsWith("chatgpt/posts/")) return true;
  if (route.startsWith("chatgpt/images/")) return true;
  if (route.startsWith("chatgpt/requests/")) return true;
  if (route.startsWith("chatgpt/connected-pages")) return true;
  if (route.startsWith("chatgpt/pages")) return true;
  return false;
}

async function guard(route: string, req: Request, url: URL): Promise<Response | null> {
  // Rate limiting tier enforcement based on endpoint and client IP
  const ip = getClientIp(req);
  if (route === "auth/login") {
    const rl = checkRateLimit(`login:${ip}`, RATE_LIMIT_TIERS.AUTH_LOGIN);
    if (!rl.allowed) return rateLimitExceededResponse(rl);
  } else if (isIntegrationRoute(route)) {
    const rl = checkRateLimit(`chatgpt:${ip}`, RATE_LIMIT_TIERS.CHATGPT_ACTIONS);
    if (!rl.allowed) return rateLimitExceededResponse(rl);
  } else if (route.startsWith("generate/")) {
    const rl = checkRateLimit(`gen:${ip}`, RATE_LIMIT_TIERS.GENERATION);
    if (!rl.allowed) return rateLimitExceededResponse(rl);
  } else if (route.startsWith("cron/")) {
    const rl = checkRateLimit(`cron:${ip}`, RATE_LIMIT_TIERS.CRON_SCHEDULER);
    if (!rl.allowed) return rateLimitExceededResponse(rl);
  } else if (!OPEN_ROUTES.has(route)) {
    const rl = checkRateLimit(`api:${ip}`, RATE_LIMIT_TIERS.STANDARD_API);
    if (!rl.allowed) return rateLimitExceededResponse(rl);
  }

  if (OPEN_ROUTES.has(route)) return null;
  // ChatGPT / M2M integration routes strictly require Bearer INTEGRATION_API_KEY.
  // The dashboard session cookie is deliberately rejected here to avoid cross-context confusion.
  if (isIntegrationRoute(route)) {
    return validateIntegrationAuth(req) ? null : unauthorized();
  }
  if (route === "cron/process-queue" || route === "cron/scheduler") {
    return (await cronAuthorized(req, url)) ? null : unauthorized();
  }
  return (await hasSession(req)) ? null : unauthorized();
}

async function safely(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    const requestId = crypto.randomUUID();
    console.error(`[INTERNAL_ERROR:${requestId}]`, err);
    const isProd = process.env.NODE_ENV === "production";
    const errorMsg = isProd
      ? "An unexpected internal server error occurred."
      : err instanceof Error
      ? err.message
      : "Unexpected server error.";
    return json({ error: errorMsg, requestId }, 500);
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
    chatgpt_custom_gpt_url: settings.chatgpt_custom_gpt_url || env.chatgptCustomGptUrlOptional || null,
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

    if (route === "facebook/diagnostics") {
      const pageId = url.searchParams.get("pageId") || undefined;
      const report = await diagnoseFacebookConnection(pageId);
      return json(report);
    }

    if (route === "chatgpt/connected-pages" || route === "chatgpt/pages") {
      const pages = await listPages({ includeInactive: false });
      const currentSettings = await getSettings();
      return json({
        pages: pages.map((p) => ({
          id: p.page_id,
          pageId: p.page_id,
          name: p.name,
          category: p.category,
          pictureUrl: p.picture_url ?? null,
          isDefault: Boolean(p.is_default),
          isActive: Boolean(p.is_active),
          status: p.is_active ? "connected" : "disconnected",
          canPublish: Boolean(p.can_post),
          permissions: p.tasks ?? [],
        })),
        count: pages.length,
        defaultPageId: currentSettings.default_page_id,
        defaultPageName: currentSettings.default_page_name,
      });
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

    if (route === "calendar") {
      const start = url.searchParams.get("start");
      const end = url.searchParams.get("end");
      const settings = await getSettings();
      const timeZone = settings.timezone || DEFAULT_TIMEZONE;

      const posts = await listCalendarPosts({
        startDate: start ?? undefined,
        endDate: end ?? undefined,
      });

      const allPosts = await listPosts();
      const now = new Date();
      const todayKey = localParts(now, timeZone).dateKey;

      const dayOfWeek = now.getDay();
      const startOfWeek = new Date(now.getTime() - dayOfWeek * 86400000);
      const endOfWeek = new Date(startOfWeek.getTime() + 6 * 86400000);
      const startOfWeekKey = localParts(startOfWeek, timeZone).dateKey;
      const endOfWeekKey = localParts(endOfWeek, timeZone).dateKey;

      let scheduledToday = 0;
      let scheduledThisWeek = 0;
      let awaitingApproval = 0;
      let published = 0;
      let failedOrAttention = 0;

      for (const p of allPosts) {
        if (p.status === "posted") {
          published++;
        }
        if (p.status === "failed" || Boolean(p.error_message)) {
          failedOrAttention++;
        }
        if (!p.approved_by_user && p.status !== "posted") {
          awaitingApproval++;
        }
        if (p.scheduled_at) {
          const postDateKey = localParts(new Date(p.scheduled_at), timeZone).dateKey;
          if (postDateKey === todayKey) {
            scheduledToday++;
          }
          if (postDateKey >= startOfWeekKey && postDateKey <= endOfWeekKey) {
            scheduledThisWeek++;
          }
        }
      }

      return json({
        posts,
        allPosts,
        summary: {
          scheduledToday,
          scheduledThisWeek,
          awaitingApproval,
          published,
          failedOrAttention,
        },
        timeZone,
      });
    }

    if (route === "cron/process-queue" || route === "cron/scheduler") {
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
      const pageId = post.page_id ?? "";
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

      let authoritativeStatus: PostStatus = post.status;
      if (post.status === "draft") {
        if (post.approved_by_user) {
          authoritativeStatus = post.scheduled_at ? "scheduled" : "approved";
        } else {
          authoritativeStatus = "pending_review";
        }
      }

      return json({
        postId: post.id,
        status: authoritativeStatus,
        title: post.title,
        description: post.description,
        hashtags: post.hashtags || [],
        imageUrl: post.image_url,
        pageId: post.page_id,
        pageName: post.page_name,
        contentHash,
        reviewUrl: buildDashboardReviewUrl(post.id, req),
        approvedByUser: Boolean(post.approved_by_user),
        approved: Boolean(post.approved_by_user),
        approvedAt: post.approved_at,
        scheduledAt: post.scheduled_at,
        scheduledTimezone: post.scheduled_timezone || null,
        isContentUnchangedSinceApproval,
        facebookPostId: post.facebook_post_id,
        facebookPostUrl: post.facebook_post_id ? facebookPostUrl(post.facebook_post_id) : null,
        postedAt: post.posted_at,
        errorMessage: post.error_message,
      });
    }

    // posts/<id> — retrieve single post for dashboard review/preview
    if (path.length === 2 && path[0] === "posts") {
      const post = await getPost(path[1]);
      if (!post) return notFound();
      return json({ post });
    }

    if (route === "content-requests") {
      const status = url.searchParams.get("status");
      const limit = url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!, 10) : 50;
      try {
        const requests = await listContentRequestRecords({
          status: status ? (status.split(",") as any) : undefined,
          limit: isNaN(limit) ? 50 : limit,
        });
        return json({ ready: true, requests });
      } catch (err) {
        if (err instanceof ContentRequestsTableMissingError) {
          return json({ ready: false, requests: [], message: err.message }, 409);
        }
        throw err;
      }
    }

    if (path.length === 2 && path[0] === "content-requests") {
      const request = await getContentRequestRecord(path[1]);
      if (!request) return notFound();
      return json({ request });
    }

    // chatgpt/requests/<id> — getChatGPTContentRequest action
    if (path.length === 3 && path[0] === "chatgpt" && path[1] === "requests") {
      const id = path[2];
      const request = await getContentRequestRecord(id);
      if (!request) {
        return json({ error: `Content request '${id}' not found.` }, 404);
      }
      if (request.status === "cancelled") {
        return json(
          { error: "This content request has been cancelled by the user in the dashboard." },
          409
        );
      }
      if (request.status === "draft_created" && request.post_id) {
        return json(
          {
            error: `Content request '${id}' has already been processed into draft post '${request.post_id}'. Review draft at: ${request.review_url || buildDashboardReviewUrl(request.post_id, req)}. To create a new post, submit a new content request.`,
            requestId: request.id,
            status: request.status,
            postId: request.post_id,
            reviewUrl: request.review_url || buildDashboardReviewUrl(request.post_id, req),
          },
          409
        );
      }
      if (!request.topic || request.topic.trim().length < 2) {
        return json(
          { error: "Content request contains no valid topic. A specific topic is required." },
          400
        );
      }

      let currentRequest = request;
      if (request.status === "pending_chatgpt") {
        const updated = await markContentRequestProcessing(id);
        if (updated) currentRequest = updated;
      }

      return json({
        requestId: currentRequest.id,
        status: currentRequest.status,
        topic: currentRequest.topic,
        contentCategory: currentRequest.content_type,
        contentType: currentRequest.content_type,
        platform: currentRequest.platform,
        targetPage: currentRequest.target_page_name || "Connected Facebook Page",
        targetPageName: currentRequest.target_page_name,
        targetPageId: currentRequest.target_page_id,
        tone: currentRequest.tone,
        targetAudience: currentRequest.audience,
        audience: currentRequest.audience,
        imageStyle: currentRequest.image_style,
        aspectRatio: currentRequest.aspect_ratio,
        postId: currentRequest.post_id,
        reviewUrl: currentRequest.review_url,
        errorMessage: currentRequest.error_message,
        topicMandate:
          "The 'topic' field is the authoritative, non-negotiable subject of this post. You MUST create the caption and image specifically about this topic. The 'contentCategory' and 'tone' are only stylistic angles—NEVER replace the topic with generic motivational quotes, sunrises, or unrelated advice.",
        constraints: {
          maxTitleLength: 120,
          maxDescriptionLength: 500,
          maxHashtags: 15,
          requireHostedImage: true,
          mustNotPublishAutomatically: true,
          topicMustBePrimarySubject: true,
        },
        createdAt: currentRequest.created_at,
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
  pageId: z.string().optional(),
  pageName: z.string().optional(),
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

const CreateContentRequestBody = z.object({
  topic: z
    .string()
    .trim()
    .min(2, "Topic must be at least 2 characters.")
    .max(500, "Topic cannot exceed 500 characters."),
  platform: z.enum(["facebook", "instagram"]).default("facebook"),
  contentType: z
    .enum(["Motivational", "Educational", "Investing Tips", "Stock Market Analysis", "Custom"])
    .default("Motivational"),
  tone: z.string().trim().max(100).optional(),
  audience: z.string().trim().max(100).optional(),
  imageStyle: z.string().trim().max(100).optional(),
  aspectRatio: z.enum(["1:1", "4:5", "16:9"]).default("1:1"),
  targetPageId: z.string().optional(),
  targetPageName: z.string().optional(),
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
    requestId: z.string().trim().min(1).max(64).optional(),
    topic: z.string().trim().min(2).max(300).optional(),
    pageId: z.string().trim().min(1).max(100).optional(),
    targetPageId: z.string().trim().min(1).max(100).optional(),
    pageName: z.string().trim().min(1).max(200).optional(),
    targetPageName: z.string().trim().min(1).max(200).optional(),
    page: z.string().trim().min(1).max(200).optional(),
    scheduledAt: z.string().trim().min(5).optional(),
    timezone: z.string().trim().max(100).optional(),
    scheduleNotes: z.string().trim().max(500).optional(),
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
  scheduledAt: z.string().trim().min(5).optional(),
  timezone: z.string().trim().max(100).optional(),
  scheduleNotes: z.string().trim().max(500).optional(),
  targetPageId: z.string().trim().min(1).max(100).optional(),
  targetPageName: z.string().trim().min(1).max(200).optional(),
  expectedPageId: z.string().trim().min(1).max(100).optional(),
  expectedPageName: z.string().trim().min(1).max(200).optional(),
});

const ScheduleChatGPTPostBody = z.object({
  scheduledAt: z.string().trim().min(5, "scheduledAt is required (valid ISO datetime)."),
  timezone: z.string().trim().max(100).optional(),
  scheduleNotes: z.string().trim().max(500).optional(),
  approvalToken: z.string().trim().min(10).optional(),
  contentHash: z.string().trim().min(1).optional(),
  userConfirmed: z.boolean().optional(),
  targetPageId: z.string().trim().min(1).max(100).optional(),
  targetPageName: z.string().trim().min(1).max(200).optional(),
  expectedPageId: z.string().trim().min(1).max(100).optional(),
  expectedPageName: z.string().trim().min(1).max(200).optional(),
});

const PublishChatGPTPostBody = z.object({
  approvalToken: z.string().trim().min(10),
  dryRun: z.boolean().optional(),
  forceRetry: z.boolean().optional(),
  targetPageId: z.string().trim().min(1).max(100).optional(),
  targetPageName: z.string().trim().min(1).max(200).optional(),
  expectedPageId: z.string().trim().min(1).max(100).optional(),
  expectedPageName: z.string().trim().min(1).max(200).optional(),
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
      if (!parsed.success || !timingSafeEqualString(parsed.data.password, env.adminPassword)) {
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

      const pageResolution = await resolveTargetFacebookPage({
        pageId: b.pageId,
        pageName: b.pageName,
        allowDefault: !(b.pageId || b.pageName),
      });

      if (!pageResolution.page) {
        return json(
          {
            error: pageResolution.message || "Failed to resolve destination Facebook Page.",
            code: pageResolution.error,
            availablePages: pageResolution.availablePages,
          },
          400
        );
      }

      const pageId = pageResolution.page.page_id;
      const pageName = pageResolution.page.name;

      const post = await createPostRecord({
        topic: b.topic,
        title: b.title,
        description: b.description,
        hashtags: b.hashtags,
        image_url: b.imageUrl,
        image_source: b.imageSource,
        link_url: b.linkUrl || null,
        page_id: pageId,
        page_name: pageName,
        scheduled_at: b.action === "schedule" ? b.scheduledAt! : null,
        status: b.action === "schedule" ? "scheduled" : "draft",
      });

      if (b.action === "schedule") {
        const settings = await getSettings();
        const hash = computePostContentHash({
          postId: post.id,
          title: post.title,
          description: post.description,
          hashtags: post.hashtags,
          imageUrl: post.image_url,
          pageId,
          linkUrl: post.link_url,
          utmSuffix: settings.utm_suffix,
        });
        const approvedPost = await updatePostRecord(post.id, {
          approved_by_user: true,
          approved_at: new Date().toISOString(),
          approval_content_hash: hash,
        });
        return json({ post: approvedPost });
      }

      if (b.action === "post_now") {
        return json({ post: await publishPostNow(post.id) });
      }
      return json({ post });
    }


    if (route === "content-requests") {
      const parsed = CreateContentRequestBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return json({ error: parsed.error.issues[0]?.message ?? "Invalid content request." }, 400);
      }
      try {
        const targetResolution = await resolveTargetFacebookPage({
          pageId: parsed.data.targetPageId,
          pageName: parsed.data.targetPageName,
          allowDefault: !(parsed.data.targetPageId || parsed.data.targetPageName),
        });

        if (!targetResolution.page) {
          return json(
            {
              error: targetResolution.message || "Failed to resolve destination Facebook Page.",
              code: targetResolution.error,
              availablePages: targetResolution.availablePages,
            },
            400
          );
        }

        const pageId = targetResolution.page.page_id;
        const pageName = targetResolution.page.name;

        const record = await createContentRequestRecord({
          topic: parsed.data.topic,
          platform: parsed.data.platform,
          contentType: parsed.data.contentType,
          tone: parsed.data.tone,
          audience: parsed.data.audience,
          imageStyle: parsed.data.imageStyle,
          aspectRatio: parsed.data.aspectRatio,
          targetPageId: pageId,
          targetPageName: pageName,
        });
        return json({ ok: true, request: record }, 201);
      } catch (err) {
        if (err instanceof ContentRequestsTableMissingError) {
          return json({ error: err.message }, 409);
        }
        throw err;
      }
    }

    // content-requests/<id>/cancel
    if (path.length === 3 && path[0] === "content-requests" && path[2] === "cancel") {
      const id = path[1];
      try {
        const updated = await cancelContentRequestRecord(id);
        return json({ ok: true, request: updated });
      } catch (err: any) {
        return json({ error: err.message || "Failed to cancel content request." }, 400);
      }
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
      const post = await getPost(path[1]);
      if (!post) return notFound();
      if (post.status === "posted") {
        return json({ error: "Post has already been posted to Facebook." }, 400);
      }
      if (!post.page_id) {
        return json(
          { error: "Destination Facebook Page is not assigned to this post. Please assign a destination Page before publishing." },
          409
        );
      }
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
      const pageId = post.page_id;
      if (!pageId) {
        return json(
          { error: "Destination Facebook Page is not assigned to this post. Please select a destination Page before approving." },
          409
        );
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

      const hasValidFutureSchedule =
        Boolean(post.scheduled_at) && new Date(post.scheduled_at!).getTime() > Date.now();
      const nextStatus: PostStatus = hasValidFutureSchedule ? "scheduled" : "approved";

      const updated = await updatePostRecord(post.id, {
        approved_by_user: true,
        approved_at: new Date().toISOString(),
        approval_content_hash: currentHash,
        status: nextStatus,
      });

      return json({
        ok: true,
        postId: updated.id,
        status: updated.status,
        approvedByUser: true,
        approvedAt: updated.approved_at,
        approvalContentHash: updated.approval_content_hash,
        scheduledAt: updated.scheduled_at,
        scheduledTimezone: updated.scheduled_timezone || null,
        message: hasValidFutureSchedule
          ? `Post approved and confirmed for scheduled publication at ${updated.scheduled_at}.`
          : "Post successfully approved by human administrator in dashboard.",
      });
    }

    // posts/<id>/destination — explicit destination-change action
    if (path.length === 3 && path[0] === "posts" && path[2] === "destination") {
      const id = path[1];
      const body = await req.json().catch(() => null);
      const TargetBody = z.object({
        pageId: z.string().optional(),
        targetPageId: z.string().optional(),
        pageName: z.string().optional(),
        targetPageName: z.string().optional(),
      });
      const parsed = TargetBody.safeParse(body);
      if (!parsed.success) {
        return json({ error: "pageId or pageName is required." }, 400);
      }
      const requestedId = parsed.data.pageId || parsed.data.targetPageId;
      const requestedName = parsed.data.pageName || parsed.data.targetPageName;
      if (!requestedId && !requestedName) {
        return json({ error: "pageId or pageName is required." }, 400);
      }

      const resolution = await resolveTargetFacebookPage({
        pageId: requestedId,
        pageName: requestedName,
        allowDefault: false,
      });

      if (!resolution.page) {
        return json(
          {
            error: resolution.message || "Failed to resolve destination Facebook Page.",
            code: resolution.error,
            availablePages: resolution.availablePages,
          },
          400
        );
      }

      const res = await reassignPostDestination(id, resolution.page.page_id);
      if (!res.ok) {
        return json({ error: res.error || "Failed to reassign destination." }, 400);
      }

      return json({
        ok: true,
        post: res.post,
        message: `Destination successfully updated to '${resolution.page.name}' (${resolution.page.page_id}). Prior approval has been invalidated and requires fresh confirmation.`,
      });
    }

    // posts/<id>/schedule — schedule or reschedule a post
    if (path.length === 3 && path[0] === "posts" && path[2] === "schedule") {
      const id = path[1];
      const post = await getPost(id);
      if (!post) return notFound();
      if (post.status === "posted") {
        return json({ error: "Cannot schedule an already-published post." }, 400);
      }
      if (post.status === "publishing") {
        return json({ error: "Cannot schedule a post that is currently in-flight to Facebook." }, 409);
      }

      const body = await req.json().catch(() => null);
      const ScheduleBody = z.object({
        scheduledAt: z.string().datetime(),
        timezone: z.string().max(100).optional(),
        scheduleNotes: z.string().max(500).optional(),
        allowPast: z.boolean().optional(),
        approve: z.boolean().optional(),
        autoApprove: z.boolean().optional(),
      });

      const parsed = ScheduleBody.safeParse(body);
      if (!parsed.success) {
        return json({ error: "A valid ISO datetime (scheduledAt) is required." }, 400);
      }

      const targetTime = new Date(parsed.data.scheduledAt).getTime();
      if (!parsed.data.allowPast && targetTime <= Date.now()) {
        return json({ error: "Cannot schedule a post for an invalid or past time." }, 400);
      }

      if (!post.image_url || post.image_url.trim() === "") {
        return json({ error: "Post has no valid image URL. An image is required before scheduling." }, 422);
      }

      const pageId = post.page_id;
      if (!pageId) {
        return json({ error: "Target Facebook Page is not assigned to this post. Please assign a destination Page before scheduling." }, 422);
      }

      const settings = await getSettings();
      let resolvedTz = post.scheduled_timezone || settings.timezone || DEFAULT_TIMEZONE;
      if (parsed.data.timezone) {
        try {
          resolvedTz = normalizeTimezone(parsed.data.timezone, resolvedTz);
        } catch {}
      }

      // Automatically approve and sign content when scheduled from dashboard, unless explicitly opted out
      const shouldApprove = parsed.data.approve !== false && parsed.data.autoApprove !== false;
      let approvalPatch: Partial<Post> = {};
      if (shouldApprove) {
        const hash = computePostContentHash({
          postId: post.id,
          title: post.title,
          description: post.description,
          hashtags: post.hashtags,
          imageUrl: post.image_url,
          pageId,
          linkUrl: post.link_url,
          utmSuffix: settings.utm_suffix,
        });
        approvalPatch = {
          approved_by_user: true,
          approved_at: new Date().toISOString(),
          approval_content_hash: hash,
        };
      }

      const updated = await updatePostRecord(post.id, {
        scheduled_at: parsed.data.scheduledAt,
        scheduled_timezone: resolvedTz,
        status: "scheduled",
        schedule_notes: parsed.data.scheduleNotes ?? post.schedule_notes ?? null,
        error_message: null,
        ...approvalPatch,
      });

      return json({ ok: true, post: updated });
    }


    // posts/<id>/cancel-schedule — revert scheduled post to draft
    if (path.length === 3 && path[0] === "posts" && path[2] === "cancel-schedule") {
      const id = path[1];
      const post = await getPost(id);
      if (!post) return notFound();
      if (post.status === "posted") {
        return json({ error: "Cannot cancel schedule of an already-published post." }, 400);
      }
      if (post.status === "publishing") {
        return json({ error: "Cannot cancel schedule while publishing is in progress." }, 409);
      }

      const updated = await updatePostRecord(post.id, {
        scheduled_at: null,
        scheduled_timezone: null,
        status: "draft",
        approved_by_user: false,
        approval_content_hash: null,
      });

      return json({ ok: true, post: updated });
    }

    if (route === "cron/process-queue" || route === "cron/scheduler") {
      return runCron(req, url);
    }

    if (route === "facebook/default-page") {
      const parsed = DefaultPageBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return json({ error: "pageId is required." }, 400);

      try {
        const result = await setDefaultPage(parsed.data.pageId);
        return json({ ok: true, success: true, defaultPageId: parsed.data.pageId, pageName: result.pageName });
      } catch (err: any) {
        // If not in cache, fallback to fetching from Facebook
        try {
          const page = (await fetchPages()).find((p) => p.id === parsed.data.pageId);
          if (!page) return json({ error: "That Page is not available on this account." }, 404);
          await upsertPages([page]);
          const result = await setDefaultPage(page.id);
          return json({ ok: true, success: true, defaultPageId: page.id, pageName: result.pageName });
        } catch (fetchErr) {
          if (fetchErr instanceof FacebookNotConnectedError) return json({ error: fetchErr.message }, 409);
          return json({ error: err.message || "Failed to set default Page." }, 400);
        }
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
        let linkedRequest: Awaited<ReturnType<typeof getContentRequestRecord>> = null;

        if (b.requestId) {
          linkedRequest = await getContentRequestRecord(b.requestId);
          if (!linkedRequest) {
            return {
              status: 404,
              body: { error: `Content request with ID '${b.requestId}' not found.` },
            };
          }
          if (linkedRequest.status === "cancelled") {
            return {
              status: 409,
              body: { error: "This content request has been cancelled by the user in the dashboard." },
            };
          }
          if (linkedRequest.status === "draft_created" && linkedRequest.post_id) {
            const existingPost = await getPost(linkedRequest.post_id);
            if (existingPost) {
              const requestedId = b.pageId || b.targetPageId;
              const requestedName = b.pageName || b.targetPageName || b.page;
              if (requestedId && existingPost.page_id && existingPost.page_id !== requestedId) {
                return {
                  status: 409,
                  body: {
                    error: `TARGET_PAGE_MISMATCH: Existing draft for content request '${b.requestId}' was staged for Page ID '${existingPost.page_id}', but this request specified '${requestedId}'.`,
                    code: "TARGET_PAGE_MISMATCH",
                  },
                };
              }
              if (requestedName && existingPost.page_name && normalizePageName(existingPost.page_name) !== normalizePageName(requestedName)) {
                return {
                  status: 409,
                  body: {
                    error: `TARGET_PAGE_MISMATCH: Existing draft for content request '${b.requestId}' was staged for '${existingPost.page_name}', but this request specified '${requestedName}'.`,
                    code: "TARGET_PAGE_MISMATCH",
                  },
                };
              }

              const contentHash = computePostContentHash({
                postId: existingPost.id,
                title: existingPost.title,
                description: existingPost.description,
                hashtags: existingPost.hashtags,
                imageUrl: existingPost.image_url,
                pageId: existingPost.page_id || "",
                linkUrl: existingPost.link_url,
                utmSuffix: settings.utm_suffix,
              });
              const reviewUrl = buildDashboardReviewUrl(existingPost.id, req);
              return {
                status: 200,
                body: {
                  postId: existingPost.id,
                  requestId: linkedRequest.id,
                  status: existingPost.status === "draft" ? (existingPost.approved_by_user ? "approved" : "pending_review") : existingPost.status,
                  topic: existingPost.topic,
                  title: existingPost.title,
                  description: existingPost.description,
                  hashtags: existingPost.hashtags,
                  imageUrl: existingPost.image_url,
                  pageId: existingPost.page_id,
                  pageName: existingPost.page_name,
                  scheduledAt: existingPost.scheduled_at,
                  scheduledTimezone: existingPost.scheduled_timezone || null,
                  contentHash,
                  reviewUrl,
                  approvalRequired: !existingPost.approved_by_user,
                  message: "Draft already created for this content request. Returned existing draft.",
                },
              };
            }
          }
        }

        if (b.idempotencyKey) {
          const { data: existing } = await db
            .from("posts")
            .select("*")
            .eq("topic", `chatgpt:${b.idempotencyKey}`)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existing) {
            // Verify that the existing post's page matches the caller's requested page
            const requestedId = b.pageId || b.targetPageId;
            const requestedName = b.pageName || b.targetPageName || b.page;
            if (requestedId && existing.page_id && existing.page_id !== requestedId) {
              return {
                status: 409,
                body: {
                  error: `TARGET_PAGE_MISMATCH: Existing draft for idempotencyKey '${b.idempotencyKey}' was staged for Page ID '${existing.page_id}', but this request specified '${requestedId}'.`,
                  code: "TARGET_PAGE_MISMATCH",
                },
              };
            }
            if (requestedName && existing.page_name && normalizePageName(existing.page_name) !== normalizePageName(requestedName)) {
              return {
                status: 409,
                body: {
                  error: `TARGET_PAGE_MISMATCH: Existing draft for idempotencyKey '${b.idempotencyKey}' was staged for '${existing.page_name}', but this request specified '${requestedName}'.`,
                  code: "TARGET_PAGE_MISMATCH",
                },
              };
            }

            const contentHash = computePostContentHash({
              postId: existing.id,
              title: existing.title,
              description: existing.description,
              hashtags: existing.hashtags,
              imageUrl: existing.image_url,
              pageId: existing.page_id || "",
              linkUrl: existing.link_url,
              utmSuffix: settings.utm_suffix,
            });
            const reviewUrl = buildDashboardReviewUrl(existing.id, req);
            const isApproved = Boolean(existing.approved_by_user);
            let authoritativeStatus: PostStatus = existing.status;
            if (existing.status === "draft") {
              authoritativeStatus = isApproved
                ? (existing.scheduled_at ? "scheduled" : "approved")
                : "pending_review";
            }

            return {
              status: 200,
              body: {
                postId: existing.id,
                requestId: b.requestId || undefined,
                status: authoritativeStatus,
                title: existing.title,
                description: existing.description,
                hashtags: existing.hashtags,
                imageUrl: existing.image_url,
                pageId: existing.page_id,
                pageName: existing.page_name,
                contentHash,
                reviewUrl,
                scheduledAt: existing.scheduled_at,
                scheduledTimezone: existing.scheduled_timezone || null,
                approvalRequired: !isApproved,
                message:
                  "Existing post returned for idempotency key. Please display the complete preview to the user. " +
                  (isApproved
                    ? "Post is already approved."
                    : "Ask: 'Do you approve publishing this post to Facebook?' and wait for explicit confirmation in the next turn before calling approve."),
              },
            };
          }
        }

        // Resolve destination Facebook Page:
        // Priority 1: explicitly passed pageId / targetPageId / pageName / targetPageName / page
        // Priority 2: target_page_id / target_page_name from linked content request
        // Priority 3: extract from topic or idempotencyKey context if connected page is mentioned
        // Priority 4: configured default_page_id ONLY if no explicit page was requested
        const requestedId = b.pageId || b.targetPageId || linkedRequest?.target_page_id;
        const requestedName = b.pageName || b.targetPageName || b.page || linkedRequest?.target_page_name;
        const hasExplicitRequest = Boolean(requestedId || requestedName);

        const pageResolution = await resolveTargetFacebookPage({
          pageId: requestedId,
          pageName: requestedName,
          topic: b.topic || (b.idempotencyKey ? b.idempotencyKey : undefined),
          allowDefault: !hasExplicitRequest,
        });

        if (!pageResolution.page) {
          return {
            status: 409,
            body: {
              error: pageResolution.message || "Unable to resolve target Facebook Page.",
              code: pageResolution.error,
              availablePages: pageResolution.availablePages,
            },
          };
        }

        const targetPage = pageResolution.page;
        const destinationPageId = targetPage.page_id;
        const destinationPageName = targetPage.name || "Facebook Page";

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
          const postTopic = linkedRequest?.topic || b.topic || (b.idempotencyKey ? `chatgpt:${b.idempotencyKey}` : (b.requestId ? `chatgpt:req:${b.requestId}` : "chatgpt"));

          // Destination consistency assertion: ensure target Page matches caller intent
          if (requestedId && targetPage.page_id !== requestedId) {
            return {
              status: 409,
              body: {
                error: `TARGET_PAGE_MISMATCH: Resolved Page ID '${targetPage.page_id}' does not match requested Page ID '${requestedId}'.`,
                code: "TARGET_PAGE_MISMATCH",
                availablePages: pageResolution.availablePages,
              },
            };
          }
          if (requestedName && normalizePageName(targetPage.name) !== normalizePageName(requestedName)) {
            return {
              status: 409,
              body: {
                error: `TARGET_PAGE_MISMATCH: Resolved Page '${targetPage.name}' does not match requested Page '${requestedName}'.`,
                code: "TARGET_PAGE_MISMATCH",
                availablePages: pageResolution.availablePages,
              },
            };
          }

          let initialScheduledAt: string | null = null;
          let initialTimezone: string | null = null;
          if (b.scheduledAt) {
            const parsedDate = new Date(b.scheduledAt);
            if (isNaN(parsedDate.getTime())) {
              return {
                status: 400,
                body: { error: "Invalid scheduledAt format. Expected ISO-8601 date string." },
              };
            }
            if (parsedDate.getTime() <= Date.now()) {
              return {
                status: 400,
                body: { error: "scheduledAt must be a future date and time." },
              };
            }
            initialScheduledAt = parsedDate.toISOString();
            if (b.timezone) {
              if (!isValidTimezone(b.timezone)) {
                return {
                  status: 400,
                  body: { error: `Invalid timezone '${b.timezone}'. Provide a valid IANA timezone (e.g. 'Asia/Kolkata', 'UTC').` },
                };
              }
              initialTimezone = normalizeTimezone(b.timezone);
            } else {
              initialTimezone = "UTC";
            }
          }

          const post = await createPostRecord({
            topic: postTopic,
            title: b.title,
            description: b.description,
            hashtags: b.hashtags,
            image_url: ingested.url,
            image_source: ingested.source,
            link_url: null,
            page_id: targetPage.page_id,
            page_name: destinationPageName,
            scheduled_at: initialScheduledAt,
            scheduled_timezone: initialTimezone,
            schedule_notes: b.scheduleNotes || (initialTimezone ? `[tz:${initialTimezone}]` : null),
            status: "draft",
          });

          console.log(
            "[DRAFT_STAGED]",
            JSON.stringify({
              postId: post.id,
              targetPageId: targetPage.page_id,
              targetPageName: destinationPageName,
              topic: postTopic,
              requestId: b.requestId ?? null,
              scheduledAt: initialScheduledAt,
              timezone: initialTimezone,
            })
          );

          const contentHash = computePostContentHash({
            postId: post.id,
            title: post.title,
            description: post.description,
            hashtags: post.hashtags,
            imageUrl: post.image_url,
            pageId: targetPage.page_id,
            linkUrl: post.link_url,
            utmSuffix: settings.utm_suffix,
          });

          const reviewUrl = buildDashboardReviewUrl(post.id, req);
          if (b.requestId) {
            try {
              await markContentRequestDraftCreated(b.requestId, post.id, reviewUrl);
            } catch (linkErr) {
              console.error("Failed to link draft to content request:", linkErr);
            }
          }

          return {
            status: 201,
            body: {
              postId: post.id,
              requestId: b.requestId || undefined,
              status: "pending_review",
              topic: post.topic,
              title: post.title,
              description: post.description,
              hashtags: post.hashtags,
              imageUrl: post.image_url,
              pageId: post.page_id,
              pageName: post.page_name,
              contentHash,
              reviewUrl,
              scheduledAt: post.scheduled_at,
              scheduledTimezone: post.scheduled_timezone || initialTimezone || null,
              approvalRequired: true,
              message:
                "Post staged and awaiting explicit user review. Please display the complete image preview, target Page, and caption to the user. " +
                (post.scheduled_at
                  ? `Requested schedule: ${post.scheduled_at} (${post.scheduled_timezone || "UTC"}). `
                  : "") +
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
                pageId: existingAfterConflict.page_id || "",
                linkUrl: existingAfterConflict.link_url,
                utmSuffix: settings.utm_suffix,
              });
              const reviewUrl = buildDashboardReviewUrl(existingAfterConflict.id, req);
              const isApproved = Boolean(existingAfterConflict.approved_by_user);
              let authoritativeStatus: PostStatus = existingAfterConflict.status;
              if (existingAfterConflict.status === "draft") {
                authoritativeStatus = isApproved
                  ? (existingAfterConflict.scheduled_at ? "scheduled" : "approved")
                  : "pending_review";
              }

              return {
                status: 200,
                body: {
                  postId: existingAfterConflict.id,
                  requestId: b.requestId || undefined,
                  status: authoritativeStatus,
                  title: existingAfterConflict.title,
                  description: existingAfterConflict.description,
                  hashtags: existingAfterConflict.hashtags,
                  imageUrl: existingAfterConflict.image_url,
                  pageId: existingAfterConflict.page_id,
                  pageName: existingAfterConflict.page_name,
                  contentHash,
                  reviewUrl,
                  scheduledAt: existingAfterConflict.scheduled_at,
                  scheduledTimezone: existingAfterConflict.scheduled_timezone || null,
                  approvalRequired: !isApproved,
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

    // chatgpt/requests/<id>/fail — failChatGPTContentRequest action
    if (path.length === 4 && path[0] === "chatgpt" && path[1] === "requests" && path[3] === "fail") {
      const requestId = path[2];
      const parsed = z
        .object({ error: z.string().trim().min(1).max(1000) })
        .safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return json({ error: "An error message is required (1-1000 characters)." }, 400);
      }
      try {
        const updated = await markContentRequestFailed(requestId, parsed.data.error);
        return json({
          ok: true,
          requestId: updated.id,
          status: "failed",
          errorMessage: updated.error_message,
          message: "Content request marked failed.",
        });
      } catch (err: any) {
        return json({ error: err.message || "Failed to mark content request failed." }, 400);
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
      const pageId = post.page_id;
      if (!pageId) {
        return json({ error: "Destination Facebook Page is not assigned to this staged post. Please assign a destination Page before approving." }, 409);
      }

      // Safeguard: If the caller passed expected/target Page ID or Page Name, verify it matches the staged post's target Page
      const expectedId = parsed.data.expectedPageId || parsed.data.targetPageId;
      const expectedName = parsed.data.expectedPageName || parsed.data.targetPageName;
      if (expectedId && expectedId !== pageId) {
        return json(
          {
            error: `Target Page ID mismatch: staged post is assigned to Page ID '${pageId}' ('${post.page_name || "Unknown"}'), but approval specified '${expectedId}'.`,
            code: "PAGE_MISMATCH",
          },
          409
        );
      }
      if (expectedName && post.page_name && normalizePageName(expectedName) !== normalizePageName(post.page_name)) {
        return json(
          {
            error: `Target Page Name mismatch: staged post is assigned to '${post.page_name}', but approval specified '${expectedName}'.`,
            code: "PAGE_MISMATCH",
          },
          409
        );
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

      let targetScheduledAt = post.scheduled_at;
      let targetTimezone = post.scheduled_timezone;
      let scheduleUpdate: { scheduled_at?: string | null; scheduled_timezone?: string | null; schedule_notes?: string | null } = {};

      if (parsed.data.scheduledAt) {
        const parsedDate = new Date(parsed.data.scheduledAt);
        if (isNaN(parsedDate.getTime())) {
          return json({ error: "Invalid scheduledAt format. Expected ISO-8601 date string." }, 400);
        }
        if (parsedDate.getTime() <= Date.now()) {
          return json({ error: "scheduledAt must be a future date and time." }, 400);
        }
        targetScheduledAt = parsedDate.toISOString();
        if (parsed.data.timezone) {
          if (!isValidTimezone(parsed.data.timezone)) {
            return json({ error: `Invalid timezone '${parsed.data.timezone}'. Provide a valid IANA timezone (e.g. 'Asia/Kolkata', 'UTC').` }, 400);
          }
          targetTimezone = normalizeTimezone(parsed.data.timezone);
        } else if (!targetTimezone) {
          targetTimezone = "UTC";
        }
        scheduleUpdate.scheduled_at = targetScheduledAt;
        scheduleUpdate.scheduled_timezone = targetTimezone;
        scheduleUpdate.schedule_notes = parsed.data.scheduleNotes || (targetTimezone ? `[tz:${targetTimezone}]` : null);
      }

      const hasFutureSchedule = Boolean(targetScheduledAt && new Date(targetScheduledAt).getTime() > Date.now());
      const nextStatus: PostStatus = hasFutureSchedule ? "scheduled" : "approved";

      // Record human user approval in the database (persisting approval state and updating status)
      await updatePostRecord(post.id, {
        approved_by_user: true,
        approved_at: new Date().toISOString(),
        approval_content_hash: currentHash,
        status: nextStatus,
        ...scheduleUpdate,
      });

      const reviewUrl = buildDashboardReviewUrl(post.id, req);

      try {
        const { token, expiresAt } = await issueApprovalToken({
          postId: post.id,
          contentHash: currentHash,
          ttlSeconds: 600,
        });

        console.log(
          "[POST_APPROVED]",
          JSON.stringify({
            postId: post.id,
            pageId,
            pageName: post.page_name,
            contentHash: currentHash,
            userConfirmed: true,
            status: nextStatus,
            scheduledAt: targetScheduledAt,
            scheduledTimezone: targetTimezone,
          })
        );

        return json({
          approved: true,
          postId: post.id,
          status: nextStatus,
          contentHash: currentHash,
          approvalToken: token,
          expiresAt: new Date(expiresAt).toISOString(),
          reviewUrl,
          scheduledAt: targetScheduledAt || null,
          scheduledTimezone: targetTimezone || null,
          message: hasFutureSchedule
            ? `Post approved and scheduled for ${targetScheduledAt} (${targetTimezone || "UTC"}). It will be automatically published at the scheduled time.`
            : "Post explicitly approved by user. You may now call POST /api/chatgpt/posts/{id}/publish with this single-use approvalToken before it expires (10 minutes).",
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
          title: post.title,
          imageUrl: post.image_url,
          pageId: post.page_id,
          pageName: post.page_name,
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
      const pageId = post.page_id;
      if (!pageId) {
        return json({ error: "Destination Facebook Page is not assigned to this post. Please assign a destination Page before publishing." }, 409);
      }

      // Safeguard: verify target Page matches caller expectation if specified
      const expectedId = parsed.data.expectedPageId || parsed.data.targetPageId;
      const expectedName = parsed.data.expectedPageName || parsed.data.targetPageName;
      if (expectedId && expectedId !== pageId) {
        return json(
          {
            error: `Target Page ID mismatch: staged post is assigned to Page ID '${pageId}' ('${post.page_name || "Unknown"}'), but publishing specified '${expectedId}'.`,
            code: "PAGE_MISMATCH",
          },
          409
        );
      }
      if (expectedName && post.page_name && normalizePageName(expectedName) !== normalizePageName(post.page_name)) {
        return json(
          {
            error: `Target Page Name mismatch: staged post is assigned to '${post.page_name}', but publishing specified '${expectedName}'.`,
            code: "PAGE_MISMATCH",
          },
          409
        );
      }

      const targetPage = await getPageWithToken(pageId);
      const pageToken = targetPage?.access_token;

      if (!pageToken || (targetPage && targetPage.is_active === false)) {
        return json(
          {
            error: `Destination Facebook Page (${post.page_name || pageId || "unknown"}) is ${
              targetPage?.is_active === false ? "disconnected or inactive" : "not configured or token is missing"
            }.`,
          },
          409
        );
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
            pageId: post.page_id,
            pageName: post.page_name,
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
          title: published.title,
          imageUrl: published.image_url,
          pageId: published.page_id,
          pageName: published.page_name,
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

    // chatgpt/posts/<id>/schedule — explicit ChatGPT scheduling action
    if (path.length === 4 && path[0] === "chatgpt" && path[1] === "posts" && path[3] === "schedule") {
      const id = path[2];
      const post = await getPost(id);
      if (!post) return notFound();

      if (post.status === "posted") {
        return json({ error: "Post has already been published to Facebook." }, 400);
      }
      if (post.status === "publishing") {
        return json({ error: "Post is currently being published by another request." }, 409);
      }

      const parsed = ScheduleChatGPTPostBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return json(
          { error: parsed.error.issues[0]?.message || "A valid scheduledAt ISO datetime string is required." },
          400
        );
      }

      const parsedDate = new Date(parsed.data.scheduledAt);
      if (isNaN(parsedDate.getTime())) {
        return json({ error: "Invalid scheduledAt format. Expected ISO-8601 date string." }, 400);
      }
      if (parsedDate.getTime() <= Date.now()) {
        return json({ error: "Cannot schedule a post for a past or current time. scheduledAt must be in the future." }, 400);
      }

      const pageId = post.page_id;
      if (!pageId) {
        return json({ error: "Destination Facebook Page is not assigned to this post. Please assign a destination Page before scheduling." }, 409);
      }

      const settings = await getSettings();
      let resolvedTz = post.scheduled_timezone || settings.timezone || DEFAULT_TIMEZONE;
      if (parsed.data.timezone) {
        if (!isValidTimezone(parsed.data.timezone)) {
          return json({ error: `Invalid timezone '${parsed.data.timezone}'. Provide a valid IANA timezone name (e.g. 'Asia/Kolkata', 'UTC').` }, 400);
        }
        resolvedTz = normalizeTimezone(parsed.data.timezone);
      }

      let isApproved = Boolean(post.approved_by_user);
      let approvedAt = post.approved_at;
      let approvalContentHash = post.approval_content_hash;

      if (parsed.data.userConfirmed) {
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

        if (parsed.data.contentHash && parsed.data.contentHash !== currentHash) {
          return json({ error: "Content hash mismatch. Post content has been modified since review." }, 400);
        }

        isApproved = true;
        approvedAt = new Date().toISOString();
        approvalContentHash = currentHash;
      }

      const nextStatus: PostStatus = isApproved ? "scheduled" : "draft";

      let resolvedNotes = parsed.data.scheduleNotes ?? post.schedule_notes ?? null;
      if (resolvedNotes && resolvedTz) {
        resolvedNotes = resolvedNotes.replace(/\[tz:[^\]]+\]\s*/g, "").trim();
        resolvedNotes = `[tz:${resolvedTz}] ${resolvedNotes}`.trim();
      } else if (!resolvedNotes && resolvedTz) {
        resolvedNotes = `[tz:${resolvedTz}]`;
      }

      const updated = await updatePostRecord(post.id, {
        scheduled_at: parsedDate.toISOString(),
        scheduled_timezone: resolvedTz,
        schedule_notes: resolvedNotes || null,
        status: nextStatus,
        ...(isApproved ? { approved_by_user: true, approved_at: approvedAt, approval_content_hash: approvalContentHash } : {}),
        error_message: null,
      });

      const reviewUrl = buildDashboardReviewUrl(post.id, req);

      return json({
        ok: true,
        postId: updated.id,
        status: isApproved ? "scheduled" : "pending_review",
        scheduledAt: updated.scheduled_at,
        scheduledTimezone: updated.scheduled_timezone,
        approved: isApproved,
        reviewUrl,
        message: isApproved
          ? `Post successfully scheduled for publication at ${updated.scheduled_at} (${resolvedTz}).`
          : `Scheduled time recorded for ${updated.scheduled_at} (${resolvedTz}). Post remains pending approval. Explicit user confirmation is required before publication.`,
      });
    }

    // chatgpt/posts/<id>/cancel-schedule — ChatGPT cancel schedule action
    if (path.length === 4 && path[0] === "chatgpt" && path[1] === "posts" && path[3] === "cancel-schedule") {
      const id = path[2];
      const post = await getPost(id);
      if (!post) return notFound();

      if (post.status === "posted") {
        return json({ error: "Cannot cancel schedule of an already-published post." }, 400);
      }
      if (post.status === "publishing") {
        return json({ error: "Cannot cancel schedule while publishing is in progress." }, 409);
      }

      let cleanNotes = post.schedule_notes ? post.schedule_notes.replace(/\[tz:[^\]]+\]\s*/g, "").trim() : null;
      cleanNotes = cleanNotes || null;

      const nextStatus: PostStatus = post.approved_by_user ? "approved" : "draft";
      const updated = await updatePostRecord(post.id, {
        scheduled_at: null,
        scheduled_timezone: null,
        schedule_notes: cleanNotes,
        status: nextStatus,
        error_message: null,
      });

      return json({
        ok: true,
        postId: updated.id,
        status: updated.approved_by_user ? "approved" : "pending_review",
        scheduledAt: null,
        scheduledTimezone: null,
        reviewUrl: buildDashboardReviewUrl(post.id, req),
        message: "Scheduled publication cancelled. Post has returned to draft/approved state.",
      });
    }

    if (route === "facebook/disconnect") {
      const current = await getSettings().catch(() => null);
      if (current?.facebook_user_token) {
        await revokeFacebookAccess(current.facebook_user_token).catch(() => null);
      }
      await updateSettings({
        facebook_user_token: null,
        facebook_token_expires_at: null,
        facebook_user_name: null,
        default_page_id: null,
        default_page_name: null,
        default_page_token: null,
      });
      await disconnectAllPages();
      return json({ ok: true, disconnected: true });
    }

    // facebook/pages/<id>/disconnect — disconnect individual Page without disconnecting account
    if (path.length === 4 && path[0] === "facebook" && path[1] === "pages" && path[3] === "disconnect") {
      const pageId = path[2];
      const result = await disconnectPage(pageId);
      return json({ ok: true, pageId, wasDefault: result.wasDefault });
    }

    // facebook/pages/<id>/reconnect — reactivate individual Page
    if (path.length === 4 && path[0] === "facebook" && path[1] === "pages" && path[3] === "reconnect") {
      const pageId = path[2];
      const ok = await reconnectPage(pageId);
      return json({ ok, pageId });
    }

    // facebook/pages/add — directly link/sync a specific Page by ID
    if (route === "facebook/pages/add") {
      const body = await req.json().catch(() => ({}));
      const pageId = String(body.pageId ?? "").trim();
      if (!pageId) {
        return json({ error: "pageId is required." }, 400);
      }
      try {
        const page = await fetchSinglePage(pageId);
        if (!page || !page.access_token) {
          return json(
            {
              error: `Could not access Page with ID "${pageId}". Ensure your Facebook account has admin or content creation tasks on this Page.`,
            },
            404
          );
        }
        const settings = await getSettings();
        await upsertPages([page], settings.facebook_user_name);
        return json({ ok: true, page });
      } catch (err: any) {
        return json({ error: err?.message || "Failed to retrieve Page from Facebook." }, 502);
      }
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
  chatgpt_custom_gpt_url: z.string().trim().url().nullable().optional(),
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
  timezone: z.string().max(100).optional(),
  status: z.enum(["draft", "scheduled", "approved", "failed"]).optional(),
  approve: z.boolean().optional(),
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

      if (b.scheduledAt !== undefined && b.scheduledAt !== null) {
        if (new Date(b.scheduledAt).getTime() <= Date.now()) {
          return json({ error: "Cannot schedule a post for an invalid or past time." }, 400);
        }
      }

      let validatedPageId = b.pageId;
      let validatedPageName = b.pageName;
      if (b.pageId !== undefined || b.pageName !== undefined) {
        const resolved = await resolveTargetFacebookPage({ pageId: b.pageId, pageName: b.pageName, allowDefault: false });
        if (!resolved.page) {
          return json({ error: resolved.message || `Destination page '${b.pageId || b.pageName}' is not connected or authorized.` }, 400);
        }
        validatedPageId = resolved.page.page_id;
        validatedPageName = resolved.page.name;
      }

      let validatedTimezone = existing.scheduled_timezone;
      if (b.timezone !== undefined) {
        if (!isValidTimezone(b.timezone)) {
          return json({ error: `Invalid timezone '${b.timezone}'. Provide a valid IANA timezone name.` }, 400);
        }
        validatedTimezone = normalizeTimezone(b.timezone);
      }

      const isScheduling = b.scheduledAt !== undefined && b.scheduledAt !== null;
      const shouldApproveOnSchedule = isScheduling && b.approve !== false;

      let scheduleApprovalPatch: Partial<Post> = {};
      if (shouldApproveOnSchedule && (existing.image_url && (validatedPageId || existing.page_id))) {
        const settings = await getSettings();
        const effectivePageId = validatedPageId || existing.page_id || "";
        const hash = computePostContentHash({
          postId: existing.id,
          title: b.title !== undefined ? b.title : existing.title,
          description: b.description !== undefined ? b.description : existing.description,
          hashtags: b.hashtags !== undefined ? b.hashtags : existing.hashtags,
          imageUrl: existing.image_url,
          pageId: effectivePageId,
          linkUrl: b.linkUrl !== undefined ? (b.linkUrl || null) : (existing.link_url || null),
          utmSuffix: settings.utm_suffix,
        });
        scheduleApprovalPatch = {
          approved_by_user: true,
          approved_at: new Date().toISOString(),
          approval_content_hash: hash,
        };
      }

      const contentChanged =
        !shouldApproveOnSchedule &&
        ((b.title !== undefined && b.title !== existing.title) ||
        (b.description !== undefined && b.description !== existing.description) ||
        (b.hashtags !== undefined && JSON.stringify(b.hashtags) !== JSON.stringify(existing.hashtags)) ||
        (b.linkUrl !== undefined && (b.linkUrl || null) !== (existing.link_url || null)) ||
        (validatedPageId !== undefined && validatedPageId !== existing.page_id));

      const updated = await updatePostRecord(id, {
        ...(b.title !== undefined && { title: b.title }),
        ...(b.description !== undefined && { description: b.description }),
        ...(b.hashtags !== undefined && { hashtags: b.hashtags }),
        ...(b.linkUrl !== undefined && { link_url: b.linkUrl || null }),
        ...(validatedPageId !== undefined && { page_id: validatedPageId }),
        ...(validatedPageName !== undefined && { page_name: validatedPageName }),
        ...(b.scheduledAt !== undefined && { scheduled_at: b.scheduledAt }),
        ...(b.timezone !== undefined && { scheduled_timezone: validatedTimezone }),
        ...(b.status !== undefined && { status: b.status }),
        ...(contentChanged && {
          approved_by_user: false,
          approved_at: null,
          approval_content_hash: null,
        }),
        ...scheduleApprovalPatch,
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
  try {
    const settings = await getSettings();
    if (!settings.facebook_user_token) {
      return json({ error: "Facebook is not connected." }, 409);
    }

    let pagesList = await listPages({ includeInactive: true });

    // If explicit refresh requested, OR if cache is empty while account is connected:
    if (refresh || pagesList.length === 0) {
      const fetched = await fetchPages();
      if (fetched.length > 0) {
        await upsertPages(fetched, settings.facebook_user_name);
        pagesList = await listPages({ includeInactive: true });

        // Auto-select or preserve default page
        const freshSettings = await getSettings();
        const hasMatchingDefault = pagesList.some(
          (p) => p.page_id === freshSettings.default_page_id && p.is_active
        );
        if (!hasMatchingDefault || !freshSettings.default_page_id) {
          const firstActive = pagesList.find((p) => p.is_active) ?? pagesList[0];
          if (firstActive) {
            await setDefaultPage(firstActive.page_id);
          }
        }
      }
    }

    const currentSettings = await getSettings();
    return json({
      pages: pagesList,
      defaultPageId: currentSettings.default_page_id,
      accountName: currentSettings.facebook_user_name,
      connected: Boolean(currentSettings.facebook_user_token),
      status: !currentSettings.facebook_user_token
        ? "disconnected"
        : pagesList.length === 0
        ? "no_pages"
        : currentSettings.default_page_id
        ? "ready"
        : "needs_selection",
    });
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
      if (pages.length > 0) {
        let accountName: string | null = null;
        try {
          const acc = await fetchAccount();
          accountName = acc.name;
        } catch {}

        await upsertPages(pages, accountName);

        const currentSettings = await getSettings();
        const existingDefaultMatch = pages.find((p) => p.id === currentSettings.default_page_id);
        if (existingDefaultMatch) {
          await setDefaultPage(existingDefaultMatch.id);
        } else if (pages.length === 1 || !currentSettings.default_page_id) {
          await setDefaultPage(pages[0].id);
        }
      }
    } catch (pageSyncErr) {
      console.warn("OAuth callback page sync warning:", pageSyncErr);
    }

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
    const isSessionAuthed = await hasSession(req);
    if (!isSessionAuthed) {
      const auth = req.headers.get("authorization");
      const provided = url.searchParams.get("secret");
      if (auth !== `Bearer ${env.cronSecret}` && provided !== env.cronSecret) {
        return json({ error: "Unauthorized" }, 401);
      }
    }
  }


  const nowParam = url.searchParams.get("now");
  const dryRunParam =
    url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true";

  const schedulerReport = await processDueScheduledPosts({
    nowIso: nowParam ?? new Date().toISOString(),
    dryRun: dryRunParam,
  });

  const autopilotResult = await maybeRunAutopilot();

  return json({
    processedFromQueue: schedulerReport.published,
    queueResults: schedulerReport.results.map((r) => ({
      id: r.postId,
      status: r.status,
      error: r.errorMessage,
    })),
    schedulerReport,
    autopilot: autopilotResult,
  });
}
