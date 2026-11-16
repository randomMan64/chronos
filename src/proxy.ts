import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/token";

// Exact public paths that do not require authentication
const PUBLIC_PAGE_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/unauthorized",
]);

// Prefixes for public paths
const PUBLIC_PREFIXES = [
  "/invite",
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/auth/forgot-password",
  "/api/v1/auth/reset-password",
  "/api/v1/invitations",
  "/api/v1/health",
  "/api/v1/init",
];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_PAGE_PATHS.has(pathname)) {
    return true;
  }
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return true;
    }
  }
  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Retrieve session token from cookie
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = sessionCookie ? await verifySessionToken(sessionCookie) : null;
  const isAuthenticated = Boolean(session?.userId);

  const isPublic = isPublicRoute(pathname);

  // 1. Authenticated users attempting to visit auth entry pages (/login, /register)
  if (isAuthenticated && (pathname === "/login" || pathname === "/register")) {
    const returnUrl =
      request.nextUrl.searchParams.get("returnUrl") ||
      request.nextUrl.searchParams.get("redirect");
    const targetUrl =
      returnUrl && returnUrl.startsWith("/") && !returnUrl.startsWith("//")
        ? returnUrl
        : "/dashboard";
    return NextResponse.redirect(new URL(targetUrl, request.url));
  }

  // 2. Unauthenticated access to protected routes
  if (!isAuthenticated && !isPublic) {
    // If it's an API route, return 401 JSON directly
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required. Please sign in." },
        { status: 401 }
      );
    }

    // For UI pages, redirect to /login with preserved safe returnUrl
    const safeDestination = `${pathname}${search}`;
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("returnUrl", safeDestination);

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export default proxy;

export const config = {
  matcher: [
    /*
     * Match all request paths except for static files
     */
    "/((?!_next/static|_next/image|favicon.ico|logo.png|light-logo.png|favicon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
