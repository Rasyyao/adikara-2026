import type { NextRequest } from "next/server";
import { apiRaw } from "@/lib/api/client";
import { getToken } from "@/lib/auth/cookie";
import { isUuid } from "@/lib/validation/auth";

function problem(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

/** Streams the original uploaded file; `?download=1` makes the browser save it instead of showing it. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; materialId: string }> }) {
  const { id, materialId } = await params;
  if (!isUuid(id) || !isUuid(materialId)) return problem(400, "validation_error", "Invalid id");

  const token = await getToken();
  if (!token) return problem(401, "unauthorized", "Not logged in");

  let upstream: Response;
  try {
    upstream = await apiRaw(`/chats/${id}/materials/${materialId}/file`, token, request.signal);
  } catch {
    return problem(502, "network_error", "Could not reach the API");
  }

  if (!upstream.ok || !upstream.body) {
    const body = await upstream.json().catch(() => null);
    return Response.json(body ?? { error: { code: "unknown_error", message: "Could not load the file" } }, { status: upstream.status });
  }

  const disposition = upstream.headers.get("Content-Disposition") ?? "inline";
  const download = request.nextUrl.searchParams.get("download") === "1";
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Disposition": download ? disposition.replace(/^inline/, "attachment") : disposition,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
