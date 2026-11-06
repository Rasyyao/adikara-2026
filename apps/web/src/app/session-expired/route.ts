import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_OPTIONS, STAFF_TOKEN_COOKIE, STUDENT_TOKEN_COOKIE, TOKEN_COOKIE } from "@/lib/auth/cookie";

/** The API rejected the token (expired, or the account was removed): drop the cookie and explain why. */
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login?reason=session-expired", request.url));
  response.cookies.set(TOKEN_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
  response.cookies.set(STAFF_TOKEN_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
  response.cookies.set(STUDENT_TOKEN_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
