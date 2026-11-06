"use client";

import { BookOpen, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { generateProblemsAction } from "@/app/actions/problems";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import type { ProblemMaterial } from "@/lib/api/types";

const FOCUS_EXAMPLES = ["perulangan", "percabangan", "urutan langkah"];

function readiness(m: ProblemMaterial): { ok: boolean; text: string } {
  if (m.ready_files > 0) return { ok: true, text: `${m.ready_files} berkas siap${m.pending_files ? ` · ${m.pending_files} masih dibaca` : ""}` };
  if (m.pending_files > 0) return { ok: false, text: "Berkas masih dibaca AI" };
  return { ok: false, text: "Belum ada berkas materi" };
}

/** "Buat dengan AI": pick a material, optionally a focus, and how many problems; the drafts appear as the AI writes them. */
export function GenerateButton({
  materials,
  defaultMaterial,
  variant = "primary",
  label = "Buat dengan AI",
}: {
  materials: ProblemMaterial[];
  defaultMaterial?: string;
  variant?: "primary" | "secondary";
  label?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const id = useId();
  const firstReady = materials.find((m) => readiness(m).ok)?.id;
  const [open, setOpen] = useState(false);
  const [material, setMaterial] = useState<string | undefined>(undefined);
  const [focus, setFocus] = useState("");
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);

  const preset = defaultMaterial && materials.some((m) => m.id === defaultMaterial && readiness(m).ok) ? defaultMaterial : firstReady;
  const chosen = material ?? preset;

  const submit = async () => {
    if (!chosen) return;
    setBusy(true);
    const result = await generateProblemsAction(chosen, focus, count);
    setBusy(false);
    if (!result.ok) return toast.error(result.message);
    setOpen(false);
    setFocus("");
    toast.success({ title: "AI mulai menyusun", message: `${count} soal sedang dibuat. Biasanya selesai dalam 1 menit; Anda boleh meninggalkan halaman ini.` });
    router.push(`/teacher/problems?materi=${chosen}`);
    router.refresh();
  };

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Sparkles size={20} strokeWidth={1.75} aria-hidden="true" />
        {label}
      </Button>
      <Modal open={open} onClose={() => !busy && setOpen(false)} labelledBy={`${id}-title`} describedBy={`${id}-desc`} className="max-w-[560px]">
        <h2 id={`${id}-title`} className="text-h2 font-semibold text-ink">
          Buat soal dengan AI
        </h2>
        <p id={`${id}-desc`} className="mt-1 text-small text-muted">
          AI membaca seluruh materi, memilih satu konsep, lalu menyusun cerita masalah, kunci blok, dan tugas JavaScript dengan kasus ujinya. Hasilnya draf yang bisa Anda ubah.
        </p>

        {materials.length === 0 ? (
          <div className="mt-5 flex flex-col items-start gap-3 rounded-lg border border-dashed border-border p-4">
            <p className="text-small text-ink">Belum ada materi. Unggah modul atau slide di halaman Materi, lalu kembali ke sini.</p>
            <Link href="/teacher/materials/new" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-3 text-small font-semibold text-white hover:bg-primary-hover">
              <BookOpen size={16} strokeWidth={1.75} aria-hidden="true" />
              Unggah materi
            </Link>
          </div>
        ) : (
          <form
            className="mt-5 flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <fieldset>
              <legend className="mb-2 text-small font-semibold text-ink">Dari materi</legend>
              <div className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
                {materials.map((m) => {
                  const state = readiness(m);
                  const checked = chosen === m.id;
                  return (
                    <label
                      key={m.id}
                      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                        !state.ok ? "cursor-not-allowed border-border opacity-60" : checked ? "cursor-pointer border-primary bg-primary-tint" : "cursor-pointer border-border hover:bg-bg"
                      }`}
                    >
                      <input type="radio" name={`${id}-material`} value={m.id} checked={checked} disabled={!state.ok} onChange={() => setMaterial(m.id)} className="mt-1 size-4 accent-[var(--primary)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-small font-semibold text-ink">{m.title}</span>
                        <span className="flex items-center gap-1 text-caption text-muted">
                          {!state.ok && m.pending_files > 0 && <Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                          {state.text}
                          {m.problems > 0 && ` · ${m.problems} soal`}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <label htmlFor={`${id}-focus`} className="mb-1 block text-small font-semibold text-ink">
                Fokus topik <span className="font-normal text-muted">(opsional)</span>
              </label>
              <input
                id={`${id}-focus`}
                value={focus}
                maxLength={300}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="Kosongkan agar AI memilih dari seluruh materi"
                className="h-11 w-full rounded-md border border-border bg-bg px-3 text-body text-ink outline-none placeholder:text-muted focus:border-primary"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {FOCUS_EXAMPLES.map((example) => (
                  <button key={example} type="button" onClick={() => setFocus(example)} className="rounded-full border border-border px-2.5 py-0.5 text-caption text-muted hover:border-primary hover:text-ink">
                    {example}
                  </button>
                ))}
              </div>
            </div>

            <fieldset>
              <legend className="mb-2 text-small font-semibold text-ink">Jumlah soal</legend>
              <div className="inline-flex rounded-md border border-border p-0.5">
                {[1, 2, 3].map((n) => (
                  <label key={n} className={`flex min-h-9 min-w-12 cursor-pointer items-center justify-center rounded-sm px-3 text-small font-semibold ${count === n ? "bg-primary text-white" : "text-ink hover:bg-bg"}`}>
                    <input type="radio" name={`${id}-count`} value={n} checked={count === n} onChange={() => setCount(n)} className="sr-only" />
                    {n}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-caption text-muted">Setiap soal memakai konsep atau cerita yang berbeda.</p>
            </fieldset>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
                Batal
              </Button>
              <Button type="submit" loading={busy} disabled={!chosen}>
                <Sparkles size={18} strokeWidth={1.75} aria-hidden="true" />
                Buat {count} soal
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
