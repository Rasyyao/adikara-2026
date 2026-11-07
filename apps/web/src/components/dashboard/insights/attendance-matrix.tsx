import { Check, ClipboardCheck, Minus } from "lucide-react";
import Link from "next/link";
import type { ClassInsights } from "@/lib/api/types";
import { EmptyNote, InsightCard, RateChip, pct, shortDate } from "./insight-panels";

/** Who attended which session: one row per student on the roster, one column per started session (oldest left). */
export function AttendanceMatrix({ attendance }: { attendance: ClassInsights["attendance"] }) {
  const { sessions, students } = attendance;
  const perSession = sessions.map((_, i) => students.filter((s) => s.present[i]).length);

  return (
    <InsightCard
      title="Absensi per Sesi"
      hint="Siapa yang hadir di tiap sesi. Siswa dengan kehadiran terendah ditampilkan paling atas."
      icon={<ClipboardCheck size={18} strokeWidth={2} aria-hidden="true" />}
    >
      {sessions.length === 0 || students.length === 0 ? (
        <EmptyNote>{students.length === 0 ? "Kelas ini belum punya siswa." : "Belum ada sesi yang dimulai di kelas ini."}</EmptyNote>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-small">
            <caption className="sr-only">Kehadiran siswa per sesi</caption>
            <thead>
              <tr className="border-b border-border/60 bg-bg/60">
                <th scope="col" className="sticky left-0 z-10 min-w-44 bg-bg px-5 py-2.5 text-left text-caption font-semibold text-muted">
                  Siswa
                </th>
                {sessions.map((s, i) => (
                  <th key={s.id} scope="col" className="px-1.5 py-2 text-center align-bottom">
                    <Link
                      href={`/teacher/sessions/${s.id}`}
                      title={s.material_title ?? "Sesi tanpa materi"}
                      className="inline-flex flex-col items-center gap-0.5 rounded-md px-1.5 py-1 text-caption font-semibold text-ink hover:bg-primary-tint hover:text-primary"
                    >
                      <span className="whitespace-nowrap">{shortDate(s.date)}</span>
                      <span className="text-[11px] font-normal text-muted">
                        {perSession[i]}/{students.length}
                      </span>
                    </Link>
                  </th>
                ))}
                <th scope="col" className="px-5 py-2.5 text-right text-caption font-semibold text-muted">
                  Kehadiran
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {students.map((st) => (
                <tr key={st.student_id} className="hover:bg-bg/50">
                  <th scope="row" className="sticky left-0 z-10 bg-surface px-5 py-2 text-left font-medium text-ink">
                    <span className="block truncate">{st.name}</span>
                    {st.username && <span className="block text-[11px] font-normal text-muted">@{st.username}</span>}
                  </th>
                  {st.present.map((present, i) => (
                    <td key={sessions[i].id} className="px-1.5 py-2 text-center">
                      {present ? (
                        <span className="inline-flex size-6 items-center justify-center rounded-md bg-success/15 text-success" title="Hadir">
                          <Check size={14} strokeWidth={2.75} aria-label="Hadir" />
                        </span>
                      ) : (
                        <span className="inline-flex size-6 items-center justify-center rounded-md bg-danger/10 text-danger" title="Tidak hadir">
                          <Minus size={14} strokeWidth={2.75} aria-label="Tidak hadir" />
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="px-5 py-2 text-right">
                    <span className="inline-flex items-center gap-2">
                      <span className="text-caption text-muted">
                        {st.attended}/{sessions.length}
                      </span>
                      <RateChip rate={st.rate} label={pct(st.rate)} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </InsightCard>
  );
}
