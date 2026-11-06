"use client";

import { ArrowLeft, BookOpen, Check, Copy, ExternalLink, KeyRound, Lock, LockOpen, PenTool, Play, UserMinus, Users } from "lucide-react";
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
import { createLiveChannel, liveEventOf } from "./board/live-sync";
import type { BoardMaterialInfo } from "./board/material-panel";
import { SessionProblems } from "./problems/session-problems";
import { SessionQuizList } from "./quiz/session-quiz-list";
import { SessionWhiteboard } from "./session-whiteboard";
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
  /** Board events of the stream, handed to the whiteboard drawn on together with the class. */
  const [liveBoard] = useState(createLiveChannel);

  const onEvent = useCallback<StreamHandler>(
    (type, data) => {
      const boardEvent = liveEventOf(type, data);
      if (boardEvent) liveBoard.emit(boardEvent);
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
    [liveBoard, router],
  );

  const streamStatus = useSessionStream(sessionId, onEvent, "teacher");

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
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <Link
            href="/teacher/classes"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-small font-semibold text-muted transition-colors duration-150 ease-out hover:bg-surface hover:text-ink"
          >
            <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>Kembali ke kelas</span>
          </Link>
          <span className="h-5 w-px bg-border" aria-hidden="true" />
          <h1 className="text-h2 font-semibold text-ink">{className}</h1>
          {view === "board" && live.joinCode && (
            <button
              type="button"
              onClick={copyPin}
              title="Klik untuk menyalin PIN sesi"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-primary/30 bg-primary-tint px-2.5 text-caption font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
            >
              <KeyRound size={13} strokeWidth={2} aria-hidden="true" />
              <span className="font-mono tracking-wider">PIN: {live.joinCode.split("").join(" ")}</span>
              {copied ? <Check size={13} strokeWidth={2} aria-hidden="true" /> : <Copy size={13} strokeWidth={2} aria-hidden="true" />}
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={live.status} />
          <ConnectionBadge status={streamStatus} />
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Tampilan sesi" className="flex gap-1.5 rounded-lg border border-border bg-surface p-1">
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
              className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3.5 text-small font-semibold transition-colors ${
                view === id ? "bg-primary text-white shadow-sm" : "text-muted hover:bg-bg hover:text-ink"
              }`}
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>{label}</span>
              {id === "control" && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[11px] font-semibold ${
                    view === id ? "bg-white/20 text-white" : "bg-bg text-muted"
                  }`}
                >
                  {joined.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {view === "board" && live.status === "LOBBY" && (
            <Button onClick={() => run(() => startSessionAction(sessionId))} loading={pending} className="min-h-10 px-3 text-small">
              <Play size={16} strokeWidth={2} aria-hidden="true" />
              Mulai sesi ({joined.length} siswa menunggu)
            </Button>
          )}
          {live.status !== "ENDED" && (
            <SessionProblems sessionId={sessionId} materialId={material?.id ?? null} channel={liveBoard} live={live.status === "ACTIVE"} />
          )}
        </div>
      </div>

      {/* The board stays mounted while hidden, so the drawing, zoom and undo history survive a switch of tab */}
      <div className={view === "board" ? "" : "hidden"}>
        <SessionWhiteboard
          sessionId={sessionId}
          initial={board}
          material={materialInfo}
          live={live.status === "ENDED" ? null : { channel: liveBoard, role: "teacher" }}
        />
      </div>

      <div className={`grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] ${view === "control" ? "" : "hidden"}`}>
        <section aria-label="PIN sesi" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-h3 font-semibold text-ink">PIN untuk siswa</h2>
              <p className="mt-0.5 text-small text-muted">
                {live.status === "LOBBY"
                  ? "Tampilkan PIN ini di proyektor. Setelah siswa masuk, klik Mulai sesi."
                  : "Sesi sedang aktif. Siswa yang terlambat masih bisa masuk selama pintu terbuka."}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 rounded-lg border border-primary/20 bg-primary-tint p-4">
            <p
              aria-label={`PIN ${live.joinCode?.split("").join(" ") ?? ""}`}
              className="text-center font-mono text-display font-bold tracking-[0.3em] text-primary"
            >
              {live.joinCode ?? "—"}
            </p>
            <Button variant="secondary" onClick={copyPin} disabled={!live.joinCode} full className="bg-surface">
              {copied ? <Check size={18} strokeWidth={1.75} aria-hidden="true" /> : <Copy size={18} strokeWidth={1.75} aria-hidden="true" />}
              {copied ? "PIN tersalin" : "Salin PIN"}
            </Button>
          </div>

          <div className="flex flex-col gap-2.5 pt-1">
            {live.status === "LOBBY" ? (
              <Button onClick={() => run(() => startSessionAction(sessionId))} loading={pending} full>
                <Play size={18} strokeWidth={2} aria-hidden="true" />
                Mulai sesi
              </Button>
            ) : (
              <Button onClick={() => setView("board")} full>
                <PenTool size={18} strokeWidth={1.75} aria-hidden="true" />
                Buka Papan tulis kelas
              </Button>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={() => run(() => setLockedAction(sessionId, !live.locked))}
                disabled={pending}
                aria-pressed={live.locked}
              >
                {live.locked ? <LockOpen size={18} strokeWidth={1.75} aria-hidden="true" /> : <Lock size={18} strokeWidth={1.75} aria-hidden="true" />}
                {live.locked ? "Buka kunci pintu" : "Kunci pintu"}
              </Button>
              <Button variant={live.status === "LOBBY" ? "secondary" : "danger"} onClick={() => setConfirm({ kind: "end" })} disabled={pending}>
                Akhiri sesi
              </Button>
            </div>
            <p className="text-caption text-muted">
              {live.locked ? "Pintu terkunci: siswa baru ditolak, yang sudah masuk tetap bisa kembali." : "Pintu terbuka: siswa dengan PIN bisa masuk."}
            </p>
          </div>
        </section>

        <div className="flex flex-col gap-5">
          <section aria-label="Siswa yang bergabung" className="rounded-lg border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users size={20} strokeWidth={1.75} className="text-primary" aria-hidden="true" />
                <h2 className="text-h3 font-semibold text-ink">Siswa bergabung ({joined.length})</h2>
              </div>
              {live.participants.length > 0 && (
                <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-caption font-semibold text-success">
                  {joined.length} aktif di kelas
                </span>
              )}
            </div>

            {live.participants.length === 0 ? (
              <p className="mt-3 rounded-md border border-dashed border-border bg-bg p-5 text-center text-small text-muted">
                Belum ada siswa. Nama mereka langsung muncul di sini begitu memasukkan PIN.
              </p>
            ) : (
              <ul className="mt-3 flex max-h-[280px] flex-col divide-y divide-border overflow-y-auto">
                {live.participants.map((student) => {
                  const displayName = student.name ?? student.username ?? "Tanpa nama";
                  const initialLetter = displayName.trim().charAt(0).toUpperCase() || "S";
                  return (
                    <li key={student.student_id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          aria-hidden="true"
                          className={`flex size-9 shrink-0 items-center justify-center rounded-full text-small font-bold ${
                            student.state === "joined"
                              ? "bg-primary-tint text-primary"
                              : "bg-bg text-muted"
                          }`}
                        >
                          {initialLetter}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-body font-semibold text-ink">{displayName}</p>
                          <p className="flex items-center gap-1.5 text-caption text-muted">
                            <span
                              aria-hidden="true"
                              className={`inline-block size-2 rounded-full ${
                                student.state === "joined" ? "bg-success" : student.state === "left" ? "bg-warning" : "bg-danger"
                              }`}
                            />
                            <span>
                              {student.state === "joined" ? "Di dalam sesi" : student.state === "left" ? "Terputus" : "Dikeluarkan"}
                              {student.username ? ` · ${student.username}` : ""}
                            </span>
                          </p>
                        </div>
                      </div>
                      {student.state !== "kicked" && live.status !== "ENDED" && (
                        <Button
                          variant="ghost"
                          onClick={() => setConfirm({ kind: "kick", student })}
                          disabled={pending}
                          aria-label={`Keluarkan ${student.name ?? student.username ?? "siswa"} dari sesi`}
                          className="min-h-9 px-3 text-small"
                        >
                          <UserMinus size={18} strokeWidth={1.75} aria-hidden="true" />
                          Keluarkan
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="sr-only" aria-live="polite">
              {announcement}
            </p>
          </section>

          <section aria-label="Materi kelas" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
            <div className="flex items-center gap-2">
              <BookOpen size={20} strokeWidth={1.75} className="text-primary" aria-hidden="true" />
              <h2 className="text-h3 font-semibold text-ink">Materi kelas</h2>
            </div>
            <p className="text-small text-muted">Pasang materi yang sudah Anda siapkan (berkas, mindmap, dan soal), lalu buka saat kelas berjalan.</p>
            <select
              aria-label="Materi untuk sesi ini"
              value={material?.id ?? ""}
              onChange={(event) => changeMaterial(event.target.value)}
              disabled={pending}
              className="block min-h-11 w-full rounded-md border border-border bg-surface px-3.5 text-body text-ink focus:border-primary focus:outline-none"
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
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setView("board")}
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 text-small font-semibold text-white transition-colors hover:bg-primary-hover"
                >
                  <PenTool size={16} strokeWidth={1.75} aria-hidden="true" />
                  Buka di Papan tulis
                </button>
                <Link
                  href={`/teacher/materials/${material.id}`}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3.5 text-small font-semibold text-ink transition-colors hover:border-primary hover:text-primary"
                >
                  <ExternalLink size={16} strokeWidth={1.75} aria-hidden="true" />
                  Buka materi: {material.title}
                </Link>
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-border p-3.5 text-center text-small text-muted">
                {materials.length === 0 ? "Anda belum punya materi. Buat dulu di menu Materi." : "Pilih materi di atas untuk dipakai di kelas ini."}
              </p>
            )}
          </section>

          <SessionQuizList sessionId={sessionId} channel={liveBoard} />
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
