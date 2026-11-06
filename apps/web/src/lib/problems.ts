import "server-only";
import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api/errors";
import { problemsApi } from "@/lib/api/endpoints";
import { requireViewer } from "@/lib/auth/dal";
import { isUuid } from "@/lib/validation/auth";

/** A problem of the calling teacher, or the 404 page. */
export async function loadProblem(id: string) {
  if (!isUuid(id)) notFound();
  const { token } = await requireViewer("staff");
  try {
    return (await problemsApi.get(token, id)).problem;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
}
