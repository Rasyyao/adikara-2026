"use client";

import { ChevronDown, Search, UserRoundSearch, XCircle } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { TeacherInsights } from "@/lib/api/types";
import { EmptyNote, InsightCard, RateBar, RateChip, pct } from "./insight-panels";

type Student = TeacherInsights["students"][number];
/** Below this share right, a student is flagged as needing help. */
const ATTENTION = 0.6;

function MissedList({ student }: { student: Student }) {
  if (student.missed.length === 0) return <p className="text-small text-muted">Belum ada soal yang salah. 🎉</p>;
  return (
    <ul className="flex flex-col gap-2">
      {student.missed.map((m, i) => (
        <li key={i} className="rounded-md border border-border bg-surface p-3">
          <p className="text-small font-semibold text-ink">{m.question}</p>
          <p className="mt-0.5 text-caption text-muted">
            {m.topic} · {m.quiz_title}
          </p>
          <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-caption">
            <span className="inline-flex items-center gap-1 text-danger">
              <XCircle size={12} strokeWidth={2} aria-hidden="true" />
              {m.picked ? `Dijawab ${m.picked}. ${m.picked_text ?? ""}` : "Tidak dijawab"}
            </span>
            <span className="font-semibold text-success">
              Kunci {m.answer}. {m.answer_text ?? ""}
            </span>
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Every student of the recent sessions, weakest first: attendance, quiz score, the part of the material they miss most, and the questions they missed. */
export function StudentsPanel({ students }: { students: Student[] }) {
  const [query, setQuery] = useState("");
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const attentionCount = students.filter((s) => s.correct_rate !== null && s.correct_rate < ATTENTION).length;
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return students.filter(
      (s) =>
        (!onlyAttention || (s.correct_rate !== null && s.correct_rate < ATTENTION)) &&
        (!needle || [s.name, s.username ?? "", s.class_name, s.weakest_topic ?? ""].some((f) => f.toLowerCase().includes(needle))),
    );
  }, [students, query, onlyAttention]);

  return (
    <InsightCard
      title="Perkembangan siswa"
      hint="Diurutkan dari yang paling perlu bantuan. Klik baris untuk melihat soal yang salah."
      icon={<UserRoundSearch size={20} strokeWidth={1.75} className="text-primary" aria-hidden="true" />}
    >
      {students.length === 0 ? (
        <EmptyNote>Belum ada siswa yang mengikuti sesi.</EmptyNote>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
            <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-bg px-3 text-muted focus-within:border-primary sm:max-w-xs">
              <Search size={16} strokeWidth={1.75} aria-hidden="true" />
              <span className="sr-only">Cari siswa</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} type="search" placeholder="Cari siswa, kelas, materi…" className="min-w-0 flex-1 bg-transparent text-small text-ink outline-none placeholder:text-muted" />
            </label>
            <button
              type="button"
              aria-pressed={onlyAttention}
              onClick={() => setOnlyAttention((v) => !v)}
              className={`inline-flex h-10 items-center gap-1.5 rounded-md border px-3 text-small font-semibold transition-colors ${
                onlyAttention ? "border-danger bg-danger/10 text-danger" : "border-border text-ink hover:bg-bg"
              }`}
            >
              Perlu perhatian
              <span className={`rounded-sm px-1.5 text-caption ${onlyAttention ? "bg-danger text-white" : "bg-danger/10 text-danger"}`}>{attentionCount}</span>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="bg-bg text-caption font-semibold uppercase tracking-wide text-muted">
                  <th scope="col" className="px-4 py-2.5 sm:px-6">Siswa</th>
                  <th scope="col" className="px-3 py-2.5">Kehadiran</th>
                  <th scope="col" className="px-3 py-2.5">Kuis</th>
                  <th scope="col" className="w-48 px-3 py-2.5">Jawaban benar</th>
                  <th scope="col" className="px-3 py-2.5">Paling lemah di</th>
                  <th scope="col" className="w-12 px-3 py-2.5"><span className="sr-only">Detail</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-small text-muted">
                      Tidak ada siswa yang cocok.
                    </td>
                  </tr>
                ) : (
                  visible.map((s) => {
                    const expanded = open === s.student_id;
                    const attendance = s.class_sessions ? s.sessions_joined / s.class_sessions : null;
                    return (
                      <Fragment key={s.student_id}>
                        <tr
                          onClick={() => setOpen(expanded ? null : s.student_id)}
                          className={`cursor-pointer border-t border-border transition-colors hover:bg-bg ${expanded ? "bg-bg" : ""}`}
                        >
                          <td className="px-4 py-3 sm:px-6">
                            <p className="text-small font-semibold text-ink">{s.name}</p>
                            <p className="text-caption text-muted">
                              {s.class_name}
                              {s.username ? ` · ${s.username}` : ""}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-small text-ink">
                            {s.sessions_joined}/{s.class_sessions || s.sessions_joined} sesi
                            <span className="block text-caption text-muted">{pct(attendance === null ? null : Math.min(1, attendance))}</span>
                          </td>
                          <td className="px-3 py-3 text-small text-ink">{s.quizzes_taken}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <RateBar rate={s.correct_rate} className="h-1.5 flex-1" />
                              <span className="w-10 text-right text-small font-semibold tabular-nums text-ink">{pct(s.correct_rate)}</span>
                            </div>
                            <span className="text-caption text-muted">
                              {s.correct}/{s.answered} benar
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            {s.weakest_topic ? (
                              <span className="line-clamp-2 text-small text-ink" title={s.weakest_topic}>
                                {s.weakest_topic}
                              </span>
                            ) : s.correct_rate === null ? (
                              <span className="text-caption text-muted">Belum ikut kuis</span>
                            ) : (
                              <RateChip rate={1} label="Semua benar" />
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              aria-expanded={expanded}
                              aria-label={`${expanded ? "Tutup" : "Lihat"} soal yang salah dijawab ${s.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpen(expanded ? null : s.student_id);
                              }}
                              className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-ink"
                            >
                              <ChevronDown size={18} strokeWidth={1.75} className={`transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="bg-bg">
                            <td colSpan={6} className="px-4 pb-4 sm:px-6">
                              <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-muted">Soal terakhir yang salah</p>
                              <MissedList student={s} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </InsightCard>
  );
}
