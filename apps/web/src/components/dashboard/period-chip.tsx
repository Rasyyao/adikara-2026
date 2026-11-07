"use client";

import { CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";

const ID_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

export function PeriodChip() {
  const [formatted, setFormatted] = useState<string>("");

  useEffect(() => {
    setFormatted(ID_FORMATTER.format(new Date()));
  }, []);

  return (
    <div className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/80 bg-surface px-3.5 text-small font-medium text-ink shadow-xs">
      <CalendarDays size={16} strokeWidth={1.85} className="text-primary" aria-hidden="true" />
      <span>{formatted || "Hari ini"}</span>
    </div>
  );
}
