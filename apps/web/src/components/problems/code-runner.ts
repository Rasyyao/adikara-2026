"use client";

import type { CodeTest } from "@/lib/api/types";

export interface TestOutcome {
  pass: boolean;
  /** The value returned, shown as JavaScript would print it; null when it threw. */
  actual: string | null;
  error: string | null;
}

export interface RunResult {
  /** The code did not run at all (syntax error, missing function, too slow). */
  error: string | null;
  logs: string[];
  results: TestOutcome[];
}

let frame: HTMLIFrameElement | null = null;
let ready: Promise<HTMLIFrameElement> | null = null;
const pending = new Map<string, (result: RunResult) => void>();

/**
 * The sandboxed runner (public/code-runner.html), loaded once per page in a hidden iframe. `sandbox="allow-scripts"`
 * without `allow-same-origin` gives it an opaque origin: the code cannot read cookies or touch this page.
 */
function runner(): Promise<HTMLIFrameElement> {
  if (ready && frame?.isConnected) return ready;
  ready = new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.src = "/code-runner.html";
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.title = "Penjalan kode";
    iframe.tabIndex = -1;
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none";
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return;
      const data = event.data as { ready?: boolean; id?: string; result?: RunResult };
      if (data?.ready) resolve(iframe);
      else if (data?.id && pending.has(data.id)) {
        pending.get(data.id)!(data.result ?? { error: "Tidak ada hasil.", logs: [], results: [] });
        pending.delete(data.id);
      }
    };
    window.addEventListener("message", onMessage);
    document.body.appendChild(iframe);
    frame = iframe;
  });
  return ready;
}

/** Runs `code` and calls the function `fn` with each test's arguments, comparing the return value with `expected`. */
export async function runCode(code: string, fn: string, tests: CodeTest[], timeout = 3000): Promise<RunResult> {
  const iframe = await runner();
  const id = Math.random().toString(36).slice(2);
  return new Promise((resolve) => {
    // the runner stops slow code itself; this only guards against the iframe going away
    const guard = setTimeout(() => {
      pending.delete(id);
      resolve({ error: "Penjalan kode tidak merespons. Muat ulang halaman, lalu coba lagi.", logs: [], results: [] });
    }, timeout + 3000);
    pending.set(id, (result) => {
      clearTimeout(guard);
      resolve(result);
    });
    iframe.contentWindow?.postMessage({ id, code, fn, tests, timeout }, "*");
  });
}

/** A value as it is written in JavaScript, for showing a test's arguments and expected result. */
export const showValue = (value: unknown) => (value === undefined ? "undefined" : JSON.stringify(value));

/** A call as a student would write it: `luas(2, 3)`. */
export const showCall = (fn: string, args: unknown[]) => `${fn}(${args.map(showValue).join(", ")})`;
