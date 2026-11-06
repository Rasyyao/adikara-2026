import "server-only";
import { cookies } from "next/headers";

const isProd = process.env.NODE_ENV === "production";

/** The `__Host-` prefix makes browsers refuse the cookie unless it is Secure, path "/" and has no Domain. */
export const TOKEN_COOKIE = isProd ? "__Host-adikara_token" : "adikara_token";
export const STAFF_TOKEN_COOKIE = isProd ? "__Host-adikara_staff_token" : "adikara_staff_token";
export const STUDENT_TOKEN_COOKIE = isProd ? "__Host-adikara_student_token" : "adikara_student_token";

/**
 * The JWT lives only in an httpOnly cookie: scripts on the page (including injected ones) cannot read it.
 * SameSite=Lax keeps it off cross-site POSTs, which together with Server Actions' origin check covers CSRF.
 */
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax",
  path: "/",
} as const;

function tokenKind(token: string | undefined): "teacher" | "student" | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { kind?: unknown; role?: unknown };
    if (payload.kind === "teacher" || payload.role === "TEACHER" || payload.role === "ADMIN") return "teacher";
    if (payload.kind === "student" || payload.role === "USER") return "student";
  } catch {
    // Non-JWT or malformed payloads are left to the API to verify.
  }
  return null;
}

export async function setToken(token: string, maxAgeSeconds: number, role?: "teacher" | "student"): Promise<void> {
  const store = await cookies();
  store.set(TOKEN_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: maxAgeSeconds });
  if (role === "teacher") store.set(STAFF_TOKEN_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: maxAgeSeconds });
  if (role === "student") store.set(STUDENT_TOKEN_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: maxAgeSeconds });
}

export async function getToken(area?: "staff" | "student"): Promise<string | undefined> {
  const store = await cookies();
  const staff = store.get(STAFF_TOKEN_COOKIE)?.value;
  const student = store.get(STUDENT_TOKEN_COOKIE)?.value;
  const shared = store.get(TOKEN_COOKIE)?.value;
  if (area === "staff") {
    return [staff, shared].find((t) => t && tokenKind(t) !== "student");
  }
  if (area === "student") {
    return [student, shared].find((t) => t && tokenKind(t) !== "teacher");
  }
  return shared || staff || student;
}

export async function clearToken(): Promise<void> {
  // Same attributes as setToken: browsers ignore a `__Host-` cookie change that is not Secure.
  const store = await cookies();
  store.set(TOKEN_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
  store.set(STAFF_TOKEN_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
  store.set(STUDENT_TOKEN_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
}
