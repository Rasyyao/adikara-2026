"use client";

import { useEffect, useRef } from "react";
import type { LiveChannel, LiveEvent } from "./board/live-sync";

/** At most one refresh per this many ms while a burst of events comes in (a whole class answering at once). */
export const REFRESH_EVERY_MS = 300;

/**
 * Calls `load` when an event that `matters` arrives: right away for the first one, so a single answer is on the
 * teacher's screen within a round trip, then at most every REFRESH_EVERY_MS during a burst, with one last refresh after
 * it so the final state is never missed.
 */
export function useLiveRefresh(channel: LiveChannel | null, matters: (event: LiveEvent) => boolean, load: () => unknown) {
  const latest = useRef({ matters, load });
  useEffect(() => {
    latest.current = { matters, load };
  });

  useEffect(() => {
    if (!channel) return;
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      timer = null;
      last = Date.now();
      void latest.current.load();
    };
    const unsubscribe = channel.subscribe((event) => {
      if (!latest.current.matters(event) || timer) return; // a refresh is already due and will read this too
      const wait = last + REFRESH_EVERY_MS - Date.now();
      if (wait <= 0) run();
      else timer = setTimeout(run, wait);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [channel]);
}
