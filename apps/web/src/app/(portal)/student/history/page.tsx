import { PageHeader, Panel } from "@/components/dashboard/page-header";
import { StudentSessionList } from "@/components/dashboard/student-list";
import { STUDENT_SESSIONS } from "@/lib/dummy/student";

export const metadata = { title: "Riwayat kehadiran" };

export default function StudentHistoryPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Riwayat kehadiran" description="Sesi yang sudah Anda ikuti." />
      <Panel title={`${STUDENT_SESSIONS.length} sesi terakhir`}>
        <StudentSessionList rows={STUDENT_SESSIONS} />
      </Panel>
    </div>
  );
}
