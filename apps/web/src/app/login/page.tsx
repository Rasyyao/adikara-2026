import { Suspense } from "react";
import { IntroIllustration } from "@/components/auth/intro-illustration";
import { LoginForm } from "@/components/auth/login-form";
import { SessionNotice } from "@/components/auth/session-notice";
import { Logo } from "@/components/logo";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
      {/* One card, split 50:50. Below lg only the form half is shown, so it comes first on phones. */}
      <div className="grid w-full max-w-[1040px] overflow-hidden rounded-lg border border-border bg-surface lg:grid-cols-2">
        <section aria-label="Tentang Adikara" className="hidden flex-col justify-between gap-8 border-r border-border p-8 lg:flex">
          <div className="flex flex-col gap-3">
            <Logo />
            <h2 className="text-display font-semibold">Satu PIN, seluruh kelas langsung masuk.</h2>
            <p className="text-body text-muted">
              Guru membuka sesi dan menampilkan PIN. Siswa memasukkannya di ponsel, dan kehadiran tercatat otomatis.
            </p>
          </div>
          <IntroIllustration />
        </section>

        <section className="flex flex-col gap-6 p-6 sm:p-8">
          <div className="lg:hidden">
            <Logo />
          </div>
          <Suspense fallback={null}>
            <SessionNotice />
          </Suspense>
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
