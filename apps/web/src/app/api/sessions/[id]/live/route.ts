import type { NextRequest } from "next/server";
import { apiForward } from "@/lib/api/client";
import { getToken } from "@/lib/auth/cookie";
import { isUuid } from "@/lib/validation/auth";

// The shared whiteboard sends its strokes and cursor moves here many times a second. Like the event stream, the token
// lives in an httpOnly cookie, so this route adds it on the server and passes the body through unchanged.

/** A message larger than this is not a stroke or a cursor; the API refuses it anyway. */
const MAX_BODY = 1_000_000;

function problem(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return problem(400, "validation_error", "Invalid session id");

  const token = await getToken();
  if (!token) return problem(401, "unauthorized", "Not logged in");

  const body = await request.text();
  if (body.length > MAX_BODY) return problem(413, "payload_too_large", "Too much at once");

  let upstream: Response;
  try {
    upstream = await apiForward(`/sessions/${id}/live`, token, body, request.signal);
  } catch {
    return problem(502, "network_error", "Could not reach the API");
  }
  return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": "application/json" } });
}
