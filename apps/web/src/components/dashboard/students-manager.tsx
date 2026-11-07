"use client";

import { Dices, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { useId, useMemo, useState, type FormEvent } from "react";
import { addStudentAction, removeStudentAction, updateStudentAction } from "@/app/actions/classes";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { DialogHeader } from "./class-management";
import { Cell, EmptyRow, Primary, nextSort, PlainHeader, SortHeader, TableToolbar, type SortState } from "./table-parts";

export interface ClassOption {
  id: string;
  name: string;
  code: string;
}

export interface StudentRowData {
  id: string;
  name: string;
  username: string;
  classId: string;
}

const SELECT = "block min-h-11 w-full rounded-md border border-border bg-surface px-3.5 text-body text-ink focus:border-primary focus:outline-none";
const SELECT_ERROR = "block min-h-11 w-full rounded-md border border-danger bg-surface px-3.5 text-body text-ink focus:border-primary focus:outline-none";
const ICON_BUTTON = "flex size-11 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-primary-tint hover:text-primary";

// no 0/O/1/l, so a password written on the board is not misread
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(8));
  return `${Array.from(bytes, (n) => PASSWORD_ALPHABET[n % PASSWORD_ALPHABET.length]).join("")}7`;
}

/** Suggests a username from a name: "Siti Aminah" -> "siti.aminah". The teacher can change it. */
function suggestUsername(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 32);
}

interface FormValues {
  name: string;
  username: string;
  password: string;
  classId: string;
}

function StudentDialog({
  open,
  onClose,
  classes,
  student,
  defaultClassId,
}: {
  open: boolean;
  onClose: () => void;
  classes: ClassOption[];
  /** Set to edit; left out to add. */
  student?: StudentRowData;
  defaultClassId: string;
}) {
  const toast = useToast();
  const titleId = useId();
  const classFieldId = useId();
  const editing = student !== undefined;
  const initial = (): FormValues => ({ name: student?.name ?? "", username: student?.username ?? "", password: "", classId: student?.classId ?? defaultClassId });
  const [values, setValues] = useState<FormValues>(initial);
  const [usernameTouched, setUsernameTouched] = useState(editing);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<FormValues>) => setValues((current) => ({ ...current, ...patch }));

  function validate(): Record<string, string> {
    const found: Record<string, string> = {};
    if (!values.name.trim()) found.name = "Isi nama siswa.";
    if (!/^[a-z0-9_.-]{3,32}$/.test(values.username.trim().toLowerCase())) found.username = "3-32 karakter: huruf, angka, titik, strip, atau garis bawah.";
    if (!editing || values.password) {
      if (values.password.length < 8 || !/[A-Za-z]/.test(values.password) || !/\d/.test(values.password)) found.password = "Minimal 8 karakter, dengan huruf dan angka.";
    }
    if (!values.classId) found.classId = "Pilih kelas.";
    return found;
  }

  /** `again` keeps the dialog open for the next student of the same class. */
  async function submit(event: FormEvent, again = false) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    const result = editing
      ? await updateStudentAction(student.classId, student.id, {
          name: values.name,
          username: values.username,
          password: values.password,
          moveToClassId: values.classId,
        })
      : await addStudentAction(values.classId, { name: values.name, username: values.username, password: values.password });
    setSaving(false);

    if (!result.ok) {
      if (result.fieldErrors) setErrors({ ...result.fieldErrors, ...(result.fieldErrors.class_id ? { classId: result.fieldErrors.class_id } : {}) });
      else toast.error(result.message);
      return;
    }
    if (editing) {
      toast.success("Data siswa diperbarui.");
      return onClose();
    }
    if (again) {
      // The login details are shown once, so the teacher can pass them on before the next student.
      toast.success({ title: `${values.name.trim()} ditambahkan`, message: `Nama pengguna: ${values.username.trim().toLowerCase()} · Kata sandi: ${values.password}`, duration: 15000 });
      setValues({ name: "", username: "", password: "", classId: values.classId });
      setUsernameTouched(false);
      setErrors({});
      return;
    }
    toast.success({ title: `${values.name.trim()} ditambahkan`, message: `Nama pengguna: ${values.username.trim().toLowerCase()} · Kata sandi: ${values.password}`, duration: 15000 });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy={titleId}>
      <DialogHeader
        id={titleId}
        title={editing ? "Ubah siswa" : "Tambah siswa"}
        description={editing ? "Kosongkan kata sandi bila tidak ingin mengubahnya." : "Siswa masuk dengan nama pengguna dan kata sandi ini."}
        onClose={onClose}
      />
      <form onSubmit={(event) => submit(event)} noValidate className="mt-4 flex flex-col gap-4">
        <TextField
          label="Nama siswa"
          value={values.name}
          onChange={(e) => set({ name: e.target.value, ...(usernameTouched ? {} : { username: suggestUsername(e.target.value) }) })}
          error={errors.name}
          maxLength={100}
          autoFocus
          autoCapitalize="words"
        />
        <TextField
          label="Nama pengguna"
          value={values.username}
          onChange={(e) => {
            setUsernameTouched(true);
            set({ username: e.target.value.toLowerCase() });
          }}
          error={errors.username}
          hint="Dipakai siswa untuk masuk. Harus berbeda dari siswa lain."
          maxLength={32}
        />
        <div>
          <TextField
            label={editing ? "Kata sandi baru (opsional)" : "Kata sandi"}
            value={values.password}
            onChange={(e) => set({ password: e.target.value })}
            error={errors.password}
            hint={editing ? "Isi hanya bila siswa lupa kata sandinya." : "Minimal 8 karakter, dengan huruf dan angka. Catat dan bagikan ke siswa."}
            maxLength={72}
            autoComplete="new-password"
          />
          <button type="button" onClick={() => set({ password: randomPassword() })} className="mt-1 inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-small font-semibold text-primary hover:bg-primary-tint">
            <Dices size={18} strokeWidth={1.75} aria-hidden="true" />
            Buat kata sandi acak
          </button>
        </div>
        <div>
          <label htmlFor={classFieldId} className="mb-1 block text-small font-semibold text-ink">
            Kelas
          </label>
          <select id={classFieldId} value={values.classId} onChange={(e) => set({ classId: e.target.value })} className={errors.classId ? SELECT_ERROR : SELECT}>
            <option value="" disabled>
              Pilih kelas…
            </option>
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.code})
              </option>
            ))}
          </select>
          {errors.classId ? (
            <p className="mt-1 text-small text-danger">{errors.classId}</p>
          ) : editing && values.classId !== student.classId ? (
            <p className="mt-1 text-small text-muted">Siswa akan dipindahkan dan hanya bisa masuk sesi kelas yang baru.</p>
          ) : (
            <p className="mt-1 text-small text-muted">Hanya siswa kelas ini yang bisa masuk ke sesinya.</p>
          )}
        </div>
        <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          {!editing && (
            <Button type="button" variant="secondary" loading={saving} onClick={(event) => submit(event, true)}>
              Simpan & tambah lagi
            </Button>
          )}
          <Button type="submit" loading={saving}>
            {editing ? "Simpan perubahan" : "Simpan siswa"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type StudentSort = "name" | "username";

/** Every student of the teacher's classes: add, edit, move to another class, remove. */
export function StudentsManager({ classes, students, initialClassId }: { classes: ClassOption[]; students: StudentRowData[]; initialClassId: string }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState(classes.some((c) => c.id === initialClassId) ? initialClassId : "ALL");
  const [sort, setSort] = useState<SortState<StudentSort> | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<StudentRowData | null>(null);
  const [removing, setRemoving] = useState<StudentRowData | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = students.filter(
      (row) => (classFilter === "ALL" || row.classId === classFilter) && (!needle || row.name.toLowerCase().includes(needle) || row.username.toLowerCase().includes(needle)),
    );
    const factor = sort?.dir === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const key = sort?.key ?? "name";
      return a[key].localeCompare(b[key], "id", { numeric: true }) * factor;
    });
  }, [students, query, classFilter, sort]);

  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    const result = await removeStudentAction(removing.classId, removing.id);
    setRemoveBusy(false);
    if (!result.ok) {
      toast.error(result.message);
      setRemoving(null);
      return;
    }
    toast.success(`${removing.name} dihapus dari kelas.`);
    setRemoving(null);
  }

  if (classes.length === 0) {
    return (
      <section className="rounded-lg bg-surface px-6 py-14 text-center">
        <p className="text-h3 font-semibold text-ink">Belum ada kelas</p>
        <p className="mx-auto mt-1 max-w-md text-body text-muted">Buat kelas dulu di halaman Kelas, lalu kembali ke sini untuk menambahkan siswa.</p>
      </section>
    );
  }

  const title = `${visible.length} siswa`;
  return (
    <>
      <div className="-mt-4 flex justify-end">
        <Button onClick={() => setAdding(true)}>
          <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
          Tambah siswa
        </Button>
      </div>
      <section aria-label="Daftar siswa" className="overflow-hidden rounded-lg bg-surface">
        <TableToolbar
          title={title}
          query={query}
          onQuery={setQuery}
          placeholder="Cari nama atau nama pengguna…"
          filterLabel="Kelas"
          options={[{ value: "ALL", label: "Semua kelas" }, ...classes.map((c) => ({ value: c.id, label: c.name }))]}
          filter={classFilter}
          onFilter={setClassFilter}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="bg-bg">
                <SortHeader label="Siswa" sortKey="name" sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))} />
                <SortHeader label="Nama pengguna" sortKey="username" sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))} />
                <PlainHeader>Kelas</PlainHeader>
                <PlainHeader>
                  <span className="block text-right">Aksi</span>
                </PlainHeader>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <EmptyRow colSpan={4} query={query || (classFilter === "ALL" ? "" : (classById.get(classFilter)?.name ?? ""))} />
              ) : (
                visible.map((row) => (
                  <tr key={row.id} className="border-t border-border transition-colors duration-150 ease-out hover:bg-bg">
                    <Cell>
                      <Primary title={row.name} subtitle={classById.get(row.classId)?.name ?? ""} />
                    </Cell>
                    <Cell className="font-mono text-muted">{row.username}</Cell>
                    <Cell>{classById.get(row.classId)?.name}</Cell>
                    <Cell>
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" title="Ubah" aria-label={`Ubah ${row.name}`} onClick={() => setEditing(row)} className={ICON_BUTTON}>
                          <Pencil size={20} strokeWidth={1.75} aria-hidden="true" />
                        </button>
                        <button type="button" title="Hapus" aria-label={`Hapus ${row.name}`} onClick={() => setRemoving(row)} className={`${ICON_BUTTON} hover:!bg-danger/10 hover:!text-danger`}>
                          <Trash2 size={20} strokeWidth={1.75} aria-hidden="true" />
                        </button>
                      </div>
                    </Cell>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {students.length === 0 && (
          <div className="flex flex-col items-center gap-3 border-t border-border px-6 py-10 text-center">
            <UserPlus size={28} strokeWidth={1.5} className="text-muted" aria-hidden="true" />
            <p className="text-body text-muted">Belum ada siswa. Tambahkan siswa dan pilih kelasnya.</p>
            <Button onClick={() => setAdding(true)}>
              <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
              Tambah siswa
            </Button>
          </div>
        )}
      </section>

      {/* The add dialog gets a new key each time it opens, so it never keeps what was typed before. */}
      <StudentDialog key={adding ? "add-open" : "add-closed"} open={adding} onClose={() => setAdding(false)} classes={classes} defaultClassId={classFilter === "ALL" ? (classes.length === 1 ? classes[0].id : "") : classFilter} />
      {editing && <StudentDialog key={editing.id} open onClose={() => setEditing(null)} classes={classes} student={editing} defaultClassId={editing.classId} />}

      <ConfirmDialog open={removing !== null} title={`Hapus ${removing?.name ?? "siswa"}?`} confirmLabel="Hapus siswa" loading={removeBusy} onConfirm={confirmRemove} onCancel={() => setRemoving(null)}>
        Akun siswa ini dihapus dan tidak bisa masuk lagi. Siswa yang sudah punya riwayat belajar tidak bisa dihapus; pindahkan ke kelas lain bila perlu.
      </ConfirmDialog>
    </>
  );
}
