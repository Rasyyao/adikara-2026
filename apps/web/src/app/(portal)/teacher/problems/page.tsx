import { Suspense, cache } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { GenerateButton } from "@/components/problems/generate-dialog";
import { NewProblemButton, ProblemList } from "@/components/problems/problem-list";
import { CenteredLoader } from "@/components/ui/loaders";
import { problemsApi } from "@/lib/api/endpoints";
import type { ProblemMaterial, ProblemSummary } from "@/lib/api/types";
import { requireViewer } from "@/lib/auth/dal";
import { isUuid } from "@/lib/validation/auth";

export const metadata = { title: "Soal pemecahan masalah" };

/** `?materi=<id>` keeps one material's problems; `?materi=none` those without a material. */
function readFilter(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "none" || isUuid(value) ? value : undefined;
}

/** Every problem (the list filters and counts per material itself) and the materials; once per request. */
const load = cache(async (): Promise<{ items: ProblemSummary[]; materials: ProblemMaterial[] } | null> => {
  const { token } = await requireViewer("staff");
  try {
    const [problems, materials] = await Promise.all([problemsApi.list(token), problemsApi.materials(token)]);
    return { items: problems.items, materials: materials.items };
  } catch {
    return null;
  }
});

async function Header({ filter }: { filter?: string }) {
  const data = await load();
  const materials = data?.materials ?? [];
  return (
    <PageHeader
      title="Soal pemecahan masalah"
      description="Soal pemecahan masalah per materi. Siswa menjawab dengan menyusun blok atau menulis JavaScript; kirim ke kelas sebagai popup saat sesi berlangsung."
      action={
        <div className="flex flex-wrap gap-2">
          <NewProblemButton materials={materials} defaultMaterial={filter !== "none" ? filter : undefined} />
          <GenerateButton materials={materials} defaultMaterial={filter !== "none" ? filter : undefined} />
        </div>
      }
    />
  );
}

async function Problems({ filter }: { filter?: string }) {
  const data = await load();
  if (!data) return <p className="rounded-lg bg-surface p-8 text-center text-body text-ink">Daftar soal belum bisa dimuat. Muat ulang halaman sebentar lagi.</p>;
  return <ProblemList items={data.items} materials={data.materials} filter={filter} />;
}

export default async function TeacherProblemsPage({ searchParams }: PageProps<"/teacher/problems">) {
  const filter = readFilter((await searchParams).materi);
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<PageHeader title="Soal pemecahan masalah" action={<span />} />}>
        <Header filter={filter} />
      </Suspense>
      <Suspense key={filter ?? "all"} fallback={<CenteredLoader label="Memuat soal…" />}>
        <Problems filter={filter} />
      </Suspense>
    </div>
  );
}
