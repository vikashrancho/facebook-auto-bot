import { supabaseAdmin } from "@/lib/supabase/server";
import { getSettings, updateSettings } from "@/lib/db/settings";
import type { FacebookPage } from "@/lib/facebook/client";
import type { PageCache, StoredFacebookPage } from "@/lib/types";

/**
 * List all connected Facebook Pages.
 * Returns public metadata only (access tokens are stripped).
 * Gracefully handles both upgraded and legacy database schemas.
 */
export async function listPages(options: { includeInactive?: boolean } = {}): Promise<PageCache[]> {
  const db = supabaseAdmin();
  const settings = await getSettings();

  try {
    // Attempt query with extended multi-page columns
    let query = db
      .from("pages_cache")
      .select("page_id, name, category, picture_url, tasks, account_name, is_active, connected_at, fetched_at")
      .order("name");

    if (!options.includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) {
      // If extended columns don't exist yet (migration not yet run in Supabase)
      if (error.code === "42703" || error.message.includes("does not exist")) {
        return fallbackListPages(settings);
      }
      throw error;
    }

    return (data ?? []).map((row: any) => ({
      page_id: row.page_id,
      name: row.name,
      category: row.category ?? null,
      picture_url: row.picture_url ?? null,
      tasks: row.tasks ?? [],
      account_name: row.account_name ?? settings.facebook_user_name ?? null,
      is_active: row.is_active ?? true,
      is_default: row.page_id === settings.default_page_id,
      can_post:
        !row.tasks ||
        row.tasks.length === 0 ||
        row.tasks.includes("CREATE_CONTENT") ||
        row.tasks.includes("MANAGE"),
      fetched_at: row.fetched_at,
      connected_at: row.connected_at,
    }));
  } catch (err) {
    return fallbackListPages(settings);
  }
}

/** Fallback for legacy database before 20261021_multi_page_support.sql migration */
async function fallbackListPages(settings: Awaited<ReturnType<typeof getSettings>>): Promise<PageCache[]> {
  const db = supabaseAdmin();
  const { data } = await db.from("pages_cache").select("page_id, name, category, fetched_at").order("name");
  return (data ?? []).map((row: any) => ({
    page_id: row.page_id,
    name: row.name,
    category: row.category ?? null,
    picture_url: null,
    tasks: ["CREATE_CONTENT", "MANAGE"],
    account_name: settings.facebook_user_name ?? null,
    is_active: true,
    is_default: row.page_id === settings.default_page_id,
    can_post: true,
    fetched_at: row.fetched_at,
  }));
}

/**
 * Server-only: Retrieve a Page's stored access token and credentials.
 * Resolves token from pages_cache, falling back to app_settings.default_page_token.
 */
export async function getPageWithToken(pageId: string): Promise<StoredFacebookPage | null> {
  const db = supabaseAdmin();
  const settings = await getSettings();

  try {
    const { data, error } = await db
      .from("pages_cache")
      .select("page_id, name, category, access_token, picture_url, tasks, account_name, is_active, connected_at, fetched_at")
      .eq("page_id", pageId)
      .maybeSingle();

    if (!error && data) {
      // If access_token is empty or column missing, fall back to default_page_token if page matches default
      const token =
        data.access_token ||
        (data.page_id === settings.default_page_id ? settings.default_page_token : null);

      return {
        page_id: data.page_id,
        name: data.name,
        category: data.category ?? null,
        picture_url: data.picture_url ?? null,
        tasks: data.tasks ?? [],
        account_name: data.account_name ?? settings.facebook_user_name ?? null,
        is_active: data.is_active ?? true,
        is_default: data.page_id === settings.default_page_id,
        can_post:
          !data.tasks ||
          data.tasks.length === 0 ||
          data.tasks.includes("CREATE_CONTENT") ||
          data.tasks.includes("MANAGE"),
        access_token: token || "",
        fetched_at: data.fetched_at,
        connected_at: data.connected_at,
      };
    }
  } catch {}

  // Fallback if legacy pages_cache without access_token
  const { data: legacy } = await db
    .from("pages_cache")
    .select("page_id, name, category, fetched_at")
    .eq("page_id", pageId)
    .maybeSingle();

  if (legacy) {
    const token = pageId === settings.default_page_id ? settings.default_page_token : null;
    return {
      page_id: legacy.page_id,
      name: legacy.name,
      category: legacy.category ?? null,
      picture_url: null,
      tasks: ["CREATE_CONTENT", "MANAGE"],
      account_name: settings.facebook_user_name ?? null,
      is_active: true,
      is_default: legacy.page_id === settings.default_page_id,
      can_post: true,
      access_token: token || "",
      fetched_at: legacy.fetched_at,
    };
  }

  // If page is not in cache but is the default page in settings
  if (pageId === settings.default_page_id && settings.default_page_token) {
    return {
      page_id: settings.default_page_id,
      name: settings.default_page_name ?? "Facebook Page",
      category: null,
      is_active: true,
      is_default: true,
      can_post: true,
      access_token: settings.default_page_token,
      fetched_at: new Date().toISOString(),
    };
  }

  return null;
}

export interface PageResolutionResult {
  ok: boolean;
  page?: StoredFacebookPage;
  error?: "PAGE_NOT_FOUND" | "AMBIGUOUS_PAGE_NAME" | "PAGE_INACTIVE" | "NO_PAGE_SELECTED";
  message?: string;
  availablePages?: Array<{ pageId: string; name: string }>;
}

/**
 * Normalizes a page name for resilient matching across spelling variants,
 * punctuation differences, extra whitespace, and common nicknames.
 */
export function normalizePageName(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, " ") // replace punctuation with spaces
    .replace(/\s+/g, " ") // collapse multiple spaces
    .trim()
    .replace(/\bdoggie\b/g, "doggy") // equate doggie and doggy
    .replace(/\bdoggies\b/g, "doggies");
}

/**
 * Universal destination Facebook Page resolver.
 * Accurately resolves a target Page by explicit pageId, exact/normalized pageName,
 * or unambiguous topic context.
 * Never silently falls back to the default Page when an explicit target is missing or ambiguous.
 */
export async function resolveTargetFacebookPage(options: {
  pageId?: string | null;
  pageName?: string | null;
  topic?: string | null;
  allowDefault?: boolean;
}): Promise<PageResolutionResult> {
  const db = supabaseAdmin();
  const settings = await getSettings();

  const rawId = options.pageId?.trim() || null;
  const rawName = options.pageName?.trim() || null;
  const rawTopic = options.topic?.trim() || null;
  const allowDefault = options.allowDefault ?? false;

  // Fetch all active pages from cache
  const { data: allActiveRows } = await db
    .from("pages_cache")
    .select("page_id, name, is_active")
    .eq("is_active", true);

  const activePages = allActiveRows ?? [];
  const availablePages = activePages.map((p) => ({ pageId: p.page_id, name: p.name.trim() }));

  // Helper to log resolution step securely (never logs credentials)
  const logResolution = (result: PageResolutionResult, method: string) => {
    try {
      console.log(
        "[PAGE_RESOLUTION]",
        JSON.stringify({
          method,
          requestedId: rawId,
          requestedName: rawName,
          hasTopic: Boolean(rawTopic),
          resolvedPageId: result.page?.page_id ?? null,
          resolvedPageName: result.page?.name ?? null,
          success: result.ok,
          errorCode: result.error ?? null,
        })
      );
    } catch {}
  };

  // 1. If an explicit pageId was supplied:
  if (rawId) {
    // Check if rawId matches page_id directly
    const directMatch = await getPageWithToken(rawId);
    if (directMatch && directMatch.is_active !== false) {
      const res: PageResolutionResult = { ok: true, page: directMatch };
      logResolution(res, "direct_page_id");
      return res;
    }

    // Sometimes LLMs/users pass the Page Name into pageId (e.g. pageId: "Loving Doggy" or "Loving Doggie")
    const normRawId = normalizePageName(rawId);
    const matchingByName = activePages.filter((p) => {
      const exact = p.name.trim().toLowerCase() === rawId.toLowerCase();
      const norm = normalizePageName(p.name) === normRawId;
      return exact || norm;
    });

    if (matchingByName.length === 1) {
      const page = await getPageWithToken(matchingByName[0].page_id);
      if (page && page.is_active !== false) {
        const res: PageResolutionResult = { ok: true, page };
        logResolution(res, "page_id_as_name");
        return res;
      }
    } else if (matchingByName.length > 1) {
      const res: PageResolutionResult = {
        ok: false,
        error: "AMBIGUOUS_PAGE_NAME",
        message: `Ambiguous target Page: Multiple connected Pages match "${rawId}". Please specify the exact numerical pageId.`,
        availablePages,
      };
      logResolution(res, "ambiguous_page_id_name");
      return res;
    }

    // Check if the page exists in cache but is inactive
    const inactiveCheck = await getPageWithToken(rawId);
    if (inactiveCheck && inactiveCheck.is_active === false) {
      const res: PageResolutionResult = {
        ok: false,
        error: "PAGE_INACTIVE",
        message: `Destination Facebook Page "${inactiveCheck.name}" (${rawId}) is currently disconnected or inactive. Please reconnect it on the Pages screen.`,
        availablePages,
      };
      logResolution(res, "inactive_page_id");
      return res;
    }

    // A specific ID was requested but could not be found
    const res: PageResolutionResult = {
      ok: false,
      error: "PAGE_NOT_FOUND",
      message: `Destination Facebook Page with ID or name '${rawId}' is not connected, inactive, or unauthorized. Call getConnectedFacebookPages to see available Pages.`,
      availablePages,
    };
    logResolution(res, "unknown_page_id");
    return res;
  }

  // 2. If an explicit pageName was supplied (without pageId):
  if (rawName) {
    const normRawName = normalizePageName(rawName);

    // Pass 1: Exact trimmed case-insensitive or normalized match
    let matchingByName = activePages.filter((p) => {
      const exact = p.name.trim().toLowerCase() === rawName.toLowerCase();
      const norm = normalizePageName(p.name) === normRawName;
      return exact || norm;
    });

    // Pass 2: Substring or keyword match if not matched in Pass 1 and length >= 4
    if (matchingByName.length === 0 && normRawName.length >= 4) {
      matchingByName = activePages.filter((p) => {
        const pNorm = normalizePageName(p.name);
        return pNorm.includes(normRawName) || normRawName.includes(pNorm);
      });
    }

    if (matchingByName.length === 1) {
      const page = await getPageWithToken(matchingByName[0].page_id);
      if (page && page.is_active !== false) {
        const res: PageResolutionResult = { ok: true, page };
        logResolution(res, "page_name_match");
        return res;
      }
    } else if (matchingByName.length > 1) {
      const res: PageResolutionResult = {
        ok: false,
        error: "AMBIGUOUS_PAGE_NAME",
        message: `Ambiguous target Page name: Multiple connected Pages match "${rawName}". Please specify the exact numerical pageId.`,
        availablePages,
      };
      logResolution(res, "ambiguous_page_name");
      return res;
    }

    // Also check if rawName was actually a numerical page_id passed in pageName
    const directMatch = await getPageWithToken(rawName);
    if (directMatch && directMatch.is_active !== false) {
      const res: PageResolutionResult = { ok: true, page: directMatch };
      logResolution(res, "page_name_is_id");
      return res;
    }

    // Check if matching inactive page
    const { data: inactiveRows } = await db
      .from("pages_cache")
      .select("page_id, name")
      .eq("is_active", false);

    const inactiveMatch = (inactiveRows ?? []).find(
      (p) =>
        p.name.trim().toLowerCase() === rawName.toLowerCase() ||
        normalizePageName(p.name) === normRawName
    );

    if (inactiveMatch) {
      const res: PageResolutionResult = {
        ok: false,
        error: "PAGE_INACTIVE",
        message: `Destination Facebook Page "${inactiveMatch.name}" is currently disconnected or inactive. Please reconnect it on the Pages screen.`,
        availablePages,
      };
      logResolution(res, "inactive_page_name");
      return res;
    }

    // A specific name was requested but could not be found
    const res: PageResolutionResult = {
      ok: false,
      error: "PAGE_NOT_FOUND",
      message: `Destination Facebook Page with name '${rawName}' was requested, but no active connected Page was found. Call getConnectedFacebookPages to see available Pages.`,
      availablePages,
    };
    logResolution(res, "unknown_page_name");
    return res;
  }

  // 3. If topic context was provided and mentions a connected Page:
  if (rawTopic && rawTopic.length >= 4) {
    const normTopic = normalizePageName(rawTopic);
    const topicMatches = activePages.filter((p) => {
      const pNorm = normalizePageName(p.name);
      return pNorm.length >= 4 && normTopic.includes(pNorm);
    });

    if (topicMatches.length === 1) {
      const page = await getPageWithToken(topicMatches[0].page_id);
      if (page && page.is_active !== false) {
        const res: PageResolutionResult = { ok: true, page };
        logResolution(res, "topic_context_match");
        return res;
      }
    } else if (topicMatches.length > 1) {
      const res: PageResolutionResult = {
        ok: false,
        error: "AMBIGUOUS_PAGE_NAME",
        message: `Ambiguous target Page in topic context: Multiple connected Pages match "${rawTopic}". Please specify the intended pageId or pageName.`,
        availablePages,
      };
      logResolution(res, "ambiguous_topic_context");
      return res;
    }
  }

  // 4. Neither pageId, pageName, nor unambiguous topic context was provided:
  // Only fall back to default if allowDefault is explicitly true
  if (allowDefault) {
    if (settings.default_page_id) {
      const defaultPage = await getPageWithToken(settings.default_page_id);
      if (defaultPage && defaultPage.is_active !== false) {
        const res: PageResolutionResult = { ok: true, page: defaultPage };
        logResolution(res, "allow_default_fallback");
        return res;
      }
    }
  }

  const res: PageResolutionResult = {
    ok: false,
    error: "NO_PAGE_SELECTED",
    message:
      "No destination Facebook Page was specified and no unambiguous destination was found in context. " +
      "Please specify pageId or pageName (e.g. 'Invest in Stock Market', 'Live Jesus Christ', or 'Loving Doggie').",
    availablePages,
  };
  logResolution(res, "no_page_selected");
  return res;
}

/**
 * Persist discovered Pages using safe upsert.
 * Preserves existing Page records without deleting them!
 */
export async function upsertPages(pages: FacebookPage[], accountName?: string | null): Promise<void> {
  if (pages.length === 0) return;
  const db = supabaseAdmin();
  const now = new Date().toISOString();

  // Try extended upsert with multi-page columns
  try {
    const rows = pages.map((p) => ({
      page_id: p.id || (p as any).page_id,
      name: p.name,
      category: p.category ?? null,
      access_token: p.access_token,
      picture_url: p.picture_url ?? null,
      tasks: p.tasks ?? [],
      account_name: accountName ?? null,
      is_active: true,
      fetched_at: now,
    }));

    const { error } = await db.from("pages_cache").upsert(rows, { onConflict: "page_id" });
    if (!error) return;

    if (error.code !== "42703" && !error.message.includes("does not exist")) {
      throw error;
    }
  } catch (err: any) {
    // If column does not exist, fall back to legacy columns
  }

  // Fallback to legacy upsert
  const legacyRows = pages.map((p) => ({
    page_id: p.id || (p as any).page_id,
    name: p.name,
    category: p.category ?? null,
    fetched_at: now,
  }));
  await db.from("pages_cache").upsert(legacyRows, { onConflict: "page_id" });
}

/**
 * Disconnect an individual Page without disconnecting the entire Facebook account.
 */
export async function disconnectPage(pageId: string): Promise<{ ok: boolean; wasDefault: boolean }> {
  const db = supabaseAdmin();
  const settings = await getSettings();
  const wasDefault = settings.default_page_id === pageId;

  // Try setting is_active = false
  try {
    const { error } = await db
      .from("pages_cache")
      .update({ is_active: false })
      .eq("page_id", pageId);

    if (error && (error.code === "42703" || error.message.includes("does not exist"))) {
      // Legacy table: delete row from cache
      await db.from("pages_cache").delete().eq("page_id", pageId);
    }
  } catch {
    await db.from("pages_cache").delete().eq("page_id", pageId);
  }

  // If the disconnected page was the default Page, clear it or pick another active Page
  if (wasDefault) {
    const remaining = await listPages({ includeInactive: false });
    const nextDefault = remaining.find((p) => p.page_id !== pageId);
    if (nextDefault) {
      const nextToken = await getPageWithToken(nextDefault.page_id);
      await updateSettings({
        default_page_id: nextDefault.page_id,
        default_page_name: nextDefault.name,
        default_page_token: nextToken?.access_token || null,
      });
    } else {
      await updateSettings({
        default_page_id: null,
        default_page_name: null,
        default_page_token: null,
      });
    }
  }

  return { ok: true, wasDefault };
}

/**
 * Reactivate / reconnect an individual Page.
 */
export async function reconnectPage(pageId: string): Promise<boolean> {
  const db = supabaseAdmin();
  try {
    const { error } = await db
      .from("pages_cache")
      .update({ is_active: true })
      .eq("page_id", pageId);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Set the default Facebook Page in settings.
 */
export async function setDefaultPage(pageId: string): Promise<{ ok: boolean; pageName: string }> {
  const page = await getPageWithToken(pageId);
  if (!page) {
    throw new Error(`Page with ID ${pageId} not found in connected Pages.`);
  }

  await updateSettings({
    default_page_id: page.page_id,
    default_page_name: page.name,
    default_page_token: page.access_token || null,
  });

  return { ok: true, pageName: page.name };
}

/**
 * Disconnect all Pages (called when disconnecting the entire Facebook account).
 */
export async function disconnectAllPages(): Promise<void> {
  const db = supabaseAdmin();
  try {
    await db.from("pages_cache").delete().neq("page_id", "");
  } catch {}
}
