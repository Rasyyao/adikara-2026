"use client";

import { Check, Copy, Lock, LockOpen, Play, UserMinus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import {
  endSessionAction,
  kickParticipantAction,
  setLockedAction,
  startSessionAction,
  type ActionResult,
} from "@/app/actions/sessions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import type { ParticipantView, SessionStatus, SessionView } from "@/lib/api/types";
import { ConnectionBadge } from "./connection-badge";
import { BackLink } from "./back-link";
import { StatusChip } from "./status-chip";
import { useSessionStream, type StreamHandler } from "./use-session-stream";

interface Props {
  sessionId: string;
  className: string;
  initial: { session: SessionView; participants: ParticipantView[] };
}

interface LiveState {
  status: SessionStatus;
  locked: boolean;
  joinCode: string | null;
  participants: ParticipantView[];
}

function upsert(list: ParticipantView[], next: ParticipantView): ParticipantView[] {
  const exists = list.some((p) => p.student_id === next.student_id);
  return exists ? list.map((p) => (p.student_id === next.student_id ? next : p)) : [...list, next];
}

export function TeacherLiveSession({ sessionId, className, initial }: Props) {
  const router = useRouter();
  const [live, setLive] = useState<LiveState>({
    status: initial.session.status,
    locked: initial.session.locked,
    joinCode: initial.session.join_code,
    participants: initial.participants,
  });
  const [announcement, setAnnouncement] = useState("");
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: "end" } | { kind: "kick"; student: ParticipantView }>(null);
  const [pending, startTransition] = useTransition();

  const onEvent = useCallback<StreamHandler>(
    (type, data) => {
      switch (type) {
        case "snapshot": {
          const snapshot = data as unknown as { session: SessionView; participants: ParticipantView[] };
          setLive({
            status: snapshot.session.status,
            locked: snapshot.session.locked,
            joinCode: snapshot.session.join_code,
            participants: snapshot.participants,
          });
          break;
        }
        case "participant_joined": {
          const participant = data as unknown as ParticipantView;
          setLive((current) => ({ ...current, participants: upsert(current.participants, participant) }));
          setAnnouncement(`${participant.name ?? participant.username ?? "Seorang siswa"} bergabung`);
          break;
        }
        case "participant_left": {
          const { student_id, reason } = data as { student_id: string; reason?: string };
          setLive((current) => ({
            ...current,
            participants: current.participants.map((p) =>
              p.student_id === student_id ? { ...p, state: reason === "kicked" ? "kicked" : "left" } : p,
            ),
          }));
          break;
        }
        case "session_started":
          setLive((current) => ({ ...current, status: "ACTIVE" }));
          break;
        case "session_locked":
          setLive((current) => ({ ...current, locked: true }));
          break;
        case "session_unlocked":
          setLive((current) => ({ ...current, locked: false }));
          break;
        case "session_ended":
          router.refresh(); // the page now shows the attendance report
          break;
      }
    },
    [router],
  );

  const streamStatus = useSessionStream(sessionId, onEvent);

  function run(action: () => Promise<ActionResult>, done?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.message);
      else done?.();
      setConfirm(null);
    });
  }

  async function copyPin() {
    if (!live.joinCode) return;
    try {
      await navigator.clipboard.writeText(live.joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("PIN tidak bisa disalin otomatis. Salin secara manual dari layar.");
    }
  }

  const joined = live.participants.filter((p) => p.state === "joined");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <BackLink />
          <h1 className="mt-2 text-h1 font-semibold">{className}</h1>
          <p className="mt-1 text-body text-muted">Sesi sedang dibuka. Tampilkan PIN dan pantau siswa yang masuk.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={live.status} />
          <ConnectionBadge status={streamStatus} />
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-label="PIN sesi" className="flex flex-col gap-4 rounded-lg bg-surface p-6">
          <div>
            <h2 className="text-h3 font-semibold">PIN untuk siswa</h2>
            <p className="mt-1 text-small text-muted">Tampilkan PIN ini di papan. Siswa memasukkannya setelah masuk sebagai Siswa.</p>
          </div>
          <p
            aria-label={`PIN ${live.joinCode?.split("").join(" ") ?? ""}`}
            className="rounded-md border bg-primary-tint py-4 text-center font-mono text-display font-medium tracking-[0.3em] text-primary"
          >
            {live.joinCode ?? "—"}
          </p>
          <Button variant="secondary" onClick={copyPin} disabled={!live.joinCode}>
            {copied ? <Check size={20} strokeWidth={1.75} aria-hidden="true" /> : <Copy size={20} strokeWidth={1.75} aria-hidden="true" />}
            {copied ? "PIN tersalin" : "Salin PIN"}
          </Button>

          <hr className="border-border" />

          <div className="flex flex-col gap-3">
            {live.status === "LOBBY" && (
              <Button onClick={() => run(() => startSessionAction(sessionId))} loading={pending}>
                <Play size={20} strokeWidth={1.75} aria-hidden="true" />
                Mulai sesi
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => run(() => setLockedAction(sessionId, !live.locked))}
              disabled={pending}
              aria-pressed={live.locked}
            >
              {live.locked ? <LockOpen size={20} strokeWidth={1.75} aria-hidden="true" /> : <Lock size={20} strokeWidth={1.75} aria-hidden="true" />}
              {live.locked ? "Buka kunci pintu" : "Kunci pintu"}
            </Button>
            <p className="text-caption text-muted">
              {live.locked ? "Pintu terkunci: siswa baru ditolak, yang sudah masuk tetap bisa kembali." : "Pintu terbuka: siswa dengan PIN bisa masuk."}
            </p>
            <Button variant={live.status === "LOBBY" ? "secondary" : "danger"} onClick={() => setConfirm({ kind: "end" })} disabled={pending}>
              Akhiri sesi
            </Button>
          </div>
        </section>

        <section aria-label="Siswa yang bergabung" className="rounded-lg bg-surface p-6">
          <div className="flex items-center gap-2">
            <Users size={20} strokeWidth={1.75} aria-hidden="true" />
            <h2 className="text-h3 font-semibold">Siswa bergabung ({joined.length})</h2>
          </div>

          {live.participants.length === 0 ? (
            <p className="mt-6 rounded-md border border-dashed border-border p-6 text-center text-body text-muted">
              Belum ada siswa. Nama mereka muncul di sini begitu memasukkan PIN.
            </p>
          ) : (
            <ul className="mt-4 flex max-h-[480px] flex-col divide-y divide-border overflow-y-auto">
              {live.participants.map((student) => (
                <li key={student.student_id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-body font-semibold">{student.name ?? student.username ?? "Tanpa nama"}</p>
                    <p className="text-small text-muted">
                      {student.state === "joined" ? "Di dalam sesi" : student.state === "left" ? "Terputus" : "Dikeluarkan"}
                      {student.username ? ` · ${student.username}` : ""}
                    </p>
                  </div>
                  {student.state !== "kicked" && live.status !== "ENDED" && (
                    <Button
                      variant="ghost"
                      onClick={() => setConfirm({ kind: "kick", student })}
                      disabled={pending}
                      aria-label={`Keluarkan ${student.name ?? student.username ?? "siswa"} dari sesi`}
                    >
                      <UserMinus size={20} strokeWidth={1.75} aria-hidden="true" />
                      Keluarkan
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>
        </section>
      </div>

      <ConfirmDialog
        open={confirm?.kind === "end"}
        title="Akhiri sesi sekarang?"
        confirmLabel="Ya, akhiri sesi"
        loading={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(() => endSessionAction(sessionId), () => router.refresh())}
      >
        PIN berhenti berlaku dan semua siswa keluar dari sesi. Laporan kehadiran langsung ditampilkan.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm?.kind === "kick"}
        title={confirm?.kind === "kick" ? `Keluarkan ${confirm.student.name ?? confirm.student.username ?? "siswa ini"}?` : ""}
        confirmLabel="Ya, keluarkan"
        loading={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind === "kick") run(() => kickParticipantAction(sessionId, confirm.student.student_id));
        }}
      >
        Siswa ini tidak bisa masuk lagi ke sesi ini. Tindakan ini tidak bisa dibatalkan.
      </ConfirmDialog>
    </div>
  );
}
