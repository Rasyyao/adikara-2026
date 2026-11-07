"use client";

import { BookmarkCheck, BookOpen, Check, ChevronRight, ExternalLink, FileText, History, Maximize2, Minimize2, Network, Plus, QrCode, Sparkles, Workflow, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { AiChat, useChatStream } from "./ai-chat";
import type { BoardElement } from "./types";
import { extractVisualFromContent, VISUAL_LABELS, visualElements, type Visual } from "./visual";
import { SaveVisualButton, useSaveVisual, VisualThumb, type VisualMessage } from "./visual-library";
import { assessmentKindLabel, extractAssessmentsFromContent, StatusBadge, type AssessmentPayload } from "../../materials/assessment-editor";
import { extractMindmapFromContent } from "../../materials/mindmap-parse";
import type { MindmapPayload } from "../../materials/mindmap-layout";

/** Width of the panel in pixels (24rem); the board keeps its toolbar and new objects clear of it. */
export const PANEL_PX = 384;

/** The material assigned to the session, as the whiteboard needs it. `messages` are the AI replies that may hold a mindmap, a test or a visual. */
export interface BoardMaterialInfo {
  id: string;
  title: string;
  files: { id: string; title: string; file_type: string }[];
  messages: VisualMessage[];
}

const nodeCount = (mindmap: MindmapPayload) => mindmap.nodes.length;

/** A visual found in a reply of the conversation. */
interface LibraryVisual {
  message: VisualMessage;
  visual: Visual;
  saved: boolean;
}

/** How big a visual is, in the words a teacher counts it in. */
function visualSize(visual: Visual): string {
  if (visual.type === "flow") return `${visual.nodes.length} langkah`;
  if (visual.type === "timeline") return `${visual.items.length} peristiwa`;
  if (visual.type === "trace") return `${visual.steps.length} langkah kode`;
  return `${visual.columns.length} kolom`;
}

/**
 * One prepared visual: its drawing, so the teacher recognises it at a glance, and one big button that puts it on the
 * board as it is, with no AI to wait for. A click on the drawing does the same.
 */
function ReadyVisual({ item, saving, onPaste, onToggleSave }: { item: LibraryVisual; saving: boolean; onPaste: () => void; onToggleSave: () => void }) {
  const [pasted, setPasted] = useState(false);
  useEffect(() => {
    if (!pasted) return;
    const timer = setTimeout(() => setPasted(false), 1600);
    return () => clearTimeout(timer);
  }, [pasted]);
  const paste = () => {
    onPaste();
    setPasted(true);
  };
  return (
    <li className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-[var(--shadow-overlay)]">
      <button type="button" onClick={paste} aria-label={`Tempel ${item.visual.title} ke papan`} className="group relative block border-b border-border bg-bg p-2">
        <VisualThumb visual={item.visual} className="h-36 w-full" />
        <span className="absolute inset-0 flex items-center justify-center bg-primary/0 text-small font-semibold text-transparent transition-colors group-hover:bg-primary/10 group-hover:text-primary">
          Klik untuk menempel
        </span>
      </button>
      <div className="flex flex-col gap-2.5 p-3">
        <div className="min-w-0">
          <p className="line-clamp-2 break-words text-small font-semibold leading-snug text-ink">{item.visual.title}</p>
          <p className="mt-0.5 text-caption text-muted">
            {VISUAL_LABELS[item.visual.type]} · {visualSize(item.visual)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={paste}
            className={`inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-small font-semibold text-white transition-colors ${pasted ? "bg-success" : "bg-primary hover:bg-primary-hover"}`}
          >
            {pasted ? <Check size={16} strokeWidth={2.25} aria-hidden="true" /> : <Plus size={16} strokeWidth={2} aria-hidden="true" />}
            {pasted ? "Sudah di papan" : "Tempel ke papan"}
          </button>
          <SaveVisualButton saved={item.saved} saving={saving} onToggle={onToggleSave} compact />
        </div>
      </div>
    </li>
  );
}

/** A visual of the conversation the teacher has not saved: smaller, to save it for later or put it on the board now. */
function HistoryVisual({ item, saving, onPaste, onToggleSave }: { item: LibraryVisual; saving: boolean; onPaste: () => void; onToggleSave: () => void }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2">
      <VisualThumb visual={item.visual} className="h-14 w-20 shrink-0 object-contain" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-small font-semibold text-ink" title={item.visual.title}>
          {item.visual.title}
        </p>
        <p className="text-caption text-muted">
          {VISUAL_LABELS[item.visual.type]} · {visualSize(item.visual)}
        </p>
      </div>
      <SaveVisualButton saved={false} saving={saving} onToggle={onToggleSave} compact />
      <button
        type="button"
        onClick={onPaste}
        aria-label={`Tempel ${item.visual.title} ke papan`}
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-white transition-colors hover:bg-primary-hover"
      >
        <Plus size={16} strokeWidth={2} aria-hidden="true" />
      </button>
    </li>
  );
}

function QuestionList({ test }: { test: AssessmentPayload }) {
  return (
    <ol className="mt-2 flex flex-col gap-3">
      {test.questions.map((q) => (
        <li key={q.id} className="text-small">
          <p className="font-semibold text-ink">
            {q.id}. {q.question}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {q.options.map((o) => (
              <li key={o.key} className={o.key === q.answer ? "font-semibold text-success" : "text-muted"}>
                {o.key}. {o.text}
                {o.key === q.answer ? "  ✓" : ""}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/** The class material, one click away on the whiteboard: add its mindmaps to the board, look up the tests and the files. */
export function MaterialPanel({
  material,
  width,
  maxWidth,
  onResize,
  askRequest,
  onAskSent,
  onAddMindmap,
  onAddNote,
  onAddFlow,
  onAddQuiz,
  addingQuiz = false,
  onClose,
}: {
  material: BoardMaterialInfo | null;
  /** Current width in pixels, between PANEL_PX and `maxWidth`; the board owns it so new objects stay clear of the panel. */
  width: number;
  maxWidth: number;
  onResize: (width: number) => void;
  /** A mindmap node to send to the AI; a new `id` opens the AI tab and sends `text`. */
  askRequest: { id: number; text: string } | null;
  /** The request was sent (or could not be), so the board forgets it. */
  onAskSent: () => void;
  onAddMindmap: (mindmap: MindmapPayload) => void;
  onAddNote: (text: string) => void;
  onAddFlow: (elements: BoardElement[]) => void;
  /** Opens a test as a quiz for the class, with a QR card on the board; absent where quizzes cannot be opened. */
  onAddQuiz?: (test: AssessmentPayload, messageId: string | null) => void;
  addingQuiz?: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"material" | "visual" | "ai">(askRequest ? "ai" : "material");
  const clamp = (value: number) => Math.round(Math.min(maxWidth, Math.max(PANEL_PX, value)));
  const expanded = width > PANEL_PX + 8;
  /** Dragging the left edge: the panel grows to the left, so the pointer moving left makes it wider. */
  const [drag, setDrag] = useState<{ x: number; width: number } | null>(null);
  const onHandleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ x: event.clientX, width });
  };
  const onHandleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag) onResize(clamp(drag.width + drag.x - event.clientX));
  };
  const onHandleKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") onResize(clamp(width + 32));
    else if (event.key === "ArrowRight") onResize(clamp(width - 32));
    else return;
    event.preventDefault();
  };
  // the render that sees a new ask switches the tab, so the chat is mounted when it needs to send
  const [seenAsk, setSeenAsk] = useState(askRequest?.id ?? 0);
  if (askRequest && askRequest.id !== seenAsk) {
    setSeenAsk(askRequest.id);
    setTab("ai");
  }
  // the replies loaded with the page, brought up to date by what was saved here and by the live conversation (its last
  // 100 replies), so a visual saved on the materials page or from the AI tab is listed at once
  const stream = useChatStream(material?.id ?? null);
  const [savedHere, setSavedHere] = useState<Record<string, string>>({});
  const replies = useMemo(() => {
    const byId = new Map((material?.messages ?? []).map((m) => [m.id, m.content]));
    for (const [id, content] of Object.entries(savedHere)) byId.set(id, content);
    for (const m of stream.messages) if (m.role === "ASSISTANT") byId.set(m.id, m.content);
    return [...byId].map(([id, content]): VisualMessage => ({ id, content }));
  }, [material, savedHere, stream.messages]);
  const saver = useSaveVisual(material?.id, (next) => {
    setSavedHere((all) => ({ ...all, [next.id]: next.content }));
    stream.setMessages((current) => current.map((m) => (m.id === next.id ? { ...m, content: next.content } : m)));
  });
  const toggleSave = (item: LibraryVisual) => void saver.toggle(item.message, item.saved);
  const paste = (visual: Visual) => onAddFlow(visualElements(visual));

  // newest first; a visual, mindmap or test that was regenerated unchanged is listed once
  const { mindmaps, tests, saved, unsaved } = useMemo(() => {
    const maps: MindmapPayload[] = [];
    const seen = new Set<string>();
    const latestTests = new Map<string, { test: AssessmentPayload; messageId: string }>();
    const visuals: LibraryVisual[] = [];
    const seenVisuals = new Set<string>();
    for (const { id, content } of [...replies].reverse()) {
      const found = extractVisualFromContent(content);
      if (found) {
        const key = JSON.stringify(found.visual);
        if (!seenVisuals.has(key)) {
          seenVisuals.add(key);
          visuals.push({ message: { id, content }, visual: found.visual, saved: found.saved });
        }
        continue; // a flow's "nodes" would be read as a mindmap
      }
      const mindmap = extractMindmapFromContent(content)?.mindmap;
      if (mindmap) {
        const key = `${mindmap.title}|${JSON.stringify(mindmap.nodes.map((n) => [n.id, n.parent_id, n.label]))}`;
        if (!seen.has(key)) {
          seen.add(key);
          maps.push(mindmap);
        }
      }
      for (const test of extractAssessmentsFromContent(content)?.assessments ?? []) if (!latestTests.has(test.kind)) latestTests.set(test.kind, { test, messageId: id });
    }
    return {
      mindmaps: maps,
      tests: [...latestTests.values()].sort((a) => (a.test.kind === "pretest" ? -1 : 1)),
      saved: visuals.filter((v) => v.saved),
      unsaved: visuals.filter((v) => !v.saved),
    };
  }, [replies]);

  return (
    <aside
      aria-label="Materi kelas"
      style={{ width }}
      className="absolute bottom-3 right-3 top-3 z-30 flex max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-overlay)]"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Ubah lebar panel (seret, atau tombol panah kiri dan kanan)"
        tabIndex={0}
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={onHandleKey}
        className={`absolute inset-y-0 left-0 z-10 w-2 cursor-col-resize touch-none transition-colors hover:bg-primary-tint focus-visible:bg-primary-tint focus-visible:outline-none ${drag ? "bg-primary-tint" : ""}`}
      /> 
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-border p-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-caption font-semibold text-muted">
            <BookOpen size={14} strokeWidth={1.75} aria-hidden="true" />
            Materi kelas
          </p>
          <h2 className="mt-0.5 break-words text-h3 font-semibold text-ink">{material?.title ?? "Belum ada materi"}</h2>
        </div>
        <button
          type="button"
          onClick={() => onResize(expanded ? PANEL_PX : clamp(Math.round(maxWidth * 0.75)))}
          aria-label={expanded ? "Kecilkan panel" : "Perlebar panel"}
          aria-pressed={expanded}
          className="ml-auto flex size-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink"
        >
          {expanded ? <Minimize2 size={18} strokeWidth={1.75} aria-hidden="true" /> : <Maximize2 size={18} strokeWidth={1.75} aria-hidden="true" />}
        </button>
        <button type="button" onClick={onClose} aria-label="Tutup panel materi" className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink">
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </header>

      <div role="tablist" aria-label="Panel materi" className="m-3 flex shrink-0 gap-1 rounded-lg bg-bg p-1">
        {(
          [
            { id: "material", label: "Materi", Icon: BookOpen },
            { id: "visual", label: "Visualisasi", Icon: Workflow },
            { id: "ai", label: "Tanya AI", Icon: Sparkles },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`inline-flex min-h-9 min-w-0 flex-1 select-none items-center justify-center gap-1.5 rounded-md px-2 text-caption font-semibold transition-colors ${
              tab === id ? "bg-surface text-primary shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {!material ? (
        <p className="m-4 rounded-md border border-dashed border-border p-4 text-small text-muted">
          Sesi ini belum punya materi. Pasang materi di tab <b>Kontrol sesi</b>, bagian Materi kelas.
        </p>
      ) : tab === "ai" ? (
        <AiChat chatId={material.id} stream={stream} askRequest={askRequest} onAskSent={onAskSent} onAddMindmap={onAddMindmap} onAddNote={onAddNote} onAddFlow={onAddFlow} />
      ) : tab === "visual" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
          <section aria-label="Visualisasi siap tempel" className="flex flex-col gap-2.5">
            <div>
              <h3 className="flex items-center gap-1.5 text-small font-semibold text-ink">
                <BookmarkCheck size={16} strokeWidth={2} className="text-primary" aria-hidden="true" />
                Visualisasi siap tempel
                {saved.length > 0 && <span className="rounded-full bg-primary-tint px-2 py-0.5 text-caption font-semibold text-primary">{saved.length}</span>}
              </h3>
              <p className="mt-0.5 text-caption leading-relaxed text-muted">Sudah Anda siapkan sebelum kelas. Klik Tempel ke papan, diagram langsung muncul tanpa menunggu AI.</p>
            </div>
            {saved.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-bg p-4 text-small text-muted">
                <p className="flex items-center gap-1.5 font-semibold text-ink">
                  <Workflow size={16} strokeWidth={1.75} className="text-primary" aria-hidden="true" />
                  Belum ada visualisasi tersimpan
                </p>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-caption leading-relaxed">
                  <li>Buka halaman materi, minta AI membuat diagram atau visualisasi.</li>
                  <li>
                    Klik <b className="text-ink">Simpan untuk kelas</b> di atas diagramnya.
                  </li>
                  <li>Di kelas, diagram itu muncul di sini dan tinggal ditempel.</li>
                </ol>
              </div>
            ) : (
              <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
                {saved.map((item) => (
                  <ReadyVisual key={item.message.id} item={item} saving={saver.savingId === item.message.id} onPaste={() => paste(item.visual)} onToggleSave={() => toggleSave(item)} />
                ))}
              </ul>
            )}
            {unsaved.length > 0 && (
              <details className="group rounded-lg border border-border bg-bg">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2.5 text-caption font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  <ChevronRight size={16} strokeWidth={1.75} className="text-muted transition-transform group-open:rotate-90" aria-hidden="true" />
                  <History size={14} strokeWidth={1.75} className="text-muted" aria-hidden="true" />
                  Visualisasi lain dari percakapan AI ({unsaved.length})
                </summary>
                <ul className="flex flex-col gap-2 px-2 pb-2">
                  {unsaved.map((item) => (
                    <HistoryVisual key={item.message.id} item={item} saving={saver.savingId === item.message.id} onPaste={() => paste(item.visual)} onToggleSave={() => toggleSave(item)} />
                  ))}
                </ul>
              </details>
            )}
          </section>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
          <Link
            href={`/teacher/materials/${material.id}`}
            target="_blank"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border px-3 text-small font-semibold text-ink transition-colors hover:border-primary hover:text-primary"
          >
            <ExternalLink size={16} strokeWidth={1.75} aria-hidden="true" />
            Buka halaman materi (tab baru)
          </Link>

          <section aria-label="Mindmap">
            <h3 className="mb-2 flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-muted">
              <Network size={14} strokeWidth={1.75} aria-hidden="true" />
              Mindmap
            </h3>
            {mindmaps.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-3 text-small text-muted">Belum ada mindmap. Buat di halaman materi, lalu muncul di sini.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {mindmaps.map((mindmap, index) => (
                  <li key={index} className="flex flex-col gap-3 rounded-lg border border-border bg-bg p-3">
                    <div className="min-w-0">
                      <p className="break-words text-small font-semibold text-ink">{mindmap.title}</p>
                      <p className="text-caption text-muted">{nodeCount(mindmap)} konsep</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onAddMindmap(mindmap)}
                      className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-small font-semibold text-white transition-colors hover:bg-primary-hover"
                    >
                      <Plus size={16} strokeWidth={2} aria-hidden="true" />
                      Tambahkan ke papan
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Soal asesmen" className="flex flex-col gap-2.5">
            <div>
              <h3 className="flex items-center gap-1.5 text-small font-semibold text-ink">
                <QrCode size={16} strokeWidth={2} className="text-primary" aria-hidden="true" />
                Kuis untuk kelas
              </h3>
              <p className="mt-0.5 text-caption leading-relaxed text-muted">Tempel soal ke papan: muncul kartu ber-QR. Siswa scan atau klik kartunya, lalu nilainya tampil langsung untuk Anda.</p>
            </div>
            {tests.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-3 text-small text-muted">Belum ada Pre-Test atau Post-Test. Buat di halaman materi dengan tombol Buat soal.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {tests.map(({ test, messageId }) => (
                  <li key={test.kind} className="flex flex-col gap-2.5 rounded-lg border border-border bg-bg p-3">
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-small font-semibold text-ink [&::-webkit-details-marker]:hidden">
                        <span className="flex items-center gap-1.5">
                          <ChevronRight size={16} strokeWidth={1.75} className="text-muted transition-transform group-open:rotate-90" aria-hidden="true" />
                          {assessmentKindLabel(test.kind)} · {test.questions.length} soal
                        </span>
                        <StatusBadge status={test.status} />
                      </summary>
                      <QuestionList test={test} />
                    </details>
                    {onAddQuiz && (
                      <>
                        <button
                          type="button"
                          disabled={addingQuiz}
                          onClick={() => onAddQuiz(test, messageId)}
                          className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-small font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-wait disabled:opacity-60"
                        >
                          <QrCode size={16} strokeWidth={2} aria-hidden="true" />
                          {addingQuiz ? "Membuka kuis…" : "Tempel ke papan sebagai kuis"}
                        </button>
                        {test.status !== "approved" && <p className="text-caption text-warning">Soal ini masih draf. Periksa dulu di halaman materi bila perlu.</p>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Berkas sumber">
            <h3 className="mb-2 text-caption font-semibold uppercase tracking-wide text-muted">Berkas sumber</h3>
            {material.files.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-3 text-small text-muted">Belum ada berkas.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {material.files.filter((f, i, all) => all.findIndex((o) => o.title === f.title && o.file_type === f.file_type) === i).map((file) => (
                  <li key={file.id} className="flex items-center gap-2 text-small text-ink">
                    <FileText size={16} strokeWidth={1.75} className="shrink-0 text-primary" aria-hidden="true" />
                    <span className="truncate" title={file.title}>
                      {file.title}
                    </span>
                    <span className="shrink-0 text-caption uppercase text-muted">{file.file_type}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}
