import { CheckCircle2, Clock, PlayCircle } from "lucide-react";
import type { SessionStatus } from "@/lib/api/types";

const CHIPS: Record<SessionStatus, { label: string; Icon: typeof Clock; tone: string }> = {
  LOBBY: { label: "Menunggu siswa", Icon: Clock, tone: "text-warning" },
  ACTIVE: { label: "Sedang berlangsung", Icon: PlayCircle, tone: "text-success" },
  ENDED: { label: "Selesai", Icon: CheckCircle2, tone: "text-muted" },
};

export function StatusChip({ status }: { status: SessionStatus }) {
  const { label, Icon, tone } = CHIPS[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2 py-1 text-small font-semibold ${tone}`}>
      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      {label}
    </span>
  );
}
