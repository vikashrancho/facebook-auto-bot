import { supabaseAdmin } from "@/lib/supabase/server";
import { GRAPH_BASE } from "@/lib/facebook/oauth";
import { env } from "@/lib/env";
import type { AppSettings } from "@/lib/types";

export class FacebookNotConnectedError extends Error {
  constructor() {
    super("Facebook is not connected. Connect it from Settings first.");
  }
}

export class NoPageSelectedError extends Error {
  constructor() {
    super("No Facebook Page selected. Choose one on the Pages screen first.");
  }
}

async function loadSettings(): Promise<AppSettings> {
  const db = supabaseAdmin();
  const { data } = await db.from("app_settings").select("*").eq("id", 1).single<AppSettings>();
  if (!data) throw new Error("Settings row is missing.");
  return data;
}

async function graph(path: string, params: Record<string, string>, init?: RequestInit) {
  const url = `${GRAPH_BASE}${path}`;
  const res = await fetch(init?.method === "POST" ? url : `${url}?${new URLSearchParams(params)}`, {
    ...init,
    ...(init?.method === "POST"
      ? {
          headers: { "Content-Type": "application/x-www-form-urlencoded", ...init?.headers },
          body: new URLSearchParams(params),
        }
      : {}),
    signal: AbortSignal.timeout(30_000),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || body?.error) {
    throw new Error(body?.error?.message ?? `Facebook API ${path} failed (${res.status})`);
  }
  return body;
}

export interface FacebookPage {
  id: string;
  name: string;
  category: string | null;
  /** Non-expiring when minted from a long-lived user token. */
  access_token: string;
  tasks?: string[];
  picture_url?: string | null;
}

/** Revoke user permissions on Facebook side so subsequent connect re-prompts cleanly. */
export async function revokeFacebookAccess(userToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${GRAPH_BASE}/me/permissions?${new URLSearchParams({ access_token: userToken })}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json().catch(() => null);
    return Boolean(res.ok && (body?.success || body === true));
  } catch {
    return false;
  }
}

/**
 * Every Page this person can create content on.
 * Queries both:
 * 1. Classic /me/accounts (with pagination, tasks, and profile picture)
 * 2. Granular scopes target IDs from debug_token (Meta Login for Business & New Pages Experience)
 */
export async function fetchPages(): Promise<FacebookPage[]> {
  const settings = await loadSettings();
  if (!settings.facebook_user_token) throw new FacebookNotConnectedError();

  const pagesMap = new Map<string, FacebookPage>();
  let after: string | undefined;

  // 1. Classic /me/accounts
  try {
    do {
      const params: Record<string, string> = {
        access_token: settings.facebook_user_token,
        fields: "id,name,category,access_token,tasks,picture{url}",
        limit: "100",
      };
      if (after) params.after = after;

      const data = await graph("/me/accounts", params);
      for (const p of data.data ?? []) {
        if (Array.isArray(p.tasks) && p.tasks.length > 0 && !p.tasks.includes("CREATE_CONTENT") && !p.tasks.includes("MANAGE")) {
          continue;
        }
        if (p.id && p.access_token) {
          const picUrl = p.picture?.data?.url ?? null;
          pagesMap.set(p.id, {
            id: p.id,
            name: p.name,
            category: p.category ?? null,
            access_token: p.access_token,
            tasks: Array.isArray(p.tasks) ? p.tasks : [],
            picture_url: picUrl,
          });
        }
      }
      after = data.paging?.cursors?.after && data.paging?.next ? data.paging.cursors.after : undefined;
    } while (after);
  } catch (err) {
    // Non-fatal if /me/accounts fails (e.g. user uses New Pages Experience / Business Assets)
  }

  // 2. Discover Pages from granular scopes via debug_token (Meta Login for Business & New Pages Experience)
  const appId = settings.facebook_app_id || env.facebookAppIdOptional;
  const appSecret = settings.facebook_app_secret || env.facebookAppSecretOptional;
  if (appId && appSecret) {
    try {
      const appToken = `${appId}|${appSecret}`;
      const debugData = await graph("/debug_token", {
        input_token: settings.facebook_user_token,
        access_token: appToken,
      });

      const granular = debugData?.data?.granular_scopes ?? [];
      const targetIds = new Set<string>();

      for (const g of granular) {
        if (["pages_show_list", "pages_manage_posts", "pages_read_engagement"].includes(g.scope)) {
          for (const tid of g.target_ids ?? []) {
            if (tid) targetIds.add(String(tid));
          }
        }
      }

      for (const targetId of targetIds) {
        if (!pagesMap.has(targetId)) {
          try {
            const pData = await graph(`/${targetId}`, {
              access_token: settings.facebook_user_token,
              fields: "id,name,category,access_token,picture{url}",
            });
            if (pData?.id && pData?.access_token) {
              const picUrl = pData.picture?.data?.url ?? null;
              pagesMap.set(pData.id, {
                id: pData.id,
                name: pData.name,
                category: pData.category ?? null,
                access_token: pData.access_token,
                tasks: ["CREATE_CONTENT", "MANAGE"],
                picture_url: picUrl,
              });
            }
          } catch {
            // Ignore single page lookup failures
          }
        }
      }
    } catch {
      // Non-fatal if debug_token is unavailable
    }
  }

  // 3. If settings.default_page_id exists and is not yet in the map, attempt to refresh it directly
  if (settings.default_page_id && !pagesMap.has(settings.default_page_id)) {
    try {
      const pData = await graph(`/${settings.default_page_id}`, {
        access_token: settings.facebook_user_token,
        fields: "id,name,category,access_token,picture{url}",
      });
      if (pData?.id && pData?.access_token) {
        const picUrl = pData.picture?.data?.url ?? null;
        pagesMap.set(pData.id, {
          id: pData.id,
          name: pData.name,
          category: pData.category ?? null,
          access_token: pData.access_token,
          tasks: ["CREATE_CONTENT", "MANAGE"],
          picture_url: picUrl,
        });
      }
    } catch {
      // If user token direct query fails, try with default_page_token if stored
      if (settings.default_page_token) {
        try {
          const pData = await graph(`/${settings.default_page_id}`, {
            access_token: settings.default_page_token,
            fields: "id,name,category,access_token,picture{url}",
          });
          if (pData?.id) {
            const picUrl = pData.picture?.data?.url ?? null;
            pagesMap.set(pData.id, {
              id: pData.id,
              name: pData.name,
              category: pData.category ?? null,
              access_token: settings.default_page_token,
              tasks: ["CREATE_CONTENT", "MANAGE"],
              picture_url: picUrl,
            });
          }
        } catch {}
      }
    }
  }

  // 4. Query any other pages previously cached in pages_cache to keep them synced
  try {
    const db = supabaseAdmin();
    const { data: cached } = await db
      .from("pages_cache")
      .select("page_id, name, category, access_token, picture_url, tasks, is_active");
    if (cached) {
      for (const cp of cached) {
        if (!pagesMap.has(cp.page_id)) {
          // Attempt direct lookup with user token to refresh its access_token and picture
          try {
            const pData = await graph(`/${cp.page_id}`, {
              access_token: settings.facebook_user_token,
              fields: "id,name,category,access_token,picture{url}",
            });
            if (pData?.id && pData?.access_token) {
              pagesMap.set(pData.id, {
                id: pData.id,
                name: pData.name,
                category: pData.category ?? cp.category ?? null,
                access_token: pData.access_token,
                tasks: cp.tasks && cp.tasks.length > 0 ? cp.tasks : ["CREATE_CONTENT", "MANAGE"],
                picture_url: pData.picture?.data?.url ?? cp.picture_url ?? null,
              });
              continue;
            }
          } catch {}

          // If direct refresh fails but page has a stored access_token, preserve it!
          if (cp.access_token) {
            pagesMap.set(cp.page_id, {
              id: cp.page_id,
              name: cp.name,
              category: cp.category ?? null,
              access_token: cp.access_token,
              tasks: cp.tasks && cp.tasks.length > 0 ? cp.tasks : ["CREATE_CONTENT", "MANAGE"],
              picture_url: cp.picture_url ?? null,
            });
          }
        }
      }
    }
  } catch {}

  // 5. Query any other pages referenced in posts or content_requests
  try {
    const db = supabaseAdmin();
    const { data: postPageIds } = await db
      .from("posts")
      .select("page_id")
      .not("page_id", "is", null);
    if (postPageIds) {
      const distinctIds = Array.from(
        new Set(postPageIds.map((p: any) => p.page_id).filter(Boolean))
      );
      for (const pid of distinctIds) {
        if (!pagesMap.has(pid)) {
          try {
            const pData = await graph(`/${pid}`, {
              access_token: settings.facebook_user_token,
              fields: "id,name,category,access_token,picture{url}",
            });
            if (pData?.id && pData?.access_token) {
              pagesMap.set(pData.id, {
                id: pData.id,
                name: pData.name,
                category: pData.category ?? null,
                access_token: pData.access_token,
                tasks: ["CREATE_CONTENT", "MANAGE"],
                picture_url: pData.picture?.data?.url ?? null,
              });
            }
          } catch {}
        }
      }
    }
  } catch {}

  return Array.from(pagesMap.values());
}

/**
 * Fetch and authorize a single Facebook Page by ID directly.
 * Useful for NPE / Business Suite Pages that do not appear on /me/accounts.
 */
export async function fetchSinglePage(pageId: string): Promise<FacebookPage | null> {
  const settings = await loadSettings();
  if (!settings.facebook_user_token) throw new FacebookNotConnectedError();

  const cleanId = pageId.trim();
  if (!cleanId) return null;

  try {
    const pData = await graph(`/${cleanId}`, {
      access_token: settings.facebook_user_token,
      fields: "id,name,category,access_token,picture{url}",
    });
    if (pData?.id && pData?.access_token) {
      return {
        id: pData.id,
        name: pData.name,
        category: pData.category ?? null,
        access_token: pData.access_token,
        tasks: ["CREATE_CONTENT", "MANAGE"],
        picture_url: pData.picture?.data?.url ?? null,
      };
    }
  } catch (err: any) {
    // If user token fails, try default page token if this page matches default
    if (cleanId === settings.default_page_id && settings.default_page_token) {
      try {
        const pData = await graph(`/${cleanId}`, {
          access_token: settings.default_page_token,
          fields: "id,name,category,access_token,picture{url}",
        });
        if (pData?.id) {
          return {
            id: pData.id,
            name: pData.name,
            category: pData.category ?? null,
            access_token: settings.default_page_token,
            tasks: ["CREATE_CONTENT", "MANAGE"],
            picture_url: pData.picture?.data?.url ?? null,
          };
        }
      } catch {}
    }
    throw err;
  }

  return null;
}

/** Permissions this app cannot work without. */
export const REQUIRED_PERMISSIONS = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
];

/**
 * Which of the required permissions the connected account actually granted.
 *
 * Worth checking explicitly: when the Meta app uses Login for Business the
 * permissions come from a saved configuration, so a configuration missing
 * `pages_manage_posts` connects perfectly and then fails at publish time with a
 * bare "(#200) Permissions error" that names nothing.
 */
export async function missingPermissions(userToken: string): Promise<string[]> {
  try {
    const data = await graph("/me/permissions", { access_token: userToken });
    const granted = new Set(
      (data.data ?? [])
        .filter((p: { status: string }) => p.status === "granted")
        .map((p: { permission: string }) => p.permission)
    );
    return REQUIRED_PERMISSIONS.filter((p) => !granted.has(p));
  } catch {
    return [];
  }
}

export async function fetchAccount(): Promise<{ name: string }> {
  const settings = await loadSettings();
  if (!settings.facebook_user_token) throw new FacebookNotConnectedError();
  const data = await graph("/me", { access_token: settings.facebook_user_token, fields: "name" });
  return { name: data.name };
}

export interface PublishPhotoInput {
  pageId: string;
  pageToken: string;
  message: string;
  imageUrl: string;
}

/**
 * Publishes a photo post. Meta fetches the image from `url` itself, which is
 * why every generated image is re-hosted on Supabase Storage first — a
 * best-effort free provider's URL would not be a safe thing for Facebook's
 * crawler to depend on.
 */
export async function publishPhoto(input: PublishPhotoInput): Promise<{ id: string }> {
  const data = await graph(
    `/${input.pageId}/photos`,
    {
      url: input.imageUrl,
      message: input.message,
      access_token: input.pageToken,
      published: "true",
    },
    { method: "POST" }
  );
  return { id: data.post_id ?? data.id };
}

export interface FacebookDiagnosticResult {
  connectionStatus: "connected" | "disconnected" | "reauthorization_required" | "invalid_token" | "page_error" | "ready";
  tokenValid: boolean;
  tokenExpired: boolean;
  tokenType: "PAGE" | "USER" | "NONE";
  metaAppId: string | null;
  appIdMatch: boolean;
  selectedPageId: string | null;
  selectedPageName: string | null;
  pageIdMatch: boolean;
  pageTokenValid: boolean;
  canPublish: boolean;
  requiredPermissionsPresent: boolean;
  missingPermissions: string[];
  reauthorizationRequired: boolean;
  errorCode: string | null;
  message: string;
}

/**
 * Server-side Facebook connection and Page credential diagnostic.
 * Validates User token and Page Access Token against Meta Graph API.
 * Returns strictly sanitized status flags and diagnostic messages.
 * NEVER returns the access token itself or sensitive credentials.
 */
export async function diagnoseFacebookConnection(
  targetPageId?: string
): Promise<FacebookDiagnosticResult> {
  const settings = await loadSettings();

  if (!settings.facebook_user_token) {
    return {
      connectionStatus: "disconnected",
      tokenValid: false,
      tokenExpired: false,
      tokenType: "NONE",
      metaAppId: settings.facebook_app_id || env.facebookAppIdOptional || null,
      appIdMatch: true,
      selectedPageId: null,
      selectedPageName: null,
      pageIdMatch: false,
      pageTokenValid: false,
      canPublish: false,
      requiredPermissionsPresent: false,
      missingPermissions: REQUIRED_PERMISSIONS,
      reauthorizationRequired: true,
      errorCode: "NOT_CONNECTED",
      message: "Facebook account is not connected. Reconnection is required in Settings.",
    };
  }

  // Detect test fixtures / corrupted tokens
  if (
    settings.facebook_user_token.startsWith("mock_") ||
    settings.facebook_user_token.startsWith("test_") ||
    settings.facebook_user_token.length < 30
  ) {
    return {
      connectionStatus: "invalid_token",
      tokenValid: false,
      tokenExpired: false,
      tokenType: "USER",
      metaAppId: settings.facebook_app_id || env.facebookAppIdOptional || null,
      appIdMatch: true,
      selectedPageId: settings.default_page_id || null,
      selectedPageName: settings.default_page_name || null,
      pageIdMatch: false,
      pageTokenValid: false,
      canPublish: false,
      requiredPermissionsPresent: false,
      missingPermissions: [],
      reauthorizationRequired: true,
      errorCode: "CORRUPT_OR_MOCK_TOKEN",
      message: "The stored Facebook User token is a test placeholder or corrupted. Please reconnect in Settings.",
    };
  }

  // Check user token validity and permissions
  let missing: string[] = [];
  try {
    const account = await graph("/me", {
      access_token: settings.facebook_user_token,
      fields: "id,name",
    });
    if (!account?.id) {
      throw new Error("Unable to verify user account on Meta Graph API.");
    }
    missing = await missingPermissions(settings.facebook_user_token);
  } catch (err: any) {
    const errMsg = err?.message || "";
    const isExpired = /expired|session has expired|invalid oauth access token|\(#190\)/i.test(errMsg);
    return {
      connectionStatus: "reauthorization_required",
      tokenValid: false,
      tokenExpired: isExpired,
      tokenType: "USER",
      metaAppId: settings.facebook_app_id || env.facebookAppIdOptional || null,
      appIdMatch: true,
      selectedPageId: settings.default_page_id || null,
      selectedPageName: settings.default_page_name || null,
      pageIdMatch: false,
      pageTokenValid: false,
      canPublish: false,
      requiredPermissionsPresent: false,
      missingPermissions: REQUIRED_PERMISSIONS,
      reauthorizationRequired: true,
      errorCode: isExpired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
      message: `Facebook User access token is ${isExpired ? "expired" : "invalid or revoked"}. Please re-authenticate your Facebook account in Settings.`,
    };
  }

  // Resolve target Page
  const pageId = targetPageId || settings.default_page_id;
  if (!pageId) {
    return {
      connectionStatus: "connected",
      tokenValid: true,
      tokenExpired: false,
      tokenType: "USER",
      metaAppId: settings.facebook_app_id || env.facebookAppIdOptional || null,
      appIdMatch: true,
      selectedPageId: null,
      selectedPageName: null,
      pageIdMatch: false,
      pageTokenValid: false,
      canPublish: false,
      requiredPermissionsPresent: missing.length === 0,
      missingPermissions: missing,
      reauthorizationRequired: false,
      errorCode: "NO_PAGE_SELECTED",
      message: "Facebook account is connected, but no default Facebook Page is selected. Please select a Page on the Pages screen.",
    };
  }

  // Fetch page credentials from pages_cache
  const db = supabaseAdmin();
  const { data: pageRecord } = await db
    .from("pages_cache")
    .select("page_id, name, access_token, is_active, tasks")
    .eq("page_id", pageId)
    .maybeSingle();

  const pageToken =
    pageRecord?.access_token ||
    (pageId === settings.default_page_id ? settings.default_page_token : null);

  if (!pageToken || pageToken.startsWith("mock_") || pageToken.startsWith("test_") || pageToken.length < 30) {
    return {
      connectionStatus: "page_error",
      tokenValid: true,
      tokenExpired: false,
      tokenType: "USER",
      metaAppId: settings.facebook_app_id || env.facebookAppIdOptional || null,
      appIdMatch: true,
      selectedPageId: pageId,
      selectedPageName: pageRecord?.name || settings.default_page_name || null,
      pageIdMatch: false,
      pageTokenValid: false,
      canPublish: false,
      requiredPermissionsPresent: missing.length === 0,
      missingPermissions: missing,
      reauthorizationRequired: true,
      errorCode: "INVALID_PAGE_TOKEN",
      message: `The selected Page (${pageRecord?.name || settings.default_page_name || pageId}) does not have a valid Page Access Token. Please re-select or reconnect on the Pages screen.`,
    };
  }

  // Validate Page token against Graph API
  try {
    const pageData = await graph(`/${pageId}`, {
      access_token: pageToken,
      fields: "id,name,can_post,category",
    });

    const pageIdMatch = pageData?.id === pageId;
    const canPublish = Boolean(pageData?.can_post !== false);

    return {
      connectionStatus: canPublish ? "ready" : "page_error",
      tokenValid: true,
      tokenExpired: false,
      tokenType: "PAGE",
      metaAppId: settings.facebook_app_id || env.facebookAppIdOptional || null,
      appIdMatch: true,
      selectedPageId: pageId,
      selectedPageName: pageData?.name || pageRecord?.name || settings.default_page_name || null,
      pageIdMatch,
      pageTokenValid: true,
      canPublish,
      requiredPermissionsPresent: missing.length === 0,
      missingPermissions: missing,
      reauthorizationRequired: false,
      errorCode: canPublish ? null : "CANNOT_POST",
      message: canPublish
        ? `Facebook connection and destination Page "${pageData?.name || pageId}" are valid and authorized to publish.`
        : `Page token is valid, but Meta reports can_post=false for "${pageData?.name || pageId}".`,
    };
  } catch (pageErr: any) {
    const isExpired = /expired|session has expired|invalid oauth access token|\(#190\)/i.test(pageErr.message);
    return {
      connectionStatus: "page_error",
      tokenValid: false,
      tokenExpired: isExpired,
      tokenType: "PAGE",
      metaAppId: settings.facebook_app_id || env.facebookAppIdOptional || null,
      appIdMatch: true,
      selectedPageId: pageId,
      selectedPageName: pageRecord?.name || settings.default_page_name || null,
      pageIdMatch: false,
      pageTokenValid: false,
      canPublish: false,
      requiredPermissionsPresent: missing.length === 0,
      missingPermissions: missing,
      reauthorizationRequired: true,
      errorCode: isExpired ? "PAGE_TOKEN_EXPIRED" : "PAGE_TOKEN_REJECTED",
      message: `Facebook rejected the Page token for "${pageRecord?.name || pageId}": ${pageErr.message}`,
    };
  }
}
