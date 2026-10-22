import "server-only";
import { ApiError } from "./errors";

const BASE_URL = (process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const API_PREFIX = "/api/v1";
const TIMEOUT_MS = 10_000;

interface Options {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  /** The JWT. Only ever handled on the server. */
  token?: string;
}

/** Calls the Adikara API from the server. The browser never sees the token or talks to the API directly. */
export async function apiFetch<T>(path: string, { method = "GET", body, token }: Options = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${API_PREFIX}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ApiError(0, "network_error", "Could not reach the API");
  }

  if (response.ok) return (await response.json()) as T;

  const payload = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string; details?: Record<string, unknown> };
  } | null;
  throw new ApiError(
    response.status,
    payload?.error?.code ?? "unknown_error",
    payload?.error?.message ?? response.statusText,
    payload?.error?.details,
  );
}

/** For the SSE proxy: the raw upstream response, so the stream can be piped to the browser. */
export function apiStream(path: string, token: string, signal: AbortSignal): Promise<Response> {
  return fetch(`${BASE_URL}${API_PREFIX}${path}`, {
    headers: { Accept: "text/event-stream", Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal,
  });
}
