"use client";

import { CheckCircle2, FilePenLine, Plus, RotateCcw, Save, Trash2, Undo2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

export type AssessmentKind = "pretest" | "posttest";

export interface AssessmentOption {
  key: string;
  text: string;
}

export interface AssessmentQuestion {
  id: number;
  question: string;
  options: AssessmentOption[];
  answer: string;
  explanation: string;
  source: string | null;
}

/** A generated test is a draft until the teacher approves it; an approved test is locked. */
export type AssessmentStatus = "draft" | "approved";

export interface AssessmentPayload {
  kind: AssessmentKind;
  status: AssessmentStatus;
  title: string;
  questions: AssessmentQuestion[];
  model?: string;
}

const KEYS = "ABCD";
const KIND_LABEL: Record<AssessmentKind, string> = { pretest: "Pre-Test", posttest: "Post-Test" };

export function assessmentStatusLabel(status: AssessmentStatus): string {
  return status === "approved" ? "Disetujui" : "Draf";
}

export function StatusBadge({ status }: { status: AssessmentStatus }) {
  const approved = status === "approved";
  const Icon = approved ? CheckCircle2 : FilePenLine;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-semibold ${
        approved ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
      }`}
    >
      <Icon size={13} strokeWidth={2} aria-hidden="true" />
      {assessmentStatusLabel(status)}
    </span>
  );
}

export function assessmentKindLabel(kind: AssessmentKind): string {
  return KIND_LABEL[kind];
}

function normalizeQuestion(raw: unknown, index: number): AssessmentQuestion | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Record<string, unknown>;
  const options = Array.isArray(item.options) ? item.options : [];
  const texts = options.map((o) => (typeof o === "object" && o !== null ? String((o as { text?: unknown }).text ?? "") : String(o ?? "")));
  if (typeof item.question !== "string" || texts.length !== KEYS.length) return null;
  const answer = typeof item.answer === "string" ? item.answer.toUpperCase() : "";
  return {
    id: index + 1,
    question: item.question,
    options: texts.map((text, i) => ({ key: KEYS[i], text })),
    answer: KEYS.includes(answer) && answer.length === 1 ? answer : "A",
    explanation: typeof item.explanation === "string" ? item.explanation : "",
    source: typeof item.source === "string" && item.source ? item.source : null,
  };
}

function normalizeAssessment(raw: unknown): AssessmentPayload | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Record<string, unknown>;
  if (!Array.isArray(item.questions)) return null;
  const kind: AssessmentKind = item.kind === "posttest" ? "posttest" : "pretest";
  const questions = item.questions.map(normalizeQuestion).filter((q): q is AssessmentQuestion => q !== null);
  if (questions.length === 0) return null;
  return {
    kind,
    status: item.status === "approved" ? "approved" : "draft",
    title: typeof item.title === "string" && item.title.trim() ? item.title : KIND_LABEL[kind],
    questions: questions.map((q, i) => ({ ...q, id: i + 1 })),
    model: typeof item.model === "string" ? item.model : undefined,
  };
}

/**
 * Finds the ```assessment block of an AI reply: one test, or a pre-test and a post-test together.
 * Returns `null` when the message holds no test.
 */
export function extractAssessmentsFromContent(content: string): {
  assessments: AssessmentPayload[];
  introText: string;
  outroText: string;
} | null {
  // the fenced block the worker writes now, or the bare JSON that earlier replies hold
  const match = /```(?:assessment|json)\s*([\s\S]*?)```/i.exec(content);
  const bare = content.trim();
  const source = match ? match[1] : /^[[{][\s\S]*[\]}]$/.test(bare) ? bare : null;
  if (source === null) return null;
  try {
    const parsed: unknown = JSON.parse(source.trim());
    const assessments = (Array.isArray(parsed) ? parsed : [parsed]).map(normalizeAssessment).filter((a): a is AssessmentPayload => a !== null);
    if (assessments.length === 0) return null;
    return {
      assessments,
      introText: match ? content.slice(0, match.index).trim() : "",
      outroText: match ? content.slice(match.index + match[0].length).trim() : "",
    };
  } catch {
    return null;
  }
}

/** Writes the edited tests back into the message they came from; the text around the block is kept. */
export function replaceAssessmentsInContent(content: string, assessments: AssessmentPayload[]): string {
  const extracted = extractAssessmentsFromContent(content);
  const payload = assessments.length === 1 ? assessments[0] : assessments;
  // a question may hold a code sample with backticks: escape them so they cannot close the fence
  const json = JSON.stringify(payload, null, 2).replaceAll("```", "\\u0060\\u0060\\u0060");
  const block = "```assessment\n" + json + "\n```";
  return [extracted?.introText ?? "", block, extracted?.outroText ?? ""].filter(Boolean).join("\n\n");
}

/** What is wrong with a test, in the teacher's words; `null` when it can be saved. */
function validateAssessment(assessment: AssessmentPayload): string | null {
  const label = KIND_LABEL[assessment.kind];
  if (assessment.questions.length === 0) return `${label} harus punya minimal 1 soal.`;
  for (const q of assessment.questions) {
    if (!q.question.trim()) return `${label}: soal ${q.id} belum ada teksnya.`;
    if (q.options.some((o) => !o.text.trim())) return `${label}: semua pilihan pada soal ${q.id} harus diisi.`;
    const texts = new Set(q.options.map((o) => o.text.trim().toLowerCase()));
    if (texts.size !== q.options.length) return `${label}: pilihan pada soal ${q.id} tidak boleh sama.`;
  }
  return null;
}

function renumber(assessment: AssessmentPayload): AssessmentPayload {
  return { ...assessment, questions: assessment.questions.map((q, i) => ({ ...q, id: i + 1 })) };
}

function blankQuestion(): AssessmentQuestion {
  return {
    id: 0,
    question: "",
    options: Array.from(KEYS, (key) => ({ key, text: "" })),
    answer: "A",
    explanation: "",
    source: null,
  };
}

const FIELD =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-ink placeholder:text-muted focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

function trimAssessment(a: AssessmentPayload): AssessmentPayload {
  return {
    ...a,
    questions: a.questions.map((q) => ({
      ...q,
      question: q.question.trim(),
      explanation: q.explanation.trim(),
      options: q.options.map((o) => ({ ...o, text: o.text.trim() })),
    })),
  };
}

/** A pre-test and/or post-test the teacher edits as a draft and then approves; an approved test is read-only. */
export function AssessmentBoard({
  assessments: propAssessments,
  kind: initialKind,
  onSave,
}: {
  assessments: AssessmentPayload[];
  /** The test shown first when the message holds both. */
  kind?: AssessmentKind;
  /** Makes the board editable. Resolves true when the tests were stored. */
  onSave?: (assessments: AssessmentPayload[]) => Promise<boolean>;
}) {
  const groupId = useId();
  const [edited, setEdited] = useState<AssessmentPayload[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, propAssessments.findIndex((a) => a.kind === initialKind)));
  const [busy, setBusy] = useState<"save" | "approve" | "reopen" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const propSig = useMemo(() => JSON.stringify(propAssessments), [propAssessments]);
  const assessments = edited ?? propAssessments;
  const isDirty = edited !== null && JSON.stringify(edited) !== propSig;
  const index = Math.min(activeIndex, assessments.length - 1);
  const current = assessments[index];
  const approved = current.status === "approved";
  const editable = Boolean(onSave) && !approved;

  function updateCurrent(change: (a: AssessmentPayload) => AssessmentPayload) {
    setEdited(assessments.map((a, i) => (i === index ? renumber(change(a)) : a)));
    setError(null);
  }

  function updateQuestion(qIndex: number, change: (q: AssessmentQuestion) => AssessmentQuestion) {
    updateCurrent((a) => ({ ...a, questions: a.questions.map((q, i) => (i === qIndex ? change(q) : q)) }));
  }

  /** Stores the tests with the current one set to `status`; approving is refused while the test is invalid. */
  async function persist(action: "save" | "approve" | "reopen") {
    if (!onSave || busy) return;
    const status: AssessmentStatus = action === "approve" ? "approved" : action === "reopen" ? "draft" : current.status;
    if (action !== "reopen") {
      const problem = validateAssessment(current);
      if (problem) {
        setError(problem);
        return;
      }
    }
    setBusy(action);
    try {
      const next = assessments.map((a, i) => trimAssessment(i === index ? { ...a, status } : a));
      if (await onSave(next)) setEdited(null);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {assessments.length > 1 && !initialKind && (
        <div role="tablist" aria-label="Jenis asesmen" className="flex shrink-0 gap-2 border-b border-border bg-bg px-4 py-2.5">
          {assessments.map((a, i) => (
            <button
              key={a.kind}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => { setActiveIndex(i); setError(null); }}
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3.5 py-1.5 text-body font-semibold transition-colors ${
                i === index ? "border-primary bg-surface text-primary" : "border-border bg-bg text-muted hover:border-primary/50 hover:text-ink"
              }`}
            >
              {KIND_LABEL[a.kind]}
              <StatusBadge status={a.status} />
            </button>
          ))}
        </div>
      )}

      <div
        className={`flex shrink-0 items-start gap-3 border-b px-4 py-3 ${
          approved ? "border-success/30 bg-success/10" : "border-warning/30 bg-warning/10"
        }`}
      >
        {approved ? (
          <CheckCircle2 size={22} strokeWidth={1.75} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
        ) : (
          <FilePenLine size={22} strokeWidth={1.75} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="text-body font-semibold text-ink">
            {KIND_LABEL[current.kind]} · {current.questions.length} soal · {approved ? "Sudah disetujui" : "Draf, belum disetujui"}
          </p>
          <p className="text-caption text-muted">
            {approved
              ? "Soal ini sudah final dan terkunci. Buka kembali sebagai draf bila perlu mengubahnya."
              : "Periksa setiap soal, ubah teks, pilihan, atau kunci jawaban bila perlu, lalu setujui."}
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${groupId}-title`} className="text-caption font-semibold text-muted">
            Judul {KIND_LABEL[current.kind]}
          </label>
          {editable ? (
            <input
              id={`${groupId}-title`}
              value={current.title}
              onChange={(e) => updateCurrent((a) => ({ ...a, title: e.target.value }))}
              className={FIELD}
            />
          ) : (
            <p className="text-h3 font-semibold text-ink">{current.title}</p>
          )}
        </div>

        {current.questions.map((q, qIndex) => (
          <section key={qIndex} aria-label={`Soal ${q.id}`} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary text-body font-bold text-white">
                {q.id}
              </span>
              {editable && (
                <button
                  type="button"
                  onClick={() => updateCurrent((a) => ({ ...a, questions: a.questions.filter((_, i) => i !== qIndex) }))}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-caption font-semibold text-danger transition-colors hover:bg-danger/10"
                >
                  <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
                  Hapus soal
                </button>
              )}
            </div>
            <textarea
              aria-label={`Teks soal ${q.id}`}
              value={q.question}
              rows={3}
              readOnly={!editable}
              onChange={(e) => updateQuestion(qIndex, (item) => ({ ...item, question: e.target.value }))}
              className={`${FIELD} resize-y text-body font-semibold`}
            />
            <div className="flex flex-col gap-2" role="radiogroup" aria-label={`Pilihan soal ${q.id}`}>
              {q.options.map((option, oIndex) => {
                const correct = q.answer === option.key;
                return (
                  <div
                    key={option.key}
                    className={`flex items-center gap-3 rounded-md border px-3 py-2 ${correct ? "border-success bg-success/10" : "border-border"}`}
                  >
                    <input
                      type="radio"
                      name={`${groupId}-${current.kind}-${qIndex}`}
                      checked={correct}
                      disabled={!editable}
                      onChange={() => updateQuestion(qIndex, (item) => ({ ...item, answer: option.key }))}
                      aria-label={`Jawaban benar soal ${q.id}: ${option.key}`}
                      title="Tandai sebagai jawaban benar"
                      className="m-0 size-5 shrink-0 accent-[var(--color-success)]"
                    />
                    <span className="w-5 shrink-0 text-body font-bold text-ink">{option.key}</span>
                    {/* grows with its text (field-sizing); rows is the estimate for browsers without it */}
                    <textarea
                      aria-label={`Pilihan ${option.key} soal ${q.id}`}
                      value={option.text}
                      rows={Math.max(1, Math.ceil(option.text.length / 45))}
                      readOnly={!editable}
                      onChange={(e) =>
                        updateQuestion(qIndex, (item) => ({
                          ...item,
                          options: item.options.map((o, i) => (i === oIndex ? { ...o, text: e.target.value } : o)),
                        }))
                      }
                      className="field-sizing-content min-w-0 flex-1 resize-none bg-transparent px-1 py-1 text-body text-ink focus:outline-none"
                    />
                    {correct && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success px-2 py-0.5 text-[11px] font-bold text-white">
                        <CheckCircle2 size={12} aria-hidden="true" />
                        Kunci
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-caption font-semibold text-muted" htmlFor={`${groupId}-exp-${qIndex}`}>
                Penjelasan jawaban
              </label>
              <textarea
                id={`${groupId}-exp-${qIndex}`}
                value={q.explanation}
                rows={2}
                readOnly={!editable}
                onChange={(e) => updateQuestion(qIndex, (item) => ({ ...item, explanation: e.target.value }))}
                className={`${FIELD} resize-y text-caption`}
              />
              <span className="text-caption text-muted">{q.source ? `Sumber: ${q.source}` : "Sumber: gabungan beberapa bagian"}</span>
            </div>
          </section>
        ))}

        {editable && (
          <Button
            variant="secondary"
            onClick={() => updateCurrent((a) => ({ ...a, questions: [...a.questions, blankQuestion()] }))}
          >
            <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
            Tambah soal
          </Button>
        )}
      </div>

      {onSave && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <p role={error ? "alert" : undefined} className={`w-full text-caption ${error ? "font-semibold text-danger" : "text-muted"}`}>
            {error ?? (approved ? "Disetujui." : isDirty ? "Ada perubahan yang belum disimpan." : "Belum disetujui.")}
          </p>
          {approved ? (
            <Button variant="secondary" onClick={() => void persist("reopen")} loading={busy === "reopen"}>
              <Undo2 size={16} strokeWidth={1.75} aria-hidden="true" />
              Buka kembali untuk edit
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => { setEdited(null); setError(null); }} disabled={!isDirty || busy !== null}>
                <RotateCcw size={16} strokeWidth={1.75} aria-hidden="true" />
                Batalkan
              </Button>
              <Button variant="secondary" onClick={() => void persist("save")} loading={busy === "save"} disabled={!isDirty || busy === "approve"}>
                <Save size={16} strokeWidth={1.75} aria-hidden="true" />
                Simpan draf
              </Button>
              <Button onClick={() => void persist("approve")} loading={busy === "approve"} disabled={busy === "save"}>
                <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
                Setujui soal
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
