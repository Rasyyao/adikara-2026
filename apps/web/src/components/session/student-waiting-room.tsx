"use client";

import { Hourglass, LogOut, PartyPopper, UserMinus } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { ConnectionBadge } from "./connection-badge";
import { StatusChip } from "./status-chip";
import { useSessionStream, type StreamHandler } from "./use-session-stream";
import type { SessionStatus } from "@/lib/api/types";

interface View {
  status: SessionStatus;
  locked: boolean;
  count: number;
  outcome: "in" | "kicked" | "ended";
}

export function StudentWaitingRoom({ sessionId }: { sessionId: string }) {
  const [view, setView] = useState<View>({ status: "LOBBY", locked: false, count: 0, outcome: "in" });

  const onEvent = useCallback<StreamHandler>((type, data) => {
    switch (type) {
      case "snapshot": {
        const snapshot = data as { session: { status: SessionStatus; locked: boolean }; participant_count: number };
        setView((v) => ({
          ...v,
          status: snapshot.session.status,
          locked: snapshot.session.locked,
          count: snapshot.participant_count,
          outcome: snapshot.session.status === "ENDED" ? "ended" : "in",
        }));
        break;
      }
      case "participant_joined":
        setView((v) => ({ ...v, count: Number(data.participant_count) || v.count }));
        break;
      case "session_started":
        setView((v) => ({ ...v, status: "ACTIVE" }));
        break;
      case "session_locked":
        setView((v) => ({ ...v, locked: true }));
        break;
      case "session_unlocked":
        setView((v) => ({ ...v, locked: false }));
        break;
      case "session_ended":
        setView((v) => ({ ...v, status: "ENDED", outcome: "ended" }));
        break;
      case "kicked":
        setView((v) => ({ ...v, outcome: "kicked" }));
        break;
    }
  }, []);

  const streamStatus = useSessionStream(sessionId, onEvent);

  if (view.outcome === "kicked" || view.outcome === "ended") {
    const kicked = view.outcome === "kicked";
    const Icon = kicked ? UserMinus : PartyPopper;
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <Icon size={48} strokeWidth={1.75} className={kicked ? "text-danger" : "text-primary"} aria-hidden="true" />
        <h1 className="text-h1 font-semibold">{kicked ? "Anda dikeluarkan dari sesi" : "Sesi sudah selesai"}</h1>
        <p className="text-body text-muted">
          {kicked ? "Guru mengeluarkan Anda dari sesi ini. Tanyakan pada guru jika ini keliru." : "Terima kasih sudah ikut. Kehadiran Anda sudah tercatat."}
        </p>
        <Link href="/student" className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-surface px-4 font-semibold hover:bg-primary-tint">
          Kembali
        </Link>
      </div>
    );
  }

  // The stream closed without an end/kick event: the server refused it or the connection is gone for good.
  if (streamStatus === "closed") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <LogOut size={48} strokeWidth={1.75} className="text-warning" aria-hidden="true" />
        <h1 className="text-h1 font-semibold">Koneksi ke sesi terputus</h1>
        <p className="text-body text-muted">Masukkan PIN lagi untuk kembali. Kehadiran Anda tidak hilang.</p>
        <Link href="/student" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 font-semibold text-white hover:bg-primary-hover">
          Masukkan PIN lagi
        </Link>
      </div>
    );
  }

  const started = view.status === "ACTIVE";
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <ConnectionBadge status={streamStatus} />
      <Hourglass size={48} strokeWidth={1.75} className="text-primary" aria-hidden="true" />
      <h1 className="text-h1 font-semibold">{started ? "Sesi sedang berlangsung" : "Anda sudah masuk"}</h1>
      <p className="text-body text-muted" aria-live="polite">
        {started ? "Ikuti arahan guru di kelas. Biarkan halaman ini tetap terbuka." : "Tunggu sebentar, guru akan segera memulai sesi."}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <StatusChip status={view.status} />
        <span className="rounded-sm border border-border bg-surface px-2 py-1 text-small font-semibold">{view.count} siswa di dalam</span>
      </div>
    </div>
  );
}
