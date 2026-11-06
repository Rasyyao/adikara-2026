"use client";

import { AlertTriangle, ArrowLeft, Pencil, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getProblemAction, regenerateProblemAction, saveProblemAction } from "@/app/actions/problems";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { Problem } from "@/lib/api/types";

/** Shown instead of the editor while the AI writes the draft, or after it could not. */
export function GenerationPanel({ problem }: { problem: Problem }) {
  const router = useRouter();
  const toast = useToast();
  const pending = problem.generation === "pending";
  const [focus, setFocus] = useState(problem.ai_focus ?? "");
  const [busy, setBusy] = useState<"retry" | "manual" | null>(null);
  const [seconds, setSeconds] = useState(0);

  // follow the draft until the worker is done with it, then show the editor
  useEffect(() => {
    if (!pending) return;
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    const poll = setInterval(async () => {
      const result = await getProblemAction(problem.id);
      if (result.ok && result.data.generation !== "pending") router.refresh();
    }, 3000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [pending, problem.id, router]);

  const retry = async () => {
    setBusy("retry");
    const result = await regenerateProblemAction(problem.id, focus);
    setBusy(null);
    if (!result.ok) return toast.error(result.message);
    router.refresh();
  };

  const manual = async () => {
    setBusy("manual");
    const result = await saveProblemAction(problem.id, { title: problem.title, story: problem.story, challenge: problem.challenge });
    setBusy(null);
    if (!result.ok) return toast.error(result.message);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      <Link href={problem.material ? `/teacher/problems?materi=${problem.material.id}` : "/teacher/problems"} className="inline-flex min-h-11 w-fit items-center gap-2 text-small font-semibold text-muted hover:text-ink">
        <ArrowLeft size={20} strokeWidth={1.75} aria-hidden="true" />
        Semua soal
      </Link>
      <section className="mx-auto flex w-full max-w-2xl flex-col gap-5 rounded-lg bg-surface p-6 sm:p-8" aria-live="polite" aria-busy={pending || undefined}>
        <span className={`flex size-12 items-center justify-center rounded-full ${pending ? "bg-primary-tint text-primary" : "bg-danger/10 text-danger"}`}>
          {pending ? <Sparkles size={24} strokeWidth={1.75} className="animate-pulse motion-reduce:animate-none" aria-hidden="true" /> : <AlertTriangle size={24} strokeWidth={1.75} aria-hidden="true" />}
        </span>
        <div>
          <h1 className="text-h1 font-semibold text-ink">{pending ? "AI sedang menyusun soal" : "Soal belum berhasil dibuat"}</h1>
          <p className="mt-1 text-body text-muted">
            {pending
              ? `Membaca materi “${problem.material?.title ?? ""}” lalu menulis cerita masalah, kunci blok, dan tugas JavaScript-nya${problem.ai_focus ? `, dengan fokus ${problem.ai_focus}` : ""}. Biasanya selesai dalam 1 menit; halaman ini terbuka sendiri saat selesai, dan Anda boleh meninggalkannya.`
              : problem.generation_error ?? "Terjadi kesalahan saat membuat soal."}
          </p>
        </div>

        {pending ? (
          <>
            <ol className="grid gap-2 sm:grid-cols-2">
              {["Cerita masalah", "Kunci blok", "Tugas JavaScript", "Kasus uji"].map((label, i) => (
                <li key={label} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-bg text-caption font-semibold text-muted">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-small font-semibold text-ink">{label}</span>
                    <span className="block h-2 w-24 animate-pulse rounded-full bg-bg motion-reduce:animate-none" aria-hidden="true" />
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-caption text-muted">Sudah {seconds} detik.</p>
          </>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void retry();
            }}
          >
            <div>
              <label htmlFor="retry-focus" className="mb-1 block text-small font-semibold text-ink">
                Fokus topik <span className="font-normal text-muted">(opsional; topik yang lebih spesifik sering membantu)</span>
              </label>
              <input
                id="retry-focus"
                value={focus}
                maxLength={300}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="Contoh: perulangan for"
                className="h-11 w-full rounded-md border border-border bg-bg px-3 text-body text-ink outline-none placeholder:text-muted focus:border-primary"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={busy === "retry"} disabled={busy !== null || !problem.material}>
                <RotateCcw size={18} strokeWidth={1.75} aria-hidden="true" />
                Coba lagi dengan AI
              </Button>
              <Button type="button" variant="secondary" loading={busy === "manual"} disabled={busy !== null} onClick={manual}>
                <Pencil size={18} strokeWidth={1.75} aria-hidden="true" />
                Isi sendiri
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
