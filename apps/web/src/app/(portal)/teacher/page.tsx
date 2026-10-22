import { Suspense } from "react";
import { CreateSessionForm } from "@/components/session/create-session-form";
import { classesApi } from "@/lib/api/endpoints";
import { requireViewer } from "@/lib/auth/dal";

export const metadata = { title: "Beranda guru" };

async function TeacherHome() {
  const { token, user } = await requireViewer("staff");
  const { items } = await classesApi.list(token);

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6">
      <div>
        <h1 className="text-h1 font-semibold">Halo, {user.name ?? "Guru"}</h1>
        <p className="mt-1 text-body text-muted">Mulai sesi baru untuk salah satu kelas Anda.</p>
      </div>
      <section aria-label="Mulai sesi" className="rounded-lg border border-border bg-surface p-6">
        <h2 className="mb-4 text-h3 font-semibold">Mulai sesi baru</h2>
        <CreateSessionForm classes={items} />
      </section>
    </div>
  );
}

export default function GuruPage() {
  return (
    <Suspense fallback={<p className="text-body text-muted">Memuat kelas Anda…</p>}>
      <TeacherHome />
    </Suspense>
  );
}
