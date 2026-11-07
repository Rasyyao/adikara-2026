"use client";

import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Search,
  Sparkles,
  UserRoundSearch,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { TeacherInsights } from "@/lib/api/types";
import { EmptyNote, InsightCard, RateBar, RateChip, pct } from "./insight-panels";

type Student = TeacherInsights["students"][number];
/** Below this share right, a student is flagged as needing help. */
const ATTENTION = 0.6;
const HIGH_PERFORMER = 0.85;

function MissedList({ student }: { student: Student }) {
  if (student.missed.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200/80 bg-emerald-50/60 p-3 text-caption text-emerald-800">
        <CheckCircle2 size={16} strokeWidth={2.2} className="text-emerald-600" aria-hidden="true" />
        <span>Siswa ini menjawab semua soal kuis dengan benar! Luar biasa.</span>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {student.missed.map((m, i) => (
        <li key={i} className="rounded-xl border border-border/80 bg-surface p-3.5 shadow-xs">
          <div className="flex items-start justify-between gap-2">
            <p className="text-small font-semibold text-ink">{m.question}</p>
            <span className="shrink-0 rounded-md bg-bg px-2 py-0.5 text-caption font-medium text-muted">
              {m.topic}
            </span>
          </div>

          <p className="mt-1 text-caption text-muted">Dari: {m.quiz_title}</p>

          <div className="mt-2.5 flex flex-wrap gap-2 text-caption">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 font-medium text-rose-800">
              <XCircle size={14} strokeWidth={2.2} className="text-rose-600" aria-hidden="true" />
              {m.picked ? `Dijawab: ${m.picked}. ${m.picked_text ?? ""}` : "Tidak dijawab"}
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800">
              <CheckCircle2 size={14} strokeWidth={2.2} className="text-emerald-600" aria-hidden="true" />
              Kunci: {m.answer}. {m.answer_text ?? ""}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Get initials for student avatar */
function getInitials(name: string) {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Every student of the recent sessions, weakest first: attendance, quiz score, the part of the material they miss most, and the questions they missed. */
export function StudentsPanel({ students }: { students: Student[] }) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"ALL" | "ATTENTION" | "HIGH">("ALL");
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const attentionCount = useMemo(
    () => students.filter((s) => s.correct_rate !== null && s.correct_rate < ATTENTION).length,
    [students],
  );

  const highCount = useMemo(
    () => students.filter((s) => s.correct_rate !== null && s.correct_rate >= HIGH_PERFORMER).length,
    [students],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return students.filter((s) => {
      // Tab filter
      if (tab === "ATTENTION" && (s.correct_rate === null || s.correct_rate >= ATTENTION)) {
        return false;
      }
      if (tab === "HIGH" && (s.correct_rate === null || s.correct_rate < HIGH_PERFORMER)) {
        return false;
      }
      // Search filter
      if (
        needle &&
        ![s.name, s.username ?? "", s.class_name, s.weakest_topic ?? ""].some((f) =>
          f.toLowerCase().includes(needle),
        )
      ) {
        return false;
      }
      return true;
    });
  }, [students, query, tab]);

  const displayed = showAll ? visible : visible.slice(0, 5);

  return (
    <InsightCard
      title="Perkembangan & Catatan Siswa"
      hint="Analisis pemahaman tiap siswa dari seluruh kuis dan kehadiran kelas."
      icon={<UserRoundSearch size={18} strokeWidth={2} className="text-primary" aria-hidden="true" />}
    >
      {students.length === 0 ? (
        <EmptyNote>Belum ada aktivitas siswa yang terekam di sesi kelas ini.</EmptyNote>
      ) : (
        <div className="flex flex-col">
          {/* Controls: Search + Filter Tabs */}
          <div className="flex flex-col gap-3 border-b border-border/50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            {/* Search Input */}
            <div className="relative flex-1 sm:max-w-sm">
              <Search
                size={16}
                strokeWidth={2}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="search"
                placeholder="Cari siswa, kelas, topik..."
                className="h-10 w-full rounded-xl border border-border/80 bg-bg pl-9 pr-9 text-small text-ink outline-none transition-colors focus:border-primary focus:bg-surface"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Bersihkan pencarian"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted hover:text-ink"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/70 bg-bg/80 p-1">
              <button
                type="button"
                onClick={() => setTab("ALL")}
                className={`rounded-lg px-3 py-1.5 text-caption font-semibold transition-all ${
                  tab === "ALL" ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
                }`}
              >
                Semua ({students.length})
              </button>

              <button
                type="button"
                onClick={() => setTab("ATTENTION")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-caption font-semibold transition-all ${
                  tab === "ATTENTION"
                    ? "bg-rose-50 text-rose-800 shadow-xs"
                    : "text-muted hover:text-rose-700"
                }`}
              >
                <AlertTriangle size={13} strokeWidth={2.2} />
                <span>Perlu Bimbingan ({attentionCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setTab("HIGH")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-caption font-semibold transition-all ${
                  tab === "HIGH"
                    ? "bg-emerald-50 text-emerald-800 shadow-xs"
                    : "text-muted hover:text-emerald-700"
                }`}
              >
                <Award size={13} strokeWidth={2.2} />
                <span>Akurasi Tinggi ({highCount})</span>
              </button>
            </div>
          </div>

          {/* Table of Students */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border/60 bg-bg/50 text-caption font-semibold uppercase tracking-wider text-muted">
                  <th scope="col" className="px-5 py-3 sm:px-6">Siswa</th>
                  <th scope="col" className="px-4 py-3">Kehadiran</th>
                  <th scope="col" className="px-4 py-3">Kuis Diikuti</th>
                  <th scope="col" className="w-44 px-4 py-3">Akurasi Jawaban</th>
                  <th scope="col" className="px-4 py-3">Materi Perlu Diperdalam</th>
                  <th scope="col" className="w-12 px-4 py-3">
                    <span className="sr-only">Aksi</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {displayed.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-small text-muted">
                      Tidak ada data siswa yang cocok dengan filter.
                    </td>
                  </tr>
                ) : (
                  displayed.map((s) => {
                    const expanded = open === s.student_id;
                    const attendance = s.class_sessions ? s.sessions_joined / s.class_sessions : null;
                    const isStruggling = s.correct_rate !== null && s.correct_rate < ATTENTION;
                    const isHigh = s.correct_rate !== null && s.correct_rate >= HIGH_PERFORMER;

                    return (
                      <Fragment key={s.student_id}>
                        <tr
                          onClick={() => setOpen(expanded ? null : s.student_id)}
                          className={`group cursor-pointer transition-colors hover:bg-bg/60 ${
                            expanded ? "bg-bg/80" : ""
                          }`}
                        >
                          {/* Student Name & Avatar */}
                          <td className="px-5 py-3 sm:px-6">
                            <div className="flex items-center gap-3">
                              <span
                                className={`flex size-7 shrink-0 items-center justify-center rounded-lg font-heading text-caption font-bold ${
                                  isStruggling
                                    ? "bg-rose-100 text-rose-800"
                                    : isHigh
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-primary-tint text-primary"
                                }`}
                              >
                                {getInitials(s.name)}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-small font-bold text-ink transition-colors group-hover:text-primary">
                                  {s.name}
                                </p>
                                <p className="truncate text-caption text-muted">
                                  {s.class_name}
                                  {s.username ? ` · @${s.username}` : ""}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Attendance */}
                          <td className="px-4 py-3 text-small">
                            <span className="font-semibold text-ink">
                              {s.sessions_joined}/{s.class_sessions || s.sessions_joined} sesi
                            </span>
                            <span className="block text-caption text-muted">
                              {pct(attendance === null ? null : Math.min(1, attendance))} hadir
                            </span>
                          </td>

                          {/* Quizzes Taken */}
                          <td className="px-4 py-3 text-small font-semibold text-ink">
                            {s.quizzes_taken} kuis
                          </td>

                          {/* Correct Rate */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <RateBar rate={s.correct_rate} className="h-1.5 flex-1" />
                              <span className="w-10 text-right font-heading text-caption font-bold tabular-nums text-ink">
                                {pct(s.correct_rate)}
                              </span>
                            </div>
                            <span className="text-caption text-muted">
                              {s.correct}/{s.answered} jawaban benar
                            </span>
                          </td>

                          {/* Weakest Topic */}
                          <td className="px-4 py-3">
                            {s.weakest_topic ? (
                              <span
                                className="inline-block max-w-[180px] truncate rounded-md bg-rose-50 px-2 py-0.5 text-caption font-medium text-rose-800"
                                title={s.weakest_topic}
                              >
                                {s.weakest_topic}
                              </span>
                            ) : s.correct_rate === null ? (
                              <span className="text-caption text-muted">Belum ada nilai kuis</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-caption font-medium text-emerald-800">
                                <CheckCircle2 size={12} strokeWidth={2.2} />
                                Menguasai Semua
                              </span>
                            )}
                          </td>

                          {/* Expand Trigger */}
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              aria-expanded={expanded}
                              aria-label={`Detail jawaban ${s.name}`}
                              className="flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink"
                            >
                              <ChevronDown
                                size={16}
                                strokeWidth={2}
                                className={`transition-transform duration-200 ${expanded ? "rotate-180 text-primary" : ""}`}
                                aria-hidden="true"
                              />
                            </button>
                          </td>
                        </tr>

                        {/* Expanded detail tray */}
                        {expanded && (
                          <tr className="bg-bg/80">
                            <td colSpan={6} className="px-5 pb-5 pt-2 sm:px-6">
                              <div className="rounded-xl border border-border/80 bg-surface/80 p-4">
                                <div className="mb-3 flex items-center justify-between">
                                  <p className="flex items-center gap-1.5 font-heading text-caption font-bold uppercase tracking-wider text-muted">
                                    <Sparkles size={14} className="text-primary" />
                                    Soal yang dijawab salah oleh {s.name}
                                  </p>
                                  <span className="text-caption text-muted">
                                    {s.missed.length} catatan salah
                                  </span>
                                </div>
                                <MissedList student={s} />
                              </div>
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

          {/* Footer toggle if there are more than 5 students */}
          {visible.length > 5 && (
            <div className="flex items-center justify-between border-t border-border/60 bg-bg/40 px-5 py-3 sm:px-6">
              <span className="text-caption text-muted">
                Menampilkan {displayed.length} dari total {visible.length} siswa
              </span>
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-caption font-semibold text-ink transition-colors hover:border-primary hover:text-primary"
              >
                {showAll ? "Tampilkan 5 Siswa Saja" : `Lihat Semua Siswa (${visible.length})`}
              </button>
            </div>
          )}
        </div>
      )}
    </InsightCard>
  );
}
