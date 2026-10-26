import type { NextRequest } from "next/server";
import { apiRaw } from "@/lib/api/client";
import { getToken } from "@/lib/auth/cookie";
import { isUuid } from "@/lib/validation/auth";

function problem(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

/** The extracted text of a material of this chat. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; materialId: string }> }) {
  const { id, materialId } = await params;
  if (!isUuid(id) || !isUuid(materialId)) return problem(400, "validation_error", "Invalid id");

  const token = await getToken();
  if (!token) return problem(401, "unauthorized", "Not logged in");

  let upstream: Response;
  try {
    upstream = await apiRaw(`/chats/${id}/materials/${materialId}`, token, request.signal);
  } catch {
    return problem(502, "network_error", "Could not reach the API");
  }

  const body = await upstream.json().catch(() => null);
  return Response.json(body ?? { error: { code: "unknown_error", message: "Request failed" } }, {
    status: upstream.status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
