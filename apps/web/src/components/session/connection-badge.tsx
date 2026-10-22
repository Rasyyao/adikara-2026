import { Wifi, WifiOff } from "lucide-react";
import type { StreamStatus } from "./use-session-stream";

const LABELS: Record<StreamStatus, string> = {
  connecting: "Menyambungkan…",
  live: "Terhubung langsung",
  reconnecting: "Menyambungkan ulang…",
  closed: "Koneksi terputus",
};

/** Shows whether the live feed is working. Text and icon, never color alone. */
export function ConnectionBadge({ status }: { status: StreamStatus }) {
  const ok = status === "live";
  const Icon = ok ? Wifi : WifiOff;
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2 py-1 text-caption font-medium ${
        ok ? "text-success" : status === "closed" ? "text-danger" : "text-warning"
      }`}
    >
      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
