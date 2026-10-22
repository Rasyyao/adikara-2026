import { PageHeader } from "@/components/dashboard/page-header";
import { SessionsTable } from "@/components/dashboard/teacher-tables";
import { TEACHER_SESSIONS } from "@/lib/dummy/teacher";

export const metadata = { title: "Riwayat sesi" };

export default function TeacherHistoryPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Riwayat sesi" description="Semua sesi yang pernah Anda buka." />
      <SessionsTable title={`${TEACHER_SESSIONS.length} sesi`} rows={TEACHER_SESSIONS} />
    </div>
  );
}
