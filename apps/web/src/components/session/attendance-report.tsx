import { CheckCircle2, Clock, UserX, UserMinus } from "lucide-react";
import type { Attendance, AttendanceStatus } from "@/lib/api/types";

const STATUS: Record<AttendanceStatus, { label: string; Icon: typeof Clock; tone: string }> = {
  present: { label: "Hadir", Icon: CheckCircle2, tone: "text-success" },
  late: { label: "Terlambat", Icon: Clock, tone: "text-warning" },
  absent: { label: "Tidak hadir", Icon: UserX, tone: "text-danger" },
  kicked: { label: "Dikeluarkan", Icon: UserMinus, tone: "text-muted" },
};

export function AttendanceReport({ attendance }: { attendance: Attendance }) {
  const { summary, students } = attendance;
  const tiles: Array<[string, number]> = [
    ["Hadir", summary.present],
    ["Terlambat", summary.late],
    ["Tidak hadir", summary.absent],
    ["Dikeluarkan", summary.kicked],
  ];

  return (
    <section aria-label="Laporan kehadiran" className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-surface p-4">
            <dt className="text-small text-muted">{label}</dt>
            <dd className="font-heading text-display font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="overflow-x-auto rounded-lg bg-surface">
        <table className="w-full text-left text-body">
          <caption className="sr-only">Kehadiran {summary.total} siswa</caption>
          <thead>
            <tr className="border-b border-border text-small text-muted">
              <th scope="col" className="px-4 py-3 font-semibold">Nama</th>
              <th scope="col" className="px-4 py-3 font-semibold">Nama pengguna</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {students.map((student) => {
              const { label, Icon, tone } = STATUS[student.status];
              return (
                <tr key={student.student_id}>
                  <td className="px-4 py-3 font-semibold">{student.name ?? "Tanpa nama"}</td>
                  <td className="px-4 py-3 text-muted">{student.username ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 font-semibold ${tone}`}>
                      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                      {label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
