"use client";

import { BookOpen, Check, Copy, ExternalLink, Lock, LockOpen, PenTool, Play, UserMinus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import {
  assignMaterialAction,
  endSessionAction,
  kickParticipantAction,
  setLockedAction,
  startSessionAction,
  type ActionResult,
} from "@/app/actions/sessions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import type { BoardScene, ChatView, ParticipantView, SessionMaterial, SessionStatus, SessionView } from "@/lib/api/types";
import { ConnectionBadge } from "./connection-badge";
import type { BoardMaterialInfo } from "./board/material-panel";
import { SessionWhiteboard } from "./session-whiteboard";
import { BackLink } from "./back-link";
import { StatusChip } from "./status-chip";
import { useSessionStream, type StreamHandler } from "./use-session-stream";

interface Props {
  sessionId: string;
  className: string;
  initial: { session: SessionView; material: SessionMaterial | null; participants: ParticipantView[] };
  /** The teacher's prepared materials, to pick one for this session. */
  materials: ChatView[];
  /** The saved whiteboard, if the teacher drew on it before. */
  board: BoardScene | null;
  /** The assigned material with its mindmaps and tests, for the whiteboard's material panel. */
  materialInfo: BoardMaterialInfo | null;
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

export function TeacherLiveSession({ sessionId, className, initial, materials, board, materialInfo }: Props) {
  const [view, setView] = useState<"control" | "board">("control");
  const router = useRouter();
  const [live, setLive] = useState<LiveState>({
    status: initial.session.status,
    locked: initial.session.locked,
    joinCode: initial.session.join_code,
    participants: initial.participants,
  });
  const [announcement, setAnnouncement] = useState("");
  const [material, setMaterial] = useState<SessionMaterial | null>(initial.material);
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

  function changeMaterial(chatId: string) {
    startTransition(async () => {
      const result = await assignMaterialAction(sessionId, chatId || null);
      if (!result.ok) return toast.error(result.message);
      setMaterial(result.material);
      router.refresh(); // the whiteboard's material panel reads the new material from the server
      toast.success(result.material ? `Materi "${result.material.title}" dipasang ke sesi.` : "Materi dilepas dari sesi.");
    });
  }

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

      <div role="tablist" aria-label="Tampilan sesi" className="flex gap-2">
        {(
          [
            { id: "control", label: "Kontrol sesi", Icon: Users },
            { id: "board", label: "Papan tulis", Icon: PenTool },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-body font-semibold transition-colors ${
              view === id ? "border-primary bg-surface text-primary" : "border-border bg-bg text-muted hover:border-primary/50 hover:text-ink"
            }`}
          >
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {/* The board stays mounted while hidden, so the drawing, zoom and undo history survive a switch of tab */}
      <div className={view === "board" ? "" : "hidden"}>
        <SessionWhiteboard sessionId={sessionId} initial={board} material={materialInfo} />
      </div>

      <div className={`grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] ${view === "control" ? "" : "hidden"}`}>
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

        <div className="flex flex-col gap-6">
        <section aria-label="Materi kelas" className="flex flex-col gap-3 rounded-lg bg-surface p-6">
          <div className="flex items-center gap-2">
            <BookOpen size={20} strokeWidth={1.75} aria-hidden="true" />
            <h2 className="text-h3 font-semibold">Materi kelas</h2>
          </div>
          <p className="text-small text-muted">Pasang materi yang sudah Anda siapkan (berkas, mindmap, dan soal), lalu buka saat kelas berjalan.</p>
          <select
            aria-label="Materi untuk sesi ini"
            value={material?.id ?? ""}
            onChange={(event) => changeMaterial(event.target.value)}
            disabled={pending}
            className="block min-h-12 w-full rounded-md border border-border bg-surface px-4 text-body text-ink"
          >
            <option value="">Belum ada materi</option>
            {material && !materials.some((m) => m.id === material.id) && <option value={material.id}>{material.title}</option>}
            {materials.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          {material ? (
            <Link
              href={`/teacher/materials/${material.id}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-body font-semibold text-white transition-colors hover:bg-primary-hover"
            >
              <ExternalLink size={18} strokeWidth={1.75} aria-hidden="true" />
              Buka materi: {material.title}
            </Link>
          ) : (
            <p className="rounded-md border border-dashed border-border p-4 text-center text-small text-muted">
              {materials.length === 0 ? "Anda belum punya materi. Buat dulu di menu Materi." : "Pilih materi di atas untuk dipakai di kelas ini."}
            </p>
          )}
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
