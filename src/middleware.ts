import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

const PUBLIC_ROUTES = new Set([
  "/",
  "/about",
  "/how-it-works",
  "/requirements",
  "/benefits",
  "/limitations",
  "/privacy",
  "/login",
]);

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const authed = await verifySessionToken(token);

  const { pathname } = req.nextUrl;
  const isLoginPage = pathname === "/login";
  const isPublic = PUBLIC_ROUTES.has(pathname);
  const isDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  // If visiting a protected dashboard or non-public route without auth, redirect to login
  if (!authed && (isDashboard || !isPublic)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // If already authenticated and visiting the login page, redirect directly to dashboard
  if (authed && isLoginPage) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except static assets, images, and the API's own auth routes
  // (login/logout must stay reachable to establish/clear the session, and
  // the cron + oauth-callback routes authenticate themselves).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|openapi.json|api/).*)"],
};
