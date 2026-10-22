import { Suspense } from "react";
import { JoinForm } from "@/components/session/join-form";
import { requireViewer } from "@/lib/auth/dal";

export const metadata = { title: "Masuk sesi" };

async function StudentHome() {
  const { user } = await requireViewer("student");
  return (
    <section aria-labelledby="join-title" className="w-full max-w-[440px] rounded-lg border border-border bg-surface p-6 text-center sm:p-8">
      <p className="text-small text-muted">Halo, {user.name ?? "Siswa"}</p>
      <h1 id="join-title" className="mt-1 text-h1 font-semibold">
        Masukkan PIN sesi
      </h1>
      <p className="mt-1 text-body text-muted">PIN 6 angka ada di papan atau layar guru.</p>
      <div className="mt-6">
        <JoinForm />
      </div>
    </section>
  );
}

export default function StudentPage() {
  return (
    <div className="flex min-h-[calc(100dvh-160px)] items-center justify-center">
      <Suspense fallback={<p className="text-body text-muted">Memuat…</p>}>
        <StudentHome />
      </Suspense>
    </div>
  );
}
