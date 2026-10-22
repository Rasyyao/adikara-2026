import { PageHeader } from "@/components/dashboard/page-header";
import { StudentSessionsTable } from "@/components/dashboard/student-table";
import { STUDENT_SESSIONS } from "@/lib/dummy/student";

export const metadata = { title: "Riwayat kehadiran" };

export default function StudentHistoryPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Riwayat kehadiran" description="Sesi yang sudah Anda ikuti." />
      <StudentSessionsTable title={`${STUDENT_SESSIONS.length} sesi terakhir`} rows={STUDENT_SESSIONS} />
    </div>
  );
}
