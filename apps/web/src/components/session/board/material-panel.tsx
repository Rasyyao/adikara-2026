"use client";

import { BookOpen, ExternalLink, FileText, Network, Plus, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AiChat } from "./ai-chat";
import { assessmentKindLabel, extractAssessmentsFromContent, StatusBadge, type AssessmentPayload } from "../../materials/assessment-editor";
import { extractMindmapFromContent } from "../../materials/mindmap-parse";
import type { MindmapPayload } from "../../materials/mindmap-layout";

/** Width of the panel in pixels (24rem); the board keeps its toolbar and new objects clear of it. */
export const PANEL_PX = 384;

/** The material assigned to the session, as the whiteboard needs it. `messages` are the AI replies that may hold a mindmap or a test. */
export interface BoardMaterialInfo {
  id: string;
  title: string;
  files: { id: string; title: string; file_type: string }[];
  messages: string[];
}

const nodeCount = (mindmap: MindmapPayload) => mindmap.nodes.length;

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
  onAddMindmap,
  onAddNote,
  onClose,
}: {
  material: BoardMaterialInfo | null;
  onAddMindmap: (mindmap: MindmapPayload) => void;
  onAddNote: (text: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"material" | "ai">("material");
  // newest first, and a mindmap that was regenerated unchanged is listed once
  const { mindmaps, tests } = useMemo(() => {
    const maps: MindmapPayload[] = [];
    const seen = new Set<string>();
    const latestTests = new Map<string, AssessmentPayload>();
    for (const content of [...(material?.messages ?? [])].reverse()) {
      const mindmap = extractMindmapFromContent(content)?.mindmap;
      if (mindmap) {
        const key = `${mindmap.title}|${JSON.stringify(mindmap.nodes.map((n) => [n.id, n.parent_id, n.label]))}`;
        if (!seen.has(key)) {
          seen.add(key);
          maps.push(mindmap);
        }
      }
      for (const test of extractAssessmentsFromContent(content)?.assessments ?? []) if (!latestTests.has(test.kind)) latestTests.set(test.kind, test);
    }
    return { mindmaps: maps, tests: [...latestTests.values()].sort((a) => (a.kind === "pretest" ? -1 : 1)) };
  }, [material]);

  return (
    <aside
      aria-label="Materi kelas"
      className="absolute bottom-3 right-3 top-3 z-30 flex w-[24rem] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-overlay)]"
    >
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-border p-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-caption font-semibold text-muted">
            <BookOpen size={14} strokeWidth={1.75} aria-hidden="true" />
            Materi kelas
          </p>
          <h2 className="mt-0.5 break-words text-h3 font-semibold text-ink">{material?.title ?? "Belum ada materi"}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Tutup panel materi" className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink">
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </header>

      <div role="tablist" aria-label="Panel materi" className="flex shrink-0 gap-1 border-b border-border px-3 py-2">
        {(
          [
            { id: "material", label: "Materi", Icon: BookOpen },
            { id: "ai", label: "Tanya AI", Icon: Sparkles },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-caption font-semibold transition-colors ${
              tab === id ? "bg-primary text-white" : "text-muted hover:bg-bg hover:text-ink"
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
        <AiChat chatId={material.id} onAddMindmap={onAddMindmap} onAddNote={onAddNote} />
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
            <h3 className="mb-2 flex items-center gap-1.5 text-small font-semibold text-ink">
              <Network size={16} strokeWidth={1.75} aria-hidden="true" />
              Mindmap
            </h3>
            {mindmaps.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-3 text-small text-muted">Belum ada mindmap. Buat di halaman materi, lalu muncul di sini.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {mindmaps.map((mindmap, index) => (
                  <li key={index} className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg p-3">
                    <div className="min-w-0">
                      <p className="truncate text-small font-semibold text-ink" title={mindmap.title}>
                        {mindmap.title}
                      </p>
                      <p className="text-caption text-muted">{nodeCount(mindmap)} konsep</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onAddMindmap(mindmap)}
                      className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-caption font-semibold text-white transition-colors hover:bg-primary-hover"
                    >
                      <Plus size={14} strokeWidth={2} aria-hidden="true" />
                      Tambahkan ke papan
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Soal asesmen">
            <h3 className="mb-2 text-small font-semibold text-ink">Soal asesmen</h3>
            {tests.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-3 text-small text-muted">Belum ada Pre-Test atau Post-Test.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {tests.map((test) => (
                  <li key={test.kind} className="rounded-md border border-border bg-bg p-3">
                    <details>
                      <summary className="flex cursor-pointer items-center justify-between gap-2 text-small font-semibold text-ink">
                        <span>
                          {assessmentKindLabel(test.kind)} · {test.questions.length} soal
                        </span>
                        <StatusBadge status={test.status} />
                      </summary>
                      <QuestionList test={test} />
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Berkas sumber">
            <h3 className="mb-2 text-small font-semibold text-ink">Berkas sumber</h3>
            {material.files.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-3 text-small text-muted">Belum ada berkas.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {material.files.map((file) => (
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
