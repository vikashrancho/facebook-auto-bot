/**
 * Centralized URL generation and normalization utilities.
 * Ensures review links consistently point to the authoritative production domain:
 * https://fbautopost.vetechno.in/dashboard/queue?post=POST_ID
 */

export const PRODUCTION_DOMAIN = "https://fbautopost.vetechno.in";

/**
 * Resolves the canonical base URL for the application.
 * Priority:
 * 1. APP_BASE_URL (explicit override)
 * 2. NEXT_PUBLIC_SITE_URL (configured production domain)
 * 3. SITE_URL
 * 4. Request host / forwarded headers (if valid and present)
 * 5. Vercel deployment variables (VERCEL_PROJECT_PRODUCTION_URL)
 * 6. Production fallback: https://fbautopost.vetechno.in
 * 7. Local fallback: http://localhost:3000
 */
export function getAppBaseUrl(req?: Request): string {
  const explicit =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL;

  if (explicit && explicit.trim()) {
    return normalizeUrl(explicit);
  }

  // If request is provided, inspect host headers
  if (req) {
    try {
      const forwardedHost = req.headers.get("x-forwarded-host");
      const forwardedProto = req.headers.get("x-forwarded-proto") || "https";
      if (forwardedHost) {
        // First host if multiple comma-separated proxies
        const primaryHost = forwardedHost.split(",")[0].trim();
        return normalizeUrl(`${forwardedProto}://${primaryHost}`);
      }
      const host = req.headers.get("host");
      if (host) {
        const proto =
          host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
        return normalizeUrl(`${proto}://${host}`);
      }
    } catch {}
  }

  // Vercel deployment environment variables
  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelHost && vercelHost.trim()) {
    const host = vercelHost.trim().replace(/^https?:\/\//, "");
    return normalizeUrl(`https://${host}`);
  }

  // In production environment, always default to the authoritative production domain
  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_DOMAIN;
  }

  return "http://localhost:3000";
}

/**
 * Normalizes a base URL by trimming whitespace and removing trailing slashes.
 */
export function normalizeUrl(url: string): string {
  let cleaned = url.trim();
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `https://${cleaned}`;
  }
  return cleaned.replace(/\/+$/, "");
}

/**
 * Builds an absolute, normalized dashboard review URL for a specific post ID.
 * Preserves the post query parameter and guarantees an absolute HTTPS/HTTP URL.
 * NEVER returns a relative URL.
 * Example: https://fbautopost.vetechno.in/dashboard/queue?post=c6ccb3c0-836f-48e3-b847-da07934ca423
 */
export function buildDashboardReviewUrl(postId: string, req?: Request): string {
  const cleanId = encodeURIComponent(postId.trim());
  const baseUrl = getAppBaseUrl(req);
  return `${baseUrl}/dashboard/queue?post=${cleanId}`;
}
