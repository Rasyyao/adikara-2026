"use client";

import { AlertCircle, ArrowLeft, BookOpen, CheckCircle2, CircleDashed, CloudCheck, CloudUpload, Code2, Eye, FlaskConical, Lightbulb, Plus, Puzzle, Sparkles, Trash2, Undo2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { checkProblemAction, regenerateProblemAction, saveProblemAction, setProblemStatusAction } from "@/app/actions/problems";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import type { BlockKind, Challenge, CodeTask, CodeTest, Json, Problem, ProblemMaterial } from "@/lib/api/types";
import { BlockWorkspace } from "./block-workspace";
import { IDENTIFIER, ISSUE_TARGET, ISSUE_TEXT, KINDS, KIND_ORDER, insertNode, newBlockId, newNode, removeNode, starterFor } from "./blocks";
import { CodeEditor } from "./code-editor";
import { CodeResults } from "./code-results";
import { runCode, showValue, type RunResult } from "./code-runner";
import { FlowVisualizer, useFlowPlayer } from "./flow-player";
import { ProblemDialog } from "./problem-dialog";
import { ProblemSolver, asStudentChallenge } from "./problem-solver";

type Draft = { title: string; story: string; challenge: Challenge; material_id: string | null };
type SaveState = "saved" | "dirty" | "saving" | "error";
type Tab = "blocks" | "code";

/** The same checks as the API, so the checklist answers while the teacher types. */
function issuesOf(draft: Draft): Problem["issues"] {
  const { challenge } = draft;
  const issues: Problem["issues"] = [];
  const hasBlocks = challenge.blocks.length > 0;
  if (!draft.story.trim()) issues.push({ code: "story_missing" });
  if (!challenge.prompt.trim()) issues.push({ code: "prompt_missing" });
  if (!hasBlocks && !challenge.code) issues.push({ code: "no_mode" });
  if (hasBlocks) {
    if (challenge.solution.length === 0) issues.push({ code: "solution_missing" });
    const kinds = new Map(challenge.blocks.map((b) => [b.id, b.kind]));
    const empty = (nodes: Challenge["solution"]): boolean => nodes.some((n) => (KINDS[kinds.get(n.block)!]?.container && !n.children?.length) || empty(n.children ?? []));
    if (empty(challenge.solution)) issues.push({ code: "container_empty" });
  }
  if (challenge.code && challenge.code.tests.length === 0) issues.push({ code: "code_tests_missing" });
  return issues;
}

const NEW_CODE: CodeTask = { fn: "selesaikan", params: ["n"], starter: starterFor("selesaikan", ["n"]), reference: starterFor("selesaikan", ["n"]), tests: [] };

export function ProblemEditor({ problem, materials }: { problem: Problem; materials: ProblemMaterial[] }) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>({ title: problem.title, story: problem.story, challenge: problem.challenge, material_id: problem.material?.id ?? null });
  const [regenerating, setRegenerating] = useState<"ask" | "busy" | null>(null);
  const [status, setStatus] = useState(problem.status);
  const [tab, setTab] = useState<Tab>(problem.challenge.blocks.length === 0 && problem.challenge.code ? "code" : "blocks");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"status" | "try" | null>(null);
  const [trying, setTrying] = useState(false);
  const material = materials.find((m) => m.id === draft.material_id) ?? (problem.material && problem.material.id === draft.material_id ? { ...problem.material, ready_files: 0, pending_files: 0, problems: 0 } : null);

  const version = useRef(0);
  const savedVersion = useRef(0);
  const inflight = useRef<Promise<boolean> | null>(null);

  const issues = issuesOf(draft);
  const { challenge } = draft;
  const flow = useFlowPlayer(challenge.solution, challenge.blocks);
  const titleMissing = !draft.title.trim();

  const change = (fn: (d: Draft) => Draft) => {
    version.current += 1;
    setDraft(fn);
    setSaveState("dirty");
  };
  const changeChallenge = (fn: (c: Challenge) => Challenge) => change((d) => ({ ...d, challenge: fn(d.challenge) }));
  const changeCode = (fn: (c: CodeTask) => CodeTask) => changeChallenge((c) => (c.code ? { ...c, code: fn(c.code) } : c));

  const save = async (snapshot: Draft): Promise<boolean> => {
    if (!snapshot.title.trim()) return false;
    const at = version.current;
    setSaveState("saving");
    const run = saveProblemAction(problem.id, snapshot).then((result) => {
      if (!result.ok) {
        setSaveState("error");
        setSaveError(result.message);
        return false;
      }
      setSaveError(null);
      setStatus(result.data.status);
      savedVersion.current = Math.max(savedVersion.current, at);
      setSaveState(version.current === at ? "saved" : "dirty");
      return true;
    });
    inflight.current = run;
    return run;
  };

  // autosave a second after the last change
  useEffect(() => {
    if (saveState !== "dirty" || titleMissing) return;
    const timer = setTimeout(() => void save(draft), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, saveState, titleMissing]);

  useEffect(() => {
    if (saveState === "saved") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  /** Saves now if anything is pending; false when it could not be saved. */
  const flush = async () => {
    if (inflight.current) await inflight.current;
    if (version.current === savedVersion.current) return true;
    return save(draft);
  };

  const regenerate = async () => {
    setRegenerating("busy");
    if (!(await flush())) return setRegenerating(null);
    const result = await regenerateProblemAction(problem.id);
    setRegenerating(null);
    if (!result.ok) return toast.error(result.message);
    router.refresh();
  };

  // the student's view checks blocks against the saved answer key, so save first
  const tryIt = async () => {
    setBusy("try");
    const ok = await flush();
    setBusy(null);
    if (ok) setTrying(true);
  };

  const toggleStatus = async () => {
    setBusy("status");
    if (!(await flush())) return setBusy(null);
    const next = status === "ready" ? "draft" : "ready";
    const result = await setProblemStatusAction(problem.id, next);
    setBusy(null);
    if (!result.ok) return toast.error(result.message);
    setStatus(result.data.status);
    toast.success(next === "ready" ? "Soal siap dikirim ke kelas." : "Soal dikembalikan ke draf.");
  };

  const goTo = (target: (typeof ISSUE_TARGET)[keyof typeof ISSUE_TARGET]) => {
    if (target === "story") return document.getElementById("problem-story")?.focus();
    if (target === "prompt") return document.getElementById("challenge-prompt")?.focus();
    setTab(target);
    document.getElementById("answer-modes")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <div className="flex flex-col gap-3">
        <Link href={draft.material_id ? `/teacher/problems?materi=${draft.material_id}` : "/teacher/problems"} className="inline-flex min-h-11 w-fit items-center gap-2 text-small font-semibold text-muted hover:text-ink">
          <ArrowLeft size={20} strokeWidth={1.75} aria-hidden="true" />
          Semua soal
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <label htmlFor="problem-title" className="sr-only">
              Judul soal
            </label>
            <input
              id="problem-title"
              value={draft.title}
              maxLength={120}
              onChange={(e) => change((d) => ({ ...d, title: e.target.value }))}
              placeholder="Judul soal"
              aria-invalid={titleMissing || undefined}
              className="focus-bare w-full rounded-md border border-transparent bg-transparent px-2 py-1 font-heading text-h1 font-semibold text-ink outline-none hover:border-border focus:border-primary"
            />
            <div className="mt-1 flex flex-wrap items-center gap-3 px-2">
              <StatusChip status={status} />
              <SaveIndicator state={titleMissing ? "error" : saveState} message={titleMissing ? "Judul wajib diisi." : saveError} />
              <label className="inline-flex items-center gap-1.5 text-caption text-muted">
                <BookOpen size={14} strokeWidth={1.75} aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Materi:</span>
                <select
                  value={draft.material_id ?? ""}
                  onChange={(e) => change((d) => ({ ...d, material_id: e.target.value || null }))}
                  aria-label="Materi soal ini"
                  className="max-w-56 truncate rounded-sm border border-transparent bg-transparent py-0.5 text-caption font-semibold text-ink outline-none hover:border-border focus:border-primary"
                >
                  <option value="">Tanpa materi</option>
                  {material && !materials.some((m) => m.id === material.id) && <option value={material.id}>{material.title}</option>}
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={tryIt} loading={busy === "try"} disabled={titleMissing || issues.some((i) => i.code === "no_mode")}>
              <Eye size={20} strokeWidth={1.75} aria-hidden="true" />
              Coba sebagai siswa
            </Button>
            <Button
              variant={status === "ready" ? "secondary" : "primary"}
              onClick={toggleStatus}
              loading={busy === "status"}
              disabled={titleMissing || (status === "draft" && issues.length > 0)}
              title={status === "draft" && issues.length > 0 ? "Lengkapi dulu daftar di samping" : undefined}
            >
              {status === "ready" ? <Undo2 size={20} strokeWidth={1.75} aria-hidden="true" /> : <CheckCircle2 size={20} strokeWidth={1.75} aria-hidden="true" />}
              {status === "ready" ? "Kembalikan ke draf" : "Tandai siap"}
            </Button>
          </div>
        </div>
      </div>

      {problem.origin === "ai" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary-tint px-4 py-3">
          <p className="flex items-start gap-2 text-small text-ink">
            <Sparkles size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <span>
              Dibuat AI{problem.material ? ` dari materi “${problem.material.title}”` : ""}
              {problem.ai_focus ? ` dengan fokus ${problem.ai_focus}` : ""}. Periksa cerita, kunci blok, dan kasus uji JavaScript, lalu coba sebagai siswa sebelum menandai siap.
            </span>
          </p>
          {draft.material_id && (
            <Button variant="secondary" onClick={() => setRegenerating("ask")} loading={regenerating === "busy"}>
              <Sparkles size={18} strokeWidth={1.75} aria-hidden="true" />
              Buat ulang dengan AI
            </Button>
          )}
        </div>
      )}
      <ConfirmDialog open={regenerating === "ask"} title="Buat ulang dengan AI?" confirmLabel="Buat ulang" onConfirm={regenerate} onCancel={() => setRegenerating(null)}>
        Cerita dan tantangan soal ini akan diganti dengan susunan baru dari AI. Perubahan yang Anda buat akan hilang.
      </ConfirmDialog>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* story and task */}
          <section className="grid gap-4 rounded-lg bg-surface p-4 sm:p-6">
            <div>
              <label htmlFor="problem-story" className="text-h3 font-semibold text-ink">
                Cerita masalah
              </label>
              <p className="mt-0.5 text-small text-muted">Masalah sehari-hari yang dibaca siswa. Sebutkan angka dan aturan yang dibutuhkan.</p>
              <textarea
                id="problem-story"
                value={draft.story}
                maxLength={4000}
                rows={4}
                onChange={(e) => change((d) => ({ ...d, story: e.target.value }))}
                placeholder="Contoh: Robot harus menyiram tanaman di setiap sudut taman yang berbentuk persegi…"
                className="mt-3 w-full resize-y rounded-md border border-border bg-bg px-3 py-2 text-body text-ink outline-none placeholder:text-muted focus:border-primary"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div>
                <label htmlFor="challenge-prompt" className="mb-1 block text-small font-semibold text-ink">
                  Tugas untuk siswa
                </label>
                <textarea
                  id="challenge-prompt"
                  rows={2}
                  maxLength={500}
                  value={challenge.prompt}
                  onChange={(e) => changeChallenge((c) => ({ ...c, prompt: e.target.value }))}
                  className="w-full resize-y rounded-md border border-border bg-bg px-3 py-2 text-body text-ink outline-none focus:border-primary"
                />
              </div>
              <div>
                <label htmlFor="challenge-hint" className="mb-1 flex items-center gap-1.5 text-small font-semibold text-ink">
                  <Lightbulb size={16} strokeWidth={1.75} className="text-warning" aria-hidden="true" />
                  Petunjuk <span className="font-normal text-muted">(opsional)</span>
                </label>
                <textarea
                  id="challenge-hint"
                  rows={2}
                  maxLength={500}
                  value={challenge.hint}
                  onChange={(e) => changeChallenge((c) => ({ ...c, hint: e.target.value }))}
                  placeholder="Muncul saat siswa menekan Petunjuk"
                  className="w-full resize-y rounded-md border border-border bg-bg px-3 py-2 text-body text-ink outline-none placeholder:text-muted focus:border-primary"
                />
              </div>
            </div>
          </section>

          {/* the two ways to answer */}
          <section id="answer-modes" aria-label="Cara siswa menjawab" className="flex scroll-mt-6 flex-col gap-4 rounded-lg bg-surface p-4 sm:p-6">
            <div>
              <h2 className="text-h3 font-semibold text-ink">Cara siswa menjawab</h2>
              <p className="mt-0.5 text-small text-muted">Siswa boleh memilih: menyusun blok atau menulis JavaScript. Isi salah satu, atau keduanya.</p>
            </div>
            <div role="tablist" aria-label="Cara menjawab" className="grid gap-2 sm:grid-cols-2">
              <ModeTab active={tab === "blocks"} onClick={() => setTab("blocks")} Icon={Puzzle} title="Susun blok" note={challenge.blocks.length ? `${challenge.blocks.length} blok · ${challenge.solution.length ? "kunci tersusun" : "kunci belum disusun"}` : "Belum dipakai"} on={challenge.blocks.length > 0} />
              <ModeTab active={tab === "code"} onClick={() => setTab("code")} Icon={Code2} title="Tulis JavaScript" note={challenge.code ? `${challenge.code.fn}() · ${challenge.code.tests.length} kasus uji` : "Belum dipakai"} on={challenge.code !== null} />
            </div>

            {tab === "blocks" ? (
              <BlocksPanel key="blocks" challenge={challenge} changeChallenge={changeChallenge} flow={flow} />
            ) : (
              <CodePanel key="code" code={challenge.code} enable={() => changeChallenge((c) => ({ ...c, code: NEW_CODE }))} disable={() => changeChallenge((c) => ({ ...c, code: null }))} changeCode={changeCode} />
            )}
          </section>
        </div>

        {/* checklist */}
        <aside aria-label="Kelengkapan soal" className="flex flex-col gap-4 xl:sticky xl:top-6">
          <section className="rounded-lg bg-surface p-4">
            <h2 className="text-h3 font-semibold text-ink">Kelengkapan</h2>
            {issues.length === 0 ? (
              <p className="mt-2 flex items-start gap-2 text-small text-success">
                <CheckCircle2 size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
                Soal lengkap. {status === "ready" ? "Siap dikirim ke kelas dari sesi langsung." : "Coba sebagai siswa, lalu tandai siap."}
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {issues.map((issue) => (
                  <li key={issue.code}>
                    <button type="button" onClick={() => goTo(ISSUE_TARGET[issue.code])} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-small text-ink hover:bg-bg">
                      <CircleDashed size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                      {ISSUE_TEXT[issue.code]}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-lg bg-surface p-4">
            <h2 className="text-h3 font-semibold text-ink">Cara kerja</h2>
            <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-small text-muted">
              <li>Blok: tulis blok, susun kunci jawabannya. Blok yang tidak dipakai menjadi pengecoh.</li>
              <li>JavaScript: tentukan fungsi dan kasus ujinya. Kunci jawaban Anda harus lolos semua kasus uji.</li>
              <li>Tandai siap, lalu kirim ke kelas dari sesi langsung. Soal muncul sebagai popup di layar setiap siswa.</li>
            </ol>
          </section>
        </aside>
      </div>

      {trying && (
        <ProblemDialog eyebrow="Pratinjau siswa · jawaban tidak disimpan" title={draft.title} onClose={() => setTrying(false)}>
          <ProblemSolver seed={`${problem.id}:preview`} title={draft.title} story={draft.story} challenge={asStudentChallenge(challenge)} checkBlocks={(tree) => checkProblemAction(problem.id, tree)} />
        </ProblemDialog>
      )}
    </div>
  );
}

function ModeTab({ active, onClick, Icon, title, note, on }: { active: boolean; onClick: () => void; Icon: typeof Puzzle; title: string; note: string; on: boolean }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex min-h-16 items-center gap-3 rounded-lg border-2 px-3 py-2 text-left transition-colors ${active ? "border-primary bg-primary-tint" : "border-border hover:border-primary/40"}`}
    >
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${on ? "bg-primary text-white" : "bg-bg text-muted"}`}>
        <Icon size={20} strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-small font-semibold text-ink">{title}</span>
        <span className={`block truncate text-caption ${on ? "text-success" : "text-muted"}`}>{note}</span>
      </span>
    </button>
  );
}

function BlocksPanel({ challenge, changeChallenge, flow }: { challenge: Challenge; changeChallenge: (fn: (c: Challenge) => Challenge) => void; flow: ReturnType<typeof useFlowPlayer> }) {
  const [kind, setKind] = useState<BlockKind>("action");
  const [text, setText] = useState("");

  const addBlock = (toAnswer: boolean) => {
    const value = text.trim();
    if (!value) return;
    const block = { id: newBlockId(), kind, text: value.slice(0, 120) };
    changeChallenge((c) => ({ ...c, blocks: [...c.blocks, block], solution: toAnswer ? insertNode(c.solution, null, c.solution.length, newNode(block)) : c.solution }));
    setText("");
  };

  return (
    <div role="tabpanel" aria-label="Susun blok" className="pstage-enter flex flex-col gap-4">
      <label className="flex w-fit cursor-pointer items-start gap-3 rounded-md border border-border bg-bg px-3 py-2.5">
        <input type="checkbox" checked={challenge.ordered} onChange={(e) => changeChallenge((c) => ({ ...c, ordered: e.target.checked }))} className="mt-1 size-4 accent-[var(--primary)]" />
        <span>
          <span className="block text-small font-semibold text-ink">Urutan blok penting</span>
          <span className="block text-caption text-muted">{challenge.ordered ? "Jawaban harus urut seperti kunci." : "Cukup memilih blok yang benar, urutan bebas."}</span>
        </span>
      </label>

      <form
        className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          addBlock(true);
        }}
      >
        <fieldset>
          <legend className="mb-2 text-small font-semibold text-ink">Tambah blok</legend>
          <div className="flex flex-wrap gap-2">
            {KIND_ORDER.map((k) => (
              <label key={k} title={KINDS[k].hint} className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-small font-medium transition-colors ${kind === k ? "border-primary bg-primary-tint text-ink" : "border-border text-muted hover:text-ink"}`}>
                <input type="radio" name="block-kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
                <span className="size-3 rounded-sm" style={{ background: KINDS[k].fill }} aria-hidden="true" />
                {KINDS[k].label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="block-text" className="sr-only">
            Teks blok
          </label>
          <input
            id="block-text"
            value={text}
            maxLength={120}
            onChange={(e) => setText(e.target.value)}
            placeholder={KINDS[kind].container ? "Contoh: ulangi 4 kali" : kind === "event" ? "Contoh: ketika mulai" : "Contoh: maju 1 kotak"}
            className="h-11 min-w-0 flex-1 rounded-md border border-border bg-bg px-3 text-body text-ink outline-none placeholder:text-muted focus:border-primary"
          />
          <Button type="submit" disabled={!text.trim()}>
            <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
            Ke jawaban
          </Button>
          <Button type="button" variant="secondary" disabled={!text.trim()} onClick={() => addBlock(false)}>
            Jadi pengecoh
          </Button>
        </div>
        <p className="text-caption text-muted">Tekan Enter untuk menambah ke jawaban. Blok yang sama boleh dibuat lebih dari sekali, misalnya tiga blok &quot;maju 1 kotak&quot;.</p>
      </form>

      <BlockWorkspace
        flow={flow.view}
        mode="author"
        blocks={challenge.blocks}
        tree={challenge.solution}
        onChange={(solution) => changeChallenge((c) => ({ ...c, solution }))}
        onEditBlock={(id, value) => changeChallenge((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === id ? { ...b, text: value } : b)) }))}
        onDeleteBlock={(id) => changeChallenge((c) => ({ ...c, blocks: c.blocks.filter((b) => b.id !== id), solution: removeNode(c.solution, id) }))}
      />
      {challenge.ordered && challenge.solution.length > 0 && (
        <FlowVisualizer tree={challenge.solution} blocks={challenge.blocks} player={flow} label="Jalankan kunci jawaban" />
      )}
    </div>
  );
}

/** A test's arguments as typed: JSON values separated by commas, e.g. `4, 3` or `[1, 2], "a"`. */
const argsText = (args: Json[]) => args.map((a) => showValue(a)).join(", ");

function parseArgs(text: string): Json[] | null {
  try {
    const value = JSON.parse(`[${text}]`) as unknown;
    return Array.isArray(value) ? (value as Json[]) : null;
  } catch {
    return null;
  }
}

/** An expected value: JSON, or plain text when it is not JSON (so `tuntas` means "tuntas"). */
function parseExpected(text: string): Json {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as Json;
  } catch {
    return trimmed;
  }
}

function TestRow({ index, test, params, onChange, onRemove }: { index: number; test: CodeTest; params: string[]; onChange: (t: CodeTest) => void; onRemove: () => void }) {
  const [args, setArgs] = useState(argsText(test.args));
  const [expected, setExpected] = useState(showValue(test.expected));
  const parsed = parseArgs(args);
  const wrongCount = parsed !== null && parsed.length !== params.length;
  return (
    <li className="grid items-start gap-2 rounded-md border border-border bg-bg p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <label className="flex flex-col gap-1">
        <span className="text-caption font-semibold text-muted">
          Kasus {index + 1}: argumen ({params.join(", ") || "tanpa parameter"})
        </span>
        <input
          value={args}
          onChange={(e) => {
            setArgs(e.target.value);
            const next = parseArgs(e.target.value);
            if (next) onChange({ ...test, args: next });
          }}
          aria-invalid={parsed === null || wrongCount || undefined}
          placeholder="4, 3"
          className="h-10 rounded-md border border-border bg-surface px-2 font-mono text-small text-ink outline-none focus:border-primary aria-[invalid=true]:border-danger"
        />
        {(parsed === null || wrongCount) && <span className="text-caption text-danger">{parsed === null ? 'Tulis nilai dipisah koma. Teks pakai tanda kutip: "abc".' : `Butuh ${params.length} argumen.`}</span>}
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-caption font-semibold text-muted">Hasil yang benar (return)</span>
        <input
          value={expected}
          onChange={(e) => {
            setExpected(e.target.value);
            onChange({ ...test, expected: parseExpected(e.target.value) });
          }}
          placeholder="12"
          className="h-10 rounded-md border border-border bg-surface px-2 font-mono text-small text-ink outline-none focus:border-primary"
        />
      </label>
      <button type="button" onClick={onRemove} aria-label={`Hapus kasus uji ${index + 1}`} className="flex size-10 items-center justify-center self-end rounded-md text-muted hover:bg-danger/10 hover:text-danger">
        <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </li>
  );
}

function CodePanel({ code, enable, disable, changeCode }: { code: CodeTask | null; enable: () => void; disable: () => void; changeCode: (fn: (c: CodeTask) => CodeTask) => void }) {
  const [run, setRun] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [paramsText, setParamsText] = useState(code?.params.join(", ") ?? "");
  // rows are keyed so that removing one does not hand its typed text to the next
  const [keys, setKeys] = useState(() => (code?.tests ?? []).map((_, i) => i));
  const nextKey = useRef(keys.length);

  if (!code) {
    return (
      <div role="tabpanel" aria-label="Tulis JavaScript" className="pstage-enter flex flex-col items-start gap-3 rounded-lg border border-dashed border-border p-5">
        <p className="text-body font-semibold text-ink">Biarkan siswa menjawab dengan JavaScript juga</p>
        <p className="max-w-[65ch] text-small text-muted">
          Siswa menulis satu fungsi yang mengembalikan hasil, lalu kodenya diuji dengan kasus uji Anda. Cocok untuk siswa yang sudah lancar menyusun blok dan ingin tantangan lebih.
        </p>
        <Button onClick={enable}>
          <Code2 size={18} strokeWidth={1.75} aria-hidden="true" />
          Aktifkan JavaScript
        </Button>
      </div>
    );
  }

  const fnValid = IDENTIFIER.test(code.fn);
  const params = paramsText
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const paramsValid = params.length <= 6 && params.every((p) => IDENTIFIER.test(p)) && new Set(params).size === params.length;
  const starterIsBlank = code.starter.trim() === starterFor(code.fn, code.params).trim();

  const rename = (fn: string, nextParams: string[]) =>
    changeCode((c) => ({
      ...c,
      fn,
      params: nextParams,
      // a starter or key the teacher has not written yet follows the name and parameters
      starter: c.starter.trim() === starterFor(c.fn, c.params).trim() ? starterFor(fn, nextParams) : c.starter,
      reference: c.reference.trim() === starterFor(c.fn, c.params).trim() ? starterFor(fn, nextParams) : c.reference,
    }));

  const test = async () => {
    setRunning(true);
    setRun(await runCode(code.reference, code.fn, code.tests));
    setRunning(false);
  };

  /** Fills each test's expected value with what the key returns: the teacher only writes the arguments. */
  const fillExpected = async () => {
    setRunning(true);
    const result = await runCode(code.reference, code.fn, code.tests);
    setRunning(false);
    if (result.error) return setRun(result);
    changeCode((c) => ({
      ...c,
      tests: c.tests.map((t, i) => {
        const actual = result.results[i]?.actual;
        if (!actual || actual === "undefined" || result.results[i].error) return t;
        try {
          return { ...t, expected: JSON.parse(actual) as Json };
        } catch {
          return t;
        }
      }),
    }));
    // the rows show the new values
    setKeys((k) => k.map(() => nextKey.current++));
    setRun(null);
  };

  return (
    <div role="tabpanel" aria-label="Tulis JavaScript" className="pstage-enter flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-small font-semibold text-ink">Nama fungsi</span>
          <input
            value={code.fn}
            maxLength={40}
            onChange={(e) => rename(e.target.value.trim(), code.params)}
            aria-invalid={!fnValid || undefined}
            className="h-11 rounded-md border border-border bg-bg px-3 font-mono text-body text-ink outline-none focus:border-primary aria-[invalid=true]:border-danger"
          />
          {!fnValid && <span className="text-caption text-danger">Huruf, angka, atau _, tidak diawali angka. Contoh: hitungLangkah</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-small font-semibold text-ink">Parameter (pisahkan dengan koma)</span>
          <input
            value={paramsText}
            onChange={(e) => {
              setParamsText(e.target.value);
              const next = e.target.value
                .split(",")
                .map((p) => p.trim())
                .filter(Boolean);
              if (next.length <= 6 && next.every((p) => IDENTIFIER.test(p)) && new Set(next).size === next.length) rename(code.fn, next);
            }}
            aria-invalid={!paramsValid || undefined}
            placeholder="sisi, panjang"
            className="h-11 rounded-md border border-border bg-bg px-3 font-mono text-body text-ink outline-none focus:border-primary aria-[invalid=true]:border-danger"
          />
          {!paramsValid && <span className="text-caption text-danger">Nama parameter tidak valid atau kembar (maksimal 6).</span>}
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-small font-semibold text-ink">Kode awal untuk siswa</span>
            {!starterIsBlank && (
              <button type="button" onClick={() => changeCode((c) => ({ ...c, starter: starterFor(c.fn, c.params) }))} className="text-caption font-semibold text-primary hover:underline">
                Kosongkan
              </button>
            )}
          </div>
          <CodeEditor id="code-starter" label="Kode awal untuk siswa" value={code.starter} onChange={(starter) => changeCode((c) => ({ ...c, starter }))} minRows={7} maxRows={16} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-small font-semibold text-ink">
            Kunci jawaban <span className="font-normal text-muted">(tidak terlihat siswa)</span>
          </span>
          <CodeEditor id="code-reference" label="Kunci jawaban JavaScript" value={code.reference} onChange={(reference) => changeCode((c) => ({ ...c, reference }))} minRows={7} maxRows={16} onRun={test} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-small font-semibold text-ink">Kasus uji ({code.tests.length})</h3>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={fillExpected} disabled={code.tests.length === 0 || running} title="Jalankan kunci jawaban dan isi kolom hasil dengan keluarannya">
              <Wand2 size={18} strokeWidth={1.75} aria-hidden="true" />
              Isi hasil dari kunci
            </Button>
            <Button
              variant="secondary"
              disabled={code.tests.length >= 20}
              onClick={() => {
                setKeys((k) => [...k, nextKey.current++]);
                changeCode((c) => ({ ...c, tests: [...c.tests, { args: c.params.map(() => 0), expected: 0 }] }));
              }}
            >
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              Tambah kasus uji
            </Button>
          </div>
        </div>
        {code.tests.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-small text-muted">Belum ada kasus uji. Tambahkan minimal satu: argumen dan hasil yang benar.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {code.tests.map((t, i) => (
              <TestRow
                key={keys[i] ?? i}
                index={i}
                test={t}
                params={code.params}
                onChange={(next) => changeCode((c) => ({ ...c, tests: c.tests.map((x, j) => (j === i ? next : x)) }))}
                onRemove={() => {
                  setKeys((k) => k.filter((_, j) => j !== i));
                  changeCode((c) => ({ ...c, tests: c.tests.filter((_, j) => j !== i) }));
                }}
              />
            ))}
          </ol>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-small text-muted">Pastikan kunci jawaban lolos semua kasus uji sebelum menandai siap.</p>
          <Button onClick={test} loading={running} disabled={code.tests.length === 0}>
            <FlaskConical size={18} strokeWidth={1.75} aria-hidden="true" />
            Uji kunci jawaban
          </Button>
        </div>
        {run && <CodeResults fn={code.fn} tests={code.tests} run={run} />}
      </div>

      <button type="button" onClick={disable} className="w-fit text-caption font-semibold text-danger hover:underline">
        Matikan JavaScript untuk soal ini
      </button>
    </div>
  );
}

function StatusChip({ status }: { status: Problem["status"] }) {
  return status === "ready" ? (
    <span className="inline-flex items-center gap-1 rounded-sm bg-success/10 px-2 py-0.5 text-caption font-semibold text-success">
      <CheckCircle2 size={14} strokeWidth={2} aria-hidden="true" />
      Siap dipakai
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-sm bg-bg px-2 py-0.5 text-caption font-semibold text-muted">
      <CircleDashed size={14} strokeWidth={2} aria-hidden="true" />
      Draf
    </span>
  );
}

function SaveIndicator({ state, message }: { state: SaveState; message: string | null }) {
  const view = {
    saved: { Icon: CloudCheck, text: "Tersimpan", tone: "text-muted" },
    dirty: { Icon: CloudUpload, text: "Belum disimpan…", tone: "text-muted" },
    saving: { Icon: CloudUpload, text: "Menyimpan…", tone: "text-muted" },
    error: { Icon: AlertCircle, text: message ?? "Gagal menyimpan.", tone: "text-danger" },
  }[state];
  return (
    <span role="status" className={`inline-flex items-center gap-1 text-caption ${view.tone}`}>
      <view.Icon size={14} strokeWidth={1.75} aria-hidden="true" />
      {view.text}
    </span>
  );
}
