import { NextResponse, type NextRequest } from "next/server";

const isProd = process.env.NODE_ENV === "production";
const TOKEN_COOKIE = isProd ? "__Host-adikara_token" : "adikara_token";
const STAFF_TOKEN_COOKIE = isProd ? "__Host-adikara_staff_token" : "adikara_staff_token";
const STUDENT_TOKEN_COOKIE = isProd ? "__Host-adikara_student_token" : "adikara_student_token";

/**
 * Convenience redirects only: a visitor with a cookie skips the login page, a visitor without one
 * never sees a private page flash. Real authorisation happens in lib/auth/dal.ts on the server.
 */
export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const hasCookie = Boolean(
    request.cookies.get(TOKEN_COOKIE)?.value ||
      request.cookies.get(STAFF_TOKEN_COOKIE)?.value ||
      request.cookies.get(STUDENT_TOKEN_COOKIE)?.value,
  );

  // "/" has no page of its own for now: it leads to the login page, or home when already logged in.
  if (pathname === "/") return NextResponse.redirect(new URL(hasCookie ? "/home" : "/login", request.url));
  if (pathname === "/login") return hasCookie && !searchParams.has("reason") ? NextResponse.redirect(new URL("/home", request.url)) : NextResponse.next();
  if (!hasCookie) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/home", "/teacher/:path*", "/student/:path*"],
};
