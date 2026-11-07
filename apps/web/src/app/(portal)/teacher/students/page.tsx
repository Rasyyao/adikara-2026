import { Suspense } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { StudentsManager, type ClassOption, type StudentRowData } from "@/components/dashboard/students-manager";
import { CenteredLoader } from "@/components/ui/loaders";
import { classesApi } from "@/lib/api/endpoints";
import { requireViewer } from "@/lib/auth/dal";

export const metadata = { title: "Siswa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function StudentsContent({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).class;
  const classId = typeof raw === "string" ? raw : "";
  const { token } = await requireViewer("staff");
  const { items } = await classesApi.list(token).catch(() => ({ items: [] }));
  const details = await Promise.all(items.map((item) => classesApi.get(token, item.id).catch(() => null)));

  const classes: ClassOption[] = items.map((item) => ({ id: item.id, name: item.name, code: item.class_code }));
  const students: StudentRowData[] = details.flatMap((detail) =>
    (detail?.students ?? []).map((student) => ({
      id: student.id,
      name: student.name ?? student.username ?? "Siswa",
      username: student.username ?? "",
      classId: detail!.class.id,
    })),
  );

  return <StudentsManager classes={classes} students={students} initialClassId={classId} />;
}

export default function TeacherStudentsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Siswa" description="Tambah siswa dan tentukan kelasnya. Hanya siswa kelas itu yang bisa masuk sesinya." />
      <Suspense fallback={<CenteredLoader label="Memuat daftar siswa…" />}>
        <StudentsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
