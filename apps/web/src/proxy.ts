import { NextResponse, type NextRequest } from "next/server";

const TOKEN_COOKIE = process.env.NODE_ENV === "production" ? "__Host-adikara_token" : "adikara_token";

/**
 * Convenience redirects only: a visitor with a cookie skips the login page, a visitor without one
 * never sees a private page flash. Real authorisation happens in lib/auth/dal.ts on the server.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = request.cookies.has(TOKEN_COOKIE);

  // "/" has no page of its own for now: it leads to the login page, or home when already logged in.
  if (pathname === "/") return NextResponse.redirect(new URL(hasCookie ? "/home" : "/login", request.url));
  if (pathname === "/login") return hasCookie ? NextResponse.redirect(new URL("/home", request.url)) : NextResponse.next();
  if (!hasCookie) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/home", "/teacher/:path*", "/student/:path*"],
};
