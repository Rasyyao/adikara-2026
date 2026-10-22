"use client";

import { Info } from "lucide-react";
import { useSearchParams } from "next/navigation";

const NOTICES: Record<string, string> = {
  "session-expired": "Sesi masuk Anda sudah berakhir. Silakan masuk lagi.",
};

/** Explains why the visitor is back at the login page (for example, an expired login). */
export function SessionNotice() {
  const reason = useSearchParams().get("reason");
  const text = reason ? NOTICES[reason] : undefined;
  if (!text) return null;
  return (
    <p role="status" className="flex items-start gap-2 rounded-md border border-border bg-primary-tint p-3 text-small text-ink">
      <Info size={20} strokeWidth={1.75} className="shrink-0 text-primary" aria-hidden="true" />
      {text}
    </p>
  );
}
