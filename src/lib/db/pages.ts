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
 * Universal destination Facebook Page resolver.
 * Accurately resolves a target Page by explicit pageId or exact/normalized pageName.
 * Never silently falls back to the default Page when an explicit target is missing or ambiguous.
 */
export async function resolveTargetFacebookPage(options: {
  pageId?: string | null;
  pageName?: string | null;
  allowDefault?: boolean;
}): Promise<PageResolutionResult> {
  const db = supabaseAdmin();
  const settings = await getSettings();

  const rawId = options.pageId?.trim() || null;
  const rawName = options.pageName?.trim() || null;
  const allowDefault = options.allowDefault ?? false;

  // Fetch all active pages from cache
  const { data: allActiveRows } = await db
    .from("pages_cache")
    .select("page_id, name, is_active")
    .eq("is_active", true);

  const activePages = allActiveRows ?? [];
  const availablePages = activePages.map((p) => ({ pageId: p.page_id, name: p.name.trim() }));

  // 1. If an explicit pageId was supplied:
  if (rawId) {
    // Check if rawId matches page_id directly
    const directMatch = await getPageWithToken(rawId);
    if (directMatch && directMatch.is_active !== false) {
      return { ok: true, page: directMatch };
    }

    // Sometimes LLMs/users pass the Page Name into pageId (e.g. pageId: "Loving Doggy")
    const matchingByName = activePages.filter(
      (p) => p.name.trim().toLowerCase() === rawId.toLowerCase()
    );

    if (matchingByName.length === 1) {
      const page = await getPageWithToken(matchingByName[0].page_id);
      if (page && page.is_active !== false) {
        return { ok: true, page };
      }
    } else if (matchingByName.length > 1) {
      return {
        ok: false,
        error: "AMBIGUOUS_PAGE_NAME",
        message: `Ambiguous target Page name: Multiple connected Pages match "${rawId}". Please specify the exact numerical pageId.`,
        availablePages,
      };
    }

    // Check if the page exists in cache but is inactive
    const inactiveCheck = await getPageWithToken(rawId);
    if (inactiveCheck && inactiveCheck.is_active === false) {
      return {
        ok: false,
        error: "PAGE_INACTIVE",
        message: `Destination Facebook Page "${inactiveCheck.name}" (${rawId}) is currently disconnected or inactive. Please reconnect it on the Pages screen.`,
        availablePages,
      };
    }

    // A specific ID was requested but could not be found
    return {
      ok: false,
      error: "PAGE_NOT_FOUND",
      message: `Destination Facebook Page with ID or name '${rawId}' is not connected, inactive, or unauthorized. Call getConnectedFacebookPages to see available Pages.`,
      availablePages,
    };
  }

  // 2. If an explicit pageName was supplied (without pageId):
  if (rawName) {
    // Check if rawName matches an exact Page name (case-insensitive, trimmed)
    const matchingByName = activePages.filter(
      (p) => p.name.trim().toLowerCase() === rawName.toLowerCase()
    );

    if (matchingByName.length === 1) {
      const page = await getPageWithToken(matchingByName[0].page_id);
      if (page && page.is_active !== false) {
        return { ok: true, page };
      }
    } else if (matchingByName.length > 1) {
      return {
        ok: false,
        error: "AMBIGUOUS_PAGE_NAME",
        message: `Ambiguous target Page name: Multiple connected Pages match "${rawName}". Please specify the exact numerical pageId.`,
        availablePages,
      };
    }

    // Also check if rawName was actually a numerical page_id passed in pageName
    const directMatch = await getPageWithToken(rawName);
    if (directMatch && directMatch.is_active !== false) {
      return { ok: true, page: directMatch };
    }

    // A specific name was requested but could not be found
    return {
      ok: false,
      error: "PAGE_NOT_FOUND",
      message: `Destination Facebook Page with name '${rawName}' was requested, but no active connected Page was found. Call getConnectedFacebookPages to see available Pages.`,
      availablePages,
    };
  }

  // 3. Neither pageId nor pageName was requested:
  // Only fall back to default if allowDefault is explicitly true
  if (allowDefault) {
    if (settings.default_page_id) {
      const defaultPage = await getPageWithToken(settings.default_page_id);
      if (defaultPage && defaultPage.is_active !== false) {
        return { ok: true, page: defaultPage };
      }
    }
  }

  return {
    ok: false,
    error: "NO_PAGE_SELECTED",
    message: "No destination Facebook Page was specified and no active default Page is configured in Settings. Please specify pageId or pageName.",
    availablePages,
  };
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
