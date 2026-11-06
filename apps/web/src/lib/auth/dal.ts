import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api/errors";
import { authApi } from "@/lib/api/endpoints";
import type { PublicUser } from "@/lib/api/types";
import { getToken } from "./cookie";

export interface Viewer {
  token: string;
  user: PublicUser;
}

/** Where each role lands after logging in. */
export function homeFor(role: PublicUser["role"]): "/teacher" | "/student" {
  return role === "USER" ? "/student" : "/teacher";
}

/**
 * The logged-in user, checked against the API on every request (so a removed account or changed role
 * takes effect at once). Call this in every page and action that needs a user; the proxy only checks
 * that a cookie exists, which is a convenience redirect and not a security boundary.
 */
export const getViewer = cache(async (area?: "staff" | "student"): Promise<Viewer | null> => {
  const primary = await getToken(area);
  const fallback = area ? await getToken() : undefined;
  const candidates = [...new Set([primary, fallback].filter((t): t is string => Boolean(t)))];
  let mismatch: Viewer | null = null;
  for (const token of candidates) {
    try {
      const { user } = await authApi.me(token);
      if (area) {
        const isStudent = user.role === "USER";
        if ((area === "student") !== isStudent) {
          mismatch ??= { token, user };
          continue;
        }
      }
      return { token, user };
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) continue;
      throw error;
    }
  }
  return mismatch;
});

export async function requireViewer(area: "staff" | "student"): Promise<Viewer> {
  let viewer: Viewer | null = null;
  try {
    viewer = await getViewer(area);
  } catch {
    redirect("/session-expired");
  }
  if (!viewer) redirect("/session-expired"); // clears the stale cookie, then goes to the login page
  const isStudent = viewer.user.role === "USER";
  if ((area === "student") !== isStudent) redirect(homeFor(viewer.user.role));
  return viewer;
}

/**
 * Resolves the caller's token for background Server Actions that return `ActionResult`,
 * throwing an `ApiError(401)` instead of redirecting to a Route Handler when the session expired.
 */
export async function requireActionToken(area: "staff" | "student"): Promise<string> {
  const viewer = await getViewer(area);
  if (!viewer) throw new ApiError(401, "unauthorized", "Not logged in");
  const isStudent = viewer.user.role === "USER";
  if ((area === "student") !== isStudent) throw new ApiError(403, "forbidden", "Wrong role");
  return viewer.token;
}
