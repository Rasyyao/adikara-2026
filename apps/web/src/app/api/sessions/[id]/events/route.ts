import type { NextRequest } from "next/server";
import { apiStream } from "@/lib/api/client";
import { getToken } from "@/lib/auth/cookie";
import { isUuid } from "@/lib/validation/auth";

// The API's event stream needs an Authorization header, which a browser EventSource cannot send, and the
// token lives in an httpOnly cookie that scripts cannot read. This route adds the header on the server
// and pipes the stream through, so the browser can use a plain same-origin EventSource.

function problem(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return problem(400, "validation_error", "Invalid session id");

  const token = await getToken();
  if (!token) return problem(401, "unauthorized", "Not logged in");

  let upstream: Response;
  try {
    upstream = await apiStream(`/sessions/${id}/events`, token, request.signal);
  } catch {
    return problem(502, "network_error", "Could not reach the API");
  }

  if (!upstream.ok || !upstream.body) {
    const body = await upstream.json().catch(() => null);
    return Response.json(body ?? { error: { code: "unknown_error", message: "Stream failed" } }, { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
