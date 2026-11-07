"use client";

import { Archive, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import Link from "next/link";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { archiveClassAction, createClassAction, deleteClassAction, renameClassAction } from "@/app/actions/classes";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";

export function DialogHeader({ id, title, description, onClose }: { id: string; title: string; description?: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 id={id} className="text-h2 font-semibold text-ink">
          {title}
        </h2>
        {description && <p className="text-small text-muted">{description}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup"
        className="-mr-2 -mt-1 flex size-10 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-bg hover:text-ink"
      >
        <X size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}

/** "Tambah kelas": a name, and optionally a class code (made up when left empty). */
export function NewClassButton() {
  const toast = useToast();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function close() {
    setOpen(false);
    setName("");
    setCode("");
    setErrors({});
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setErrors({ name: "Isi nama kelas." });
    setSaving(true);
    const result = await createClassAction(name, code);
    setSaving(false);
    if (!result.ok) return setErrors(result.fieldErrors ?? (toast.error(result.message), {}));
    toast.success(`Kelas "${name.trim()}" dibuat. Sekarang tambahkan siswanya.`);
    close();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
        Tambah kelas
      </Button>
      <Modal open={open} onClose={close} labelledBy={titleId}>
        <DialogHeader id={titleId} title="Tambah kelas" description="Kode kelas dipakai saat memulai sesi." onClose={close} />
        <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-4">
          <TextField label="Nama kelas" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Contoh: Kelas 7B" maxLength={100} autoFocus autoCapitalize="sentences" />
          <TextField
            label="Kode kelas (opsional)"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            error={errors.class_code}
            hint="Kosongkan agar dibuatkan otomatis. Kode tidak bisa diubah nanti."
            maxLength={32}
          />
          <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={close} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" loading={saving}>
              Simpan kelas
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function ActionRow({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border p-3">
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bg text-muted">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-small font-semibold text-ink">{title}</p>
        <p className="text-caption text-muted">{description}</p>
      </div>
      {children}
    </div>
  );
}

/** The pencil on a class row: rename, manage students, archive or delete. */
export function EditClassButton({ id, name, code, studentCount }: { id: string; name: string; code?: string; studentCount: number }) {
  const toast = useToast();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<"save" | "archive" | "delete" | null>(null);
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);

  function openDialog() {
    setValue(name);
    setError(undefined);
    setOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!value.trim()) return setError("Isi nama kelas.");
    if (value.trim() === name) return setOpen(false);
    setBusy("save");
    const result = await renameClassAction(id, value);
    setBusy(null);
    if (!result.ok) return setError(result.fieldErrors?.name ?? (toast.error(result.message), undefined));
    toast.success("Nama kelas diperbarui.");
    setOpen(false);
  }

  async function confirmed() {
    const kind = confirm;
    if (!kind) return;
    setBusy(kind);
    const result = kind === "archive" ? await archiveClassAction(id, true) : await deleteClassAction(id);
    setBusy(null);
    setConfirm(null);
    if (!result.ok) return toast.error(result.message);
    toast.success(kind === "archive" ? `Kelas "${name}" diarsipkan.` : `Kelas "${name}" dihapus.`);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        title="Ubah"
        aria-label={`Ubah ${name}`}
        onClick={openDialog}
        className="flex size-11 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-primary-tint hover:text-primary"
      >
        <Pencil size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>

      <Modal open={open && !confirm} onClose={() => setOpen(false)} labelledBy={titleId}>
        <DialogHeader id={titleId} title="Ubah kelas" description={code ? `Kode kelas: ${code}` : undefined} onClose={() => setOpen(false)} />
        <form onSubmit={save} noValidate className="mt-4 flex flex-col gap-4">
          <TextField label="Nama kelas" value={value} onChange={(e) => setValue(e.target.value)} error={error} maxLength={100} autoCapitalize="sentences" />
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={busy !== null}>
              Tutup
            </Button>
            <Button type="submit" loading={busy === "save"}>
              Simpan nama
            </Button>
          </div>
        </form>

        <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4">
          <ActionRow icon={<Users size={18} strokeWidth={1.75} />} title={`${studentCount} siswa`} description="Tambah, ubah, atau pindahkan siswa.">
            <Link href={`/teacher/students?class=${id}`} className="inline-flex min-h-10 items-center rounded-md px-3 text-small font-semibold text-primary hover:bg-primary-tint">
              Kelola
            </Link>
          </ActionRow>
          <ActionRow icon={<Archive size={18} strokeWidth={1.75} />} title="Arsipkan" description="Kelas disembunyikan, riwayatnya tetap ada.">
            <Button variant="secondary" className="min-h-10" onClick={() => setConfirm("archive")}>
              Arsipkan
            </Button>
          </ActionRow>
          <ActionRow icon={<Trash2 size={18} strokeWidth={1.75} />} title="Hapus" description="Hanya bisa bila kelas belum punya siswa atau sesi.">
            <Button variant="danger" className="min-h-10" onClick={() => setConfirm("delete")}>
              Hapus
            </Button>
          </ActionRow>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "delete" ? `Hapus kelas "${name}"?` : `Arsipkan kelas "${name}"?`}
        confirmLabel={confirm === "delete" ? "Hapus kelas" : "Arsipkan"}
        loading={busy === "archive" || busy === "delete"}
        onConfirm={confirmed}
        onCancel={() => setConfirm(null)}
      >
        {confirm === "delete"
          ? "Kelas yang sudah dihapus tidak bisa dikembalikan."
          : "Kelas tidak akan muncul lagi di daftar dan tidak bisa dipakai memulai sesi. Siswa dan riwayatnya tetap tersimpan."}
      </ConfirmDialog>
    </>
  );
}
