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
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const token = await getToken();
  if (!token) return null;
  try {
    const { user } = await authApi.me(token);
    return { token, user };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
});

export async function requireViewer(area: "staff" | "student"): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/session-expired"); // clears the stale cookie, then goes to the login page
  const isStudent = viewer.user.role === "USER";
  if ((area === "student") !== isStudent) redirect(homeFor(viewer.user.role));
  return viewer;
}
