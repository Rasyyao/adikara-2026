import "server-only";
import { cookies } from "next/headers";

const isProd = process.env.NODE_ENV === "production";

/** The `__Host-` prefix makes browsers refuse the cookie unless it is Secure, path "/" and has no Domain. */
export const TOKEN_COOKIE = isProd ? "__Host-adikara_token" : "adikara_token";

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

export async function setToken(token: string, maxAgeSeconds: number): Promise<void> {
  (await cookies()).set(TOKEN_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: maxAgeSeconds });
}

export async function getToken(): Promise<string | undefined> {
  return (await cookies()).get(TOKEN_COOKIE)?.value;
}

export async function clearToken(): Promise<void> {
  // Same attributes as setToken: browsers ignore a `__Host-` cookie change that is not Secure.
  (await cookies()).set(TOKEN_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
}
