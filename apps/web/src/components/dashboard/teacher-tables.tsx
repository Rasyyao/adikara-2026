"use client";

import { CheckCircle2, Clock, Eye, FileEdit, FileText, MessageSquare, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { deleteChatAction } from "@/app/actions/chats";
import { StatusChip } from "@/components/session/status-chip";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { isUuid } from "@/lib/validation/auth";
import type { ClassSummary, MaterialRow, MaterialStatus, SessionRow } from "@/lib/dummy/teacher";
import { Cell, EmptyRow, Primary, nextSort, PlainHeader, ProgressCell, SortHeader, TableToolbar, type SortState } from "./table-parts";

const CARD = "overflow-hidden rounded-lg bg-surface";
const HEAD_ROW = "bg-bg";
// Rows are divided by the same hairline the cards use, and light up on hover.
const BODY_ROW = "border-t border-border transition-colors duration-150 ease-out hover:bg-bg";

function matches(query: string, ...fields: string[]) {
  const needle = query.trim().toLowerCase();
  return !needle || fields.some((field) => field.toLowerCase().includes(needle));
}

/** View and edit buttons for a class row. They do nothing yet; the pages and handlers come later. */
function ClassActions({ name }: { name: string }) {
  const base = "flex size-11 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-primary-tint hover:text-primary";
  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" title="Lihat detail" aria-label={`Lihat detail ${name}`} className={base}>
        <Eye size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <button type="button" title="Ubah" aria-label={`Ubah ${name}`} className={base}>
        <Pencil size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}

type SessionSort = "className" | "attendance";

export function SessionsTable({ title, rows }: { title: string; rows: SessionRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState<SortState<SessionSort> | null>(null);

  const visible = useMemo(() => {
    const filtered = rows.filter((row) => (status === "ALL" || row.status === status) && matches(query, row.className, row.topic));
    if (!sort) return filtered;
    const value = (row: SessionRow) => (sort.key === "className" ? row.className : row.present / row.total);
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const [x, y] = [value(a), value(b)];
      return (typeof x === "string" ? x.localeCompare(y as string, "id", { numeric: true }) : (x as number) - (y as number)) * factor;
    });
  }, [rows, query, status, sort]);

  return (
    <section aria-label={title} className={CARD}>
      <TableToolbar
        title={title}
        query={query}
        onQuery={setQuery}
        placeholder="Cari kelas atau materi…"
        filterLabel="Status sesi"
        options={[
          { value: "ALL", label: "Semua status" },
          { value: "ACTIVE", label: "Sedang berlangsung" },
          { value: "ENDED", label: "Selesai" },
        ]}
        filter={status}
        onFilter={setStatus}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className={HEAD_ROW}>
              <SortHeader label="Kelas" sortKey="className" sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))} />
              <PlainHeader>Waktu</PlainHeader>
              <SortHeader label="Kehadiran" sortKey="attendance" sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))} />
              <PlainHeader>Status</PlainHeader>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <EmptyRow colSpan={4} query={query} />
            ) : (
              visible.map((row) => (
                <tr key={row.id} className={BODY_ROW}>
                  <Cell>
                    <Primary title={row.className} subtitle={row.topic} />
                  </Cell>
                  <Cell className="whitespace-nowrap text-muted">{row.date}</Cell>
                  <Cell>
                    <ProgressCell percent={Math.round((row.present / row.total) * 100)} detail={`${row.present}/${row.total}`} />
                  </Cell>
                  <Cell>
                    <StatusChip status={row.status} />
                  </Cell>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type ClassSort = "name" | "students" | "attendance";

export function ClassesTable({ title, rows }: { title: string; rows: ClassSummary[] }) {
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("ALL");
  const [sort, setSort] = useState<SortState<ClassSort> | null>(null);

  const subjects = useMemo(() => [...new Set(rows.map((row) => row.subject))], [rows]);
  const visible = useMemo(() => {
    const filtered = rows.filter((row) => (subject === "ALL" || row.subject === subject) && matches(query, row.name, row.subject));
    if (!sort) return filtered;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "name") return a.name.localeCompare(b.name, "id", { numeric: true }) * factor;
      const key = sort.key === "students" ? "students" : "attendanceRate";
      return (a[key] - b[key]) * factor;
    });
  }, [rows, query, subject, sort]);

  return (
    <section aria-label={title} className={CARD}>
      <TableToolbar
        title={title}
        query={query}
        onQuery={setQuery}
        placeholder="Cari kelas atau mata pelajaran…"
        filterLabel="Mata pelajaran"
        options={[{ value: "ALL", label: "Semua mata pelajaran" }, ...subjects.map((value) => ({ value, label: value }))]}
        filter={subject}
        onFilter={setSubject}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className={HEAD_ROW}>
              <SortHeader label="Kelas" sortKey="name" sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))} />
              <SortHeader label="Siswa" sortKey="students" sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))} />
              <SortHeader label="Kehadiran" sortKey="attendance" sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))} />
              <PlainHeader>Sesi terakhir</PlainHeader>
              <PlainHeader>
                <span className="block text-right">Aksi</span>
              </PlainHeader>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <EmptyRow colSpan={5} query={query} />
            ) : (
              visible.map((row) => (
                <tr key={row.id} className={BODY_ROW}>
                  <Cell>
                    <Primary title={row.name} subtitle={row.subject} />
                  </Cell>
                  <Cell>{row.students} siswa</Cell>
                  <Cell>
                    <ProgressCell percent={row.attendanceRate} />
                  </Cell>
                  <Cell className="whitespace-nowrap text-muted">{row.lastSession}</Cell>
                  <Cell>
                    <ClassActions name={row.name} />
                  </Cell>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const MATERIAL_CHIPS: Record<MaterialStatus, { label: string; Icon: typeof CheckCircle2; tone: string }> = {
  DIPUBLIKASIKAN: { label: "Dipublikasikan", Icon: CheckCircle2, tone: "text-success" },
  DISETUJUI: { label: "Disetujui", Icon: Clock, tone: "text-primary" },
  DRAF: { label: "Draf", Icon: FileEdit, tone: "text-warning" },
};

export function MaterialStatusChip({ status }: { status: MaterialStatus }) {
  const { label, Icon, tone } = MATERIAL_CHIPS[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2 py-1 text-small font-semibold ${tone}`}>
      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      {label}
    </span>
  );
}

type MaterialSort = "title" | "className";

export function MaterialsTable({ title, rows }: { title: string; rows: MaterialRow[] }) {
  const toast = useToast();
  const dialogTitleId = useId();
  const dialogTextId = useId();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState<SortState<MaterialSort> | null>(null);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<MaterialRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const result = await deleteChatAction(pendingDelete.id);
    setDeleting(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setRemovedIds((ids) => [...ids, pendingDelete.id]);
    toast.success(`Materi "${pendingDelete.title}" dihapus.`);
    setPendingDelete(null);
  }

  const visible = useMemo(() => {
    const filtered = rows.filter(
      (row) =>
        !removedIds.includes(row.id) &&
        (status === "ALL" || row.status === status) &&
        matches(query, row.title, row.className, row.subject),
    );
    if (!sort) return filtered;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => a[sort.key].localeCompare(b[sort.key], "id", { numeric: true }) * factor);
  }, [rows, query, status, sort, removedIds]);

  return (
    <section aria-label={title} className={CARD}>
      <TableToolbar
        title={title}
        query={query}
        onQuery={setQuery}
        placeholder="Cari judul materi atau kelas…"
        filterLabel="Status materi"
        options={[
          { value: "ALL", label: "Semua status" },
          { value: "DIPUBLIKASIKAN", label: "Dipublikasikan" },
          { value: "DISETUJUI", label: "Disetujui" },
          { value: "DRAF", label: "Draf" },
        ]}
        filter={status}
        onFilter={setStatus}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className={HEAD_ROW}>
              <SortHeader label="Materi" sortKey="title" sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))} />
              <SortHeader label="Kelas" sortKey="className" sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))} />
              <PlainHeader>Berkas sumber</PlainHeader>
              <PlainHeader>Terakhir diubah</PlainHeader>
              <PlainHeader>Status</PlainHeader>
              <PlainHeader>
                <span className="block text-right">Aksi</span>
              </PlainHeader>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <EmptyRow colSpan={6} query={query} />
            ) : (
              visible.map((row) => (
                <tr key={row.id} className={BODY_ROW}>
                  <Cell>
                    <Link href={`/teacher/materials/${row.id}`} className="group block">
                      <p className="text-body font-semibold text-ink transition-colors duration-150 ease-out group-hover:text-primary">
                        {row.title}
                      </p>
                      <p className="truncate text-small text-muted">{row.subject}</p>
                    </Link>
                  </Cell>
                  <Cell>
                    <span className="font-semibold text-ink">{row.className}</span>
                  </Cell>
                  <Cell>
                    <span className="inline-flex items-center gap-2 text-muted">
                      <FileText size={20} strokeWidth={1.75} aria-hidden="true" />
                      {row.sources.length} berkas ({row.sources.map((s) => s.fileType).join(", ")})
                    </span>
                  </Cell>
                  <Cell className="whitespace-nowrap text-muted">{row.updatedAt}</Cell>
                  <Cell>
                    <MaterialStatusChip status={row.status} />
                  </Cell>
                  <Cell>
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/teacher/materials/${row.id}`}
                        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-small font-semibold text-ink transition-colors duration-150 ease-out hover:border-primary hover:bg-primary-tint hover:text-primary"
                      >
                        <MessageSquare size={20} strokeWidth={1.75} aria-hidden="true" />
                        Buka chat AI
                      </Link>
                      {isUuid(row.id) && (
                        <button
                          type="button"
                          onClick={() => setPendingDelete(row)}
                          title="Hapus materi"
                          aria-label={`Hapus materi ${row.title}`}
                          className="flex size-11 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-bg hover:text-danger"
                        >
                          <Trash2 size={20} strokeWidth={1.75} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </Cell>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={pendingDelete !== null}
        onClose={() => !deleting && setPendingDelete(null)}
        labelledBy={dialogTitleId}
        describedBy={dialogTextId}
        role="alertdialog"
      >
        <h2 id={dialogTitleId} className="text-h3 font-semibold text-ink">
          Hapus materi ini?
        </h2>
        <p id={dialogTextId} className="mt-2 text-body text-muted">
          &ldquo;{pendingDelete?.title}&rdquo; beserta seluruh percakapan AI dan berkas sumbernya akan dihapus permanen. Tindakan ini tidak
          dapat dibatalkan.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setPendingDelete(null)} disabled={deleting}>
            Batal
          </Button>
          <Button variant="danger" onClick={() => void confirmDelete()} loading={deleting}>
            Hapus
          </Button>
        </div>
      </Modal>
    </section>
  );
}
