"use client";

import { ArrowRight, BookOpen, CheckCircle2, KeyRound, PenTool, Radio, Users } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useId, useState } from "react";
import { createSessionAction, type FormState } from "@/app/actions/sessions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { ChatView, ClassView, LiveSession } from "@/lib/api/types";

const initial: FormState = {};

export function CreateSessionForm({
  classes,
  materials = [],
  liveSessions = [],
  onNavigate,
}: {
  classes: ClassView[];
  materials?: ChatView[];
  liveSessions?: LiveSession[];
  onNavigate?: () => void;
}) {
  const [state, formAction, pending] = useActionState(createSessionAction, initial);
  const [classCode, setClassCode] = useState(classes.length === 1 ? classes[0].class_code : "");
  const [chatId, setChatId] = useState("");
  const toast = useToast();
  const id = useId();
  const materialId = `${id}-material`;
  const errorId = `${id}-error`;
  const error = state.fieldErrors?.classCode;

  useEffect(() => {
    if (!state.message) return;
    toast.error({
      title: "Sesi belum dibuat",
      message: state.message,
      action: state.existingSessionId ? { label: "Lanjutkan sesi tersebut", href: `/teacher/sessions/${state.existingSessionId}` } : undefined,
    });
  }, [state, toast]);

  if (classes.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-body text-muted">
        Anda belum mengajar kelas apa pun. Minta admin sekolah menugaskan kelas ke akun Anda.
      </p>
    );
  }

  const selectedClass = classes.find((c) => c.class_code === classCode) ?? null;
  const selectedMaterial = materials.find((m) => m.id === chatId) ?? null;
  const activeForSelected = selectedClass ? liveSessions.find((l) => l.session.class_id === selectedClass.id) : liveSessions[0];
  const existingSessionId = state.existingSessionId ?? activeForSelected?.session.id;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {existingSessionId && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3.5">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-small font-semibold text-ink">
              <Radio size={15} strokeWidth={2} className="shrink-0 text-warning" aria-hidden="true" />
              {activeForSelected ? `Sesi ${activeForSelected.class_name} masih berjalan` : "Kelas ini masih punya sesi yang berjalan"}
            </p>
            <p className="mt-0.5 text-caption text-muted">
              {activeForSelected
                ? `${activeForSelected.joined_count} siswa di dalam · Buka kembali sesi ini untuk melanjutkan mengajar.`
                : "Buka kembali sesi tersebut untuk melanjutkan mengajar atau mengakhirinya."}
            </p>
          </div>
          <Link
            href={`/teacher/sessions/${existingSessionId}`}
            onClick={onNavigate}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-caption font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            Lanjutkan sesi
            <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
          </Link>
        </div>
      )}

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor={id} className="text-small font-semibold text-ink">
            Kelas
          </label>
          {selectedClass && (
            <span className="inline-flex items-center gap-1 text-caption font-medium text-muted">
              <Users size={13} strokeWidth={1.75} aria-hidden="true" />
              {selectedClass.student_count} siswa terdaftar · Kode {selectedClass.class_code}
            </span>
          )}
        </div>
        <select
          id={id}
          name="class_code"
          value={classCode}
          onChange={(event) => setClassCode(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          required
          className={`block min-h-11 w-full rounded-md border bg-surface px-3.5 text-body text-ink focus:border-primary focus:outline-none ${error ? "border-danger" : "border-border"}`}
        >
          <option value="" disabled>
            Pilih kelas…
          </option>
          {classes.map((item) => (
            <option key={item.id} value={item.class_code}>
              {item.name} · {item.student_count} siswa
            </option>
          ))}
        </select>
        {error && (
          <p id={errorId} className="mt-1 text-small text-danger">
            {error}
          </p>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor={materialId} className="text-small font-semibold text-ink">
            Materi untuk sesi ini <span className="font-normal text-muted">(opsional)</span>
          </label>
          <Link href="/teacher/materials" onClick={onNavigate} className="text-caption font-semibold text-primary hover:underline">
            Kelola materi →
          </Link>
        </div>
        <select
          id={materialId}
          name="chat_id"
          value={chatId}
          onChange={(event) => setChatId(event.target.value)}
          className="block min-h-11 w-full rounded-md border border-border bg-surface px-3.5 text-body text-ink focus:border-primary focus:outline-none"
        >
          <option value="">Tanpa materi (bisa dipasang nanti)</option>
          {materials.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>

        {materials.length > 0 && !chatId && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-caption text-muted">Pilih cepat:</span>
            {materials.slice(0, 3).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setChatId(item.id)}
                className="inline-flex max-w-[14rem] items-center gap-1 truncate rounded-full border border-border bg-bg px-2.5 py-0.5 text-caption font-semibold text-ink transition-colors hover:border-primary hover:bg-primary-tint hover:text-primary"
              >
                <BookOpen size={12} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{item.title}</span>
              </button>
            ))}
          </div>
        )}

        {selectedMaterial ? (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-primary/20 bg-primary-tint/60 p-2.5">
            <CheckCircle2 size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-caption leading-5 text-ink">
              Materi <b className="font-semibold">{selectedMaterial.title}</b> siap dibuka di papan tulis bersama mindmap, diagram, dan kuis QR.
            </p>
          </div>
        ) : (
          <p className="mt-1.5 text-caption text-muted">
            {materials.length === 0
              ? "Belum ada materi. Siapkan dulu di menu Materi, atau mulai sesi dengan papan tulis kosong."
              : "Pasang materi agar mindmap, diagram, dan kuis siap ditempel ke papan tulis saat kelas berjalan."}
          </p>
        )}
      </div>

      <ol aria-label="Alur sesi kelas" className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-bg p-2.5 text-caption">
        <li className="flex items-center gap-1.5 text-ink">
          <KeyRound size={14} strokeWidth={2} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate font-medium">1. Tampilkan PIN</span>
        </li>
        <li className="flex items-center gap-1.5 text-ink">
          <Users size={14} strokeWidth={2} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate font-medium">2. Siswa masuk</span>
        </li>
        <li className="flex items-center gap-1.5 text-ink">
          <PenTool size={14} strokeWidth={2} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate font-medium">3. Buka papan</span>
        </li>
      </ol>

      <Button type="submit" loading={pending} full>
        {pending ? "Membuat sesi…" : "Buat sesi dan dapatkan PIN"}
      </Button>
    </form>
  );
}
