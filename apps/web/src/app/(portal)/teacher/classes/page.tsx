import { PageHeader, Panel } from "@/components/dashboard/page-header";
import { ClassesTable } from "@/components/dashboard/teacher-tables";
import { TEACHER_CLASSES } from "@/lib/dummy/teacher";

export const metadata = { title: "Kelas" };

export default function TeacherClassesPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Kelas" description="Kelas yang Anda ampu semester ini." />
      <Panel title={`${TEACHER_CLASSES.length} kelas`}>
        <ClassesTable rows={TEACHER_CLASSES} />
      </Panel>
    </div>
  );
}
