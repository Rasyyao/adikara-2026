"use client";

import { startTransition, useEffect, useState } from "react";

function format(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Counts up from `since` (an ISO time) once a second. The clock is read in the browser, so the server HTML never contains "now". */
export function LiveTimer({ since }: { since: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => startTransition(() => setNow(Date.now()));
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  return (
    <time aria-label="Durasi sesi" dateTime={since} className="font-mono text-h1 font-medium tabular-nums text-ink">
      {now === null ? "--:--:--" : format(Math.floor((now - Date.parse(since)) / 1000))}
    </time>
  );
}
