import http from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Express } from "express";

export interface ReceivedEvent {
  type: string;
  data: any;
}

export interface OpenStream {
  status: number;
  headers: Headers;
  /** For non-200 answers: the JSON error body. */
  body: any;
  /** Resolves with the next event not read yet (rejects after `timeoutMs`). */
  next(timeoutMs?: number): Promise<ReceivedEvent>;
  /** Everything received so far, read or not. */
  received: ReceivedEvent[];
  /** Resolves when the server closed the stream. */
  closed: Promise<void>;
  close(): Promise<void>;
}

/** Opens a real HTTP connection to the app on a random port and reads it as a Server-Sent Events stream. */
export async function openStream(app: Express, path: string, headers: Record<string, string> = {}): Promise<OpenStream> {
  const server = http.createServer(app).listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  const controller = new AbortController();

  const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers, signal: controller.signal });

  const received: ReceivedEvent[] = [];
  let cursor = 0;
  const waiting: { wake: (() => void) | null } = { wake: null };
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => (resolveClosed = resolve));

  const isStream = (res.headers.get("content-type") ?? "").startsWith("text/event-stream");
  let body: any = null;

  if (!isStream) {
    body = await res.json().catch(() => null);
    resolveClosed();
  } else {
    void (async () => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let end: number;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const type = /^event: (.+)$/m.exec(block)?.[1];
            const data = /^data: (.+)$/m.exec(block)?.[1];
            if (type && data) {
              received.push({ type, data: JSON.parse(data) });
              waiting.wake?.();
            }
          }
        }
      } catch {
        // aborted by close()
      } finally {
        resolveClosed();
      }
    })();
  }

  return {
    status: res.status,
    headers: res.headers,
    body,
    received,
    closed,
    async next(timeoutMs = 2000) {
      const deadline = Date.now() + timeoutMs;
      while (cursor >= received.length) {
        const left = deadline - Date.now();
        if (left <= 0) throw new Error(`no event within ${timeoutMs}ms (received: ${received.map((e) => e.type).join(", ") || "none"})`);
        await new Promise<void>((resolve) => {
          waiting.wake = resolve;
          setTimeout(resolve, left);
        });
      }
      return received[cursor++];
    },
    async close() {
      controller.abort();
      server.closeAllConnections();
      server.close();
      await closed;
    },
  };
}
