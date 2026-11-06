"use client";

import { AlertTriangle, BookOpen, CheckCircle2, CircleDashed, Copy, Eye, Loader2, Pencil, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { createProblemAction, deleteProblemAction, duplicateProblemAction, regenerateProblemAction } from "@/app/actions/problems";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import type { ProblemMaterial, ProblemSummary } from "@/lib/api/types";
import { EXAMPLE } from "./blocks";
import { GenerateButton } from "./generate-dialog";

const dateTime = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));

/** Re-reads the page while the AI is writing a draft, so it appears without a reload. */
export function useRefreshWhile(active: boolean, every = 4000) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), every);
    return () => clearInterval(timer);
  }, [active, every, router]);
}

/** "Buat manual": an empty four-pillar template or the worked example, filed under a material if one is picked. */
export function NewProblemButton({ materials, defaultMaterial }: { materials: ProblemMaterial[]; defaultMaterial?: string }) {
  const router = useRouter();
  const toast = useToast();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [material, setMaterial] = useState(defaultMaterial ?? "");
  const [busy, setBusy] = useState<"blank" | "example" | null>(null);

  const create = async (example: boolean) => {
    setBusy(example ? "example" : "blank");
    const materialId = material || null;
    const result = example ? await createProblemAction(EXAMPLE.title, EXAMPLE.story, EXAMPLE.challenge, materialId) : await createProblemAction(title, "", undefined, materialId);
    if (!result.ok) {
      setBusy(null);
      return toast.error(result.message);
    }
    router.push(`/teacher/problems/${result.data.id}`);
  };

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setMaterial(defaultMaterial ?? "");
          setOpen(true);
        }}
      >
        <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
        Buat manual
      </Button>
      <Modal open={open} onClose={() => !busy && setOpen(false)} labelledBy={`${id}-title`} describedBy={`${id}-desc`}>
        <h2 id={`${id}-title`} className="text-h2 font-semibold text-ink">
          Soal baru
        </h2>
        <p id={`${id}-desc`} className="mt-1 text-small text-muted">
          Satu soal berisi satu masalah. Siswa menjawabnya dengan menyusun blok atau menulis JavaScript.
        </p>
        <form
          className="mt-5 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) void create(false);
          }}
        >
          <TextField label="Judul soal" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Robot ke bendera" autoFocus />
          <div>
            <label htmlFor={`${id}-material`} className="mb-1 block text-small font-semibold text-ink">
              Materi <span className="font-normal text-muted">(opsional)</span>
            </label>
            <select
              id={`${id}-material`}
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              className="h-11 w-full rounded-md border border-border bg-bg px-3 text-body text-ink outline-none focus:border-primary"
            >
              <option value="">Tanpa materi</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" full loading={busy === "blank"} disabled={!title.trim() || busy !== null}>
            Buat draf kosong
          </Button>
        </form>
        <div className="my-4 flex items-center gap-3 text-caption text-muted">
          <span className="h-px flex-1 bg-border" />
          atau
          <span className="h-px flex-1 bg-border" />
        </div>
        <button
          type="button"
          onClick={() => create(true)}
          disabled={busy !== null}
          className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary hover:bg-primary-tint disabled:opacity-60"
        >
          <BookOpen size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="block text-small font-semibold text-ink">{busy === "example" ? "Membuat contoh…" : `Mulai dari contoh: “${EXAMPLE.title}”`}</span>
            <span className="block text-caption text-muted">Soal lengkap dengan blok dan JavaScript, siap diubah sesuai kelas Anda.</span>
          </span>
        </button>
      </Modal>
    </>
  );
}

/** Filter by material: all (grouped), one material, or problems without one. */
function MaterialTabs({ materials, filter, total, withoutMaterial }: { materials: ProblemMaterial[]; filter?: string; total: number; withoutMaterial: number }) {
  const tabs = [
    { key: undefined, label: "Semua", count: total },
    ...materials.map((m) => ({ key: m.id, label: m.title, count: m.problems })),
    ...(withoutMaterial > 0 || filter === "none" ? [{ key: "none", label: "Tanpa materi", count: withoutMaterial }] : []),
  ];
  return (
    <nav aria-label="Saring per materi" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
        {tabs.map((tab) => {
          const active = tab.key === filter;
          return (
            <li key={tab.key ?? "all"}>
              <Link
                href={tab.key ? `/teacher/problems?materi=${tab.key}` : "/teacher/problems"}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-10 max-w-64 items-center gap-2 rounded-full border px-3.5 text-small font-semibold transition-colors ${
                  active ? "border-primary bg-primary text-white" : "border-border bg-surface text-ink hover:border-primary"
                }`}
              >
                <span className="truncate">{tab.label}</span>
                <span className={`rounded-full px-1.5 text-caption ${active ? "bg-white/20" : "bg-bg text-muted"}`}>{tab.count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function StatusBadge({ item }: { item: ProblemSummary }) {
  if (item.generation === "pending")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-primary-tint px-2 py-0.5 text-caption font-semibold text-primary">
        <Loader2 size={14} strokeWidth={2} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Dibuat AI
      </span>
    );
  if (item.generation === "failed")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-danger/10 px-2 py-0.5 text-caption font-semibold text-danger">
        <AlertTriangle size={14} strokeWidth={2} aria-hidden="true" />
        Gagal
      </span>
    );
  return item.status === "ready" ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-success/10 px-2 py-0.5 text-caption font-semibold text-success">
      <CheckCircle2 size={14} strokeWidth={2} aria-hidden="true" />
      Siap
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-bg px-2 py-0.5 text-caption font-semibold text-muted">
      <CircleDashed size={14} strokeWidth={2} aria-hidden="true" />
      Draf
    </span>
  );
}

function ProblemCard({ item, showMaterial, busy, onDuplicate, onDelete, onRetry }: { item: ProblemSummary; showMaterial: boolean; busy: boolean; onDuplicate: () => void; onDelete: () => void; onRetry: () => void }) {
  const pending = item.generation === "pending";
  const failed = item.generation === "failed";
  return (
    <li className={`flex flex-col gap-3 rounded-lg bg-surface p-4 ${pending ? "ring-1 ring-primary/30" : ""}`} aria-busy={pending || undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {pending ? (
            <h3 className="line-clamp-2 text-h3 font-semibold text-muted">{item.title}</h3>
          ) : (
            <Link href={`/teacher/problems/${item.id}`} className="hover:underline">
              <h3 className="line-clamp-2 text-h3 font-semibold text-ink">{item.title}</h3>
            </Link>
          )}
          {(showMaterial && item.material) || item.origin === "ai" ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-muted">
              {item.origin === "ai" && (
                <span className="inline-flex items-center gap-1 text-primary">
                  <Sparkles size={12} strokeWidth={2} aria-hidden="true" />
                  AI
                </span>
              )}
              {showMaterial && item.material && <span className="truncate">{item.material.title}</span>}
            </p>
          ) : null}
        </div>
        <StatusBadge item={item} />
      </div>

      {pending ? (
        <div className="flex flex-col gap-2" aria-live="polite">
          <p className="text-small text-muted">AI sedang membaca materi dan menyusun cerita, blok, dan tugas JavaScript…{item.ai_focus ? ` Fokus: ${item.ai_focus}.` : ""}</p>
          <div className="grid grid-cols-2 gap-1.5" aria-hidden="true">
            {[0, 1].map((p) => (
              <span key={p} className="h-8 animate-pulse rounded-md bg-bg motion-reduce:animate-none" />
            ))}
          </div>
        </div>
      ) : failed ? (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-small text-ink">{item.generation_error ?? "Soal gagal dibuat."}</p>
      ) : (
        <>
          <p className="line-clamp-2 min-h-10 text-small text-muted">{item.story || "Cerita belum diisi."}</p>
          <ul aria-label="Cara menjawab" className="grid grid-cols-2 gap-1.5">
            <li className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 ${item.modes.blocks ? "bg-primary-tint" : "bg-bg"}`}>
              <span className="truncate text-caption font-semibold text-ink">🧩 Blok</span>
              <span className="shrink-0 text-caption text-muted">{item.modes.blocks ? `${item.answer_blocks} blok` : "tidak"}</span>
            </li>
            <li className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 ${item.modes.code ? "bg-primary-tint" : "bg-bg"}`}>
              <span className="truncate text-caption font-semibold text-ink">{"</>"} JavaScript</span>
              <span className="shrink-0 text-caption text-muted">{item.modes.code ? "ya" : "tidak"}</span>
            </li>
          </ul>
          <p className="text-caption text-muted">
            {item.issues ? `${item.issues} hal belum lengkap · ` : ""}Diubah {dateTime(item.updated_at)}
          </p>
        </>
      )}

      <div className="mt-auto flex items-center gap-1 border-t border-border pt-3">
        {pending ? (
          <span className="px-1 text-caption text-muted">Biasanya selesai dalam 1 menit.</span>
        ) : failed ? (
          <>
            <button type="button" onClick={onRetry} disabled={busy} className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-small font-semibold text-primary hover:bg-primary-tint disabled:opacity-60">
              <RotateCcw size={16} strokeWidth={1.75} aria-hidden="true" />
              Coba lagi
            </button>
            <Link href={`/teacher/problems/${item.id}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-small font-semibold text-ink hover:bg-bg">
              <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
              Buka
            </Link>
          </>
        ) : (
          <>
            <Link href={`/teacher/problems/${item.id}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-small font-semibold text-primary hover:bg-primary-tint">
              <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
              Ubah
            </Link>
            <Link href={`/teacher/problems/${item.id}/try`} className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-small font-semibold text-ink hover:bg-bg">
              <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
              Coba
            </Link>
            <button type="button" onClick={onDuplicate} disabled={busy} className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-small font-semibold text-ink hover:bg-bg disabled:opacity-60">
              <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
              Salin
            </button>
          </>
        )}
        <button type="button" onClick={onDelete} title="Hapus" aria-label={`Hapus ${item.title}`} className="ml-auto inline-flex size-10 shrink-0 items-center justify-center rounded-md text-danger hover:bg-danger/10">
          <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

/**
 * Problems by material. "Semua" groups them under their material; picking one shows that material with its own
 * "Buat dengan AI". Drafts the AI is writing show as such and the page refreshes until they are done.
 */
export function ProblemList({ items: all, materials, filter }: { items: ProblemSummary[]; materials: ProblemMaterial[]; filter?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [removing, setRemoving] = useState<ProblemSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useRefreshWhile(all.some((i) => i.generation === "pending"));
  const items = filter === undefined ? all : all.filter((i) => (filter === "none" ? !i.material : i.material?.id === filter));

  const run = async (id: string, action: () => Promise<{ ok: boolean; message?: string }>, done: string) => {
    setBusy(id);
    const result = await action();
    setBusy(null);
    if (!result.ok) return toast.error(result.message ?? "Gagal.");
    toast.success(done);
    router.refresh();
  };

  const remove = async () => {
    if (!removing) return;
    const target = removing;
    setRemoving(null);
    await run(target.id, () => deleteProblemAction(target.id), "Soal dihapus.");
  };

  const current = filter && filter !== "none" ? materials.find((m) => m.id === filter) : undefined;
  const withoutMaterial = all.filter((i) => !i.material).length;
  const total = all.length;

  const card = (item: ProblemSummary, showMaterial: boolean) => (
    <ProblemCard
      key={item.id}
      item={item}
      showMaterial={showMaterial}
      busy={busy === item.id}
      onDuplicate={() => run(item.id, () => duplicateProblemAction(item.id), "Salinan dibuat.")}
      onDelete={() => setRemoving(item)}
      onRetry={() => run(item.id, () => regenerateProblemAction(item.id), "AI mencoba menyusun ulang.")}
    />
  );

  // all problems, grouped by material in the order of the materials, then those without one
  const groups =
    filter === undefined
      ? [
          ...materials.map((m) => ({ material: m as ProblemMaterial | null, items: items.filter((i) => i.material?.id === m.id) })).filter((g) => g.items.length > 0),
          ...(withoutMaterial ? [{ material: null, items: items.filter((i) => !i.material) }] : []),
        ]
      : [];

  return (
    <div className="flex flex-col gap-6">
      {(materials.length > 0 || items.length > 0) && <MaterialTabs materials={materials} filter={filter} total={total} withoutMaterial={withoutMaterial} />}

      {current && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-surface p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-caption font-semibold uppercase tracking-wide text-primary">Materi</p>
            <h2 className="truncate text-h2 font-semibold text-ink">{current.title}</h2>
            <p className="text-small text-muted">
              {current.ready_files} berkas siap{current.pending_files ? ` · ${current.pending_files} masih dibaca` : ""} · {current.problems} soal
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/teacher/materials/${current.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-small font-semibold text-ink hover:bg-bg">
              <BookOpen size={18} strokeWidth={1.75} aria-hidden="true" />
              Buka materi
            </Link>
            <NewProblemButton materials={materials} defaultMaterial={current.id} />
            <GenerateButton materials={materials} defaultMaterial={current.id} label="Buat dari materi ini" />
          </div>
        </section>
      )}

      {items.length === 0 ? (
        <section className="flex flex-col items-center gap-4 rounded-lg bg-surface px-6 py-12 text-center">
          <h2 className="text-h2 font-semibold text-ink">{current ? "Belum ada soal dari materi ini" : "Belum ada soal"}</h2>
          <p className="max-w-xl text-body text-muted">
            Satu masalah, dua cara menjawab: menyusun blok seperti di Scratch, atau menulis JavaScript. Biarkan AI menyusun draf dari materi Anda, periksa, lalu kirim ke kelas sebagai popup saat sesi berlangsung.
          </p>
          <ul className="grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3">
            {[
              ["1. Susun soal", "Cerita masalah, lalu kunci blok dan/atau fungsi JavaScript dengan kasus ujinya."],
              ["2. Kirim ke kelas", "Dari sesi langsung, soal muncul sebagai popup di layar setiap siswa."],
              ["3. Pantau", "Lihat siapa yang sudah selesai, dengan blok atau JavaScript, dan berapa kali mencoba."],
            ].map(([title, text]) => (
              <li key={title} className="rounded-md border border-border p-3">
                <p className="text-small font-semibold text-ink">{title}</p>
                <p className="mt-0.5 text-caption text-muted">{text}</p>
              </li>
            ))}
          </ul>
          {!current && (
            <div className="flex flex-wrap justify-center gap-2">
              <NewProblemButton materials={materials} />
              <GenerateButton materials={materials} />
            </div>
          )}
        </section>
      ) : filter === undefined ? (
        groups.map((group) => (
          <section key={group.material?.id ?? "none"} aria-labelledby={`group-${group.material?.id ?? "none"}`} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={`group-${group.material?.id ?? "none"}`} className="flex min-w-0 items-center gap-2 text-h3 font-semibold text-ink">
                <BookOpen size={18} strokeWidth={1.75} className="shrink-0 text-muted" aria-hidden="true" />
                <span className="truncate">{group.material?.title ?? "Tanpa materi"}</span>
                <span className="text-small font-normal text-muted">· {group.items.length} soal</span>
              </h2>
              {group.material && (
                <Link href={`/teacher/problems?materi=${group.material.id}`} className="inline-flex min-h-10 items-center rounded-md px-2 text-small font-semibold text-primary hover:bg-primary-tint">
                  Lihat materi ini
                </Link>
              )}
            </div>
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{group.items.map((item) => card(item, false))}</ul>
          </section>
        ))
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => card(item, false))}</ul>
      )}

      <ConfirmDialog open={removing !== null} title="Hapus soal?" confirmLabel="Hapus soal" onConfirm={remove} onCancel={() => setRemoving(null)}>
        “{removing?.title}” akan dihapus permanen.
      </ConfirmDialog>
    </div>
  );
}
