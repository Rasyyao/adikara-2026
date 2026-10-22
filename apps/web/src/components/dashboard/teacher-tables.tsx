import { StatusChip } from "@/components/session/status-chip";
import type { ClassSummary, SessionRow } from "@/lib/dummy/teacher";

const TH = "px-4 py-3 text-left text-small font-semibold text-muted sm:px-6";
const TD = "px-4 py-3 text-small text-ink sm:px-6";

export function SessionsTable({ rows }: { rows: SessionRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={TH}>Kelas</th>
            <th scope="col" className={TH}>Materi</th>
            <th scope="col" className={TH}>Waktu</th>
            <th scope="col" className={TH}>Hadir</th>
            <th scope="col" className={TH}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-b-0">
              <th scope="row" className={`${TD} text-left font-semibold`}>{row.className}</th>
              <td className={TD}>{row.topic}</td>
              <td className={`${TD} whitespace-nowrap text-muted`}>{row.date}</td>
              <td className={`${TD} whitespace-nowrap`}>{row.present}/{row.total}</td>
              <td className={TD}><StatusChip status={row.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ClassesTable({ rows }: { rows: ClassSummary[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={TH}>Kelas</th>
            <th scope="col" className={TH}>Mata pelajaran</th>
            <th scope="col" className={TH}>Siswa</th>
            <th scope="col" className={TH}>Kehadiran</th>
            <th scope="col" className={TH}>Sesi terakhir</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-b-0">
              <th scope="row" className={`${TD} text-left font-semibold`}>{row.name}</th>
              <td className={TD}>{row.subject}</td>
              <td className={TD}>{row.students}</td>
              <td className={TD}>
                <div className="flex items-center gap-3">
                  <div className="h-2 w-24 overflow-hidden rounded-sm bg-primary-tint" aria-hidden="true">
                    <div className="h-full bg-primary" style={{ width: `${row.attendanceRate}%` }} />
                  </div>
                  <span className="font-semibold">{row.attendanceRate}%</span>
                </div>
              </td>
              <td className={`${TD} whitespace-nowrap text-muted`}>{row.lastSession}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
