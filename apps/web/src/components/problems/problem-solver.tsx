"use client";

import { ArrowRight, CheckCircle2, Code2, Lightbulb, Lock, Play, Puzzle, RotateCcw, Trophy, Wand2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import type { ActionResult } from "@/app/actions/sessions";
import { Button } from "@/components/ui/button";
import type { Challenge, PuzzleGrade, PuzzleNode, SolvedWith, StudentChallenge } from "@/lib/api/types";
import { BlockWorkspace } from "./block-workspace";
import { countNodes, ioSpecOf, shuffled, treeAsComments, type IoSpec } from "./blocks";
import { CodeEditor } from "./code-editor";
import { CodeResults } from "./code-results";
import { runCode, type RunResult } from "./code-runner";
import { Confetti, FlowVisualizer, useFlowPlayer } from "./flow-player";

type Mode = SolvedWith;

/** The challenge as a student gets it, from the teacher's full one (for "Coba sebagai siswa"). */
export function asStudentChallenge(challenge: Challenge): StudentChallenge {
  return {
    prompt: challenge.prompt,
    hint: challenge.hint,
    ordered: challenge.ordered,
    blocks: challenge.blocks,
    answer_blocks: countNodes(challenge.solution),
    code: challenge.code && { fn: challenge.code.fn, params: challenge.code.params, starter: challenge.code.starter, tests: challenge.code.tests },
  };
}

function counts(grade: PuzzleGrade) {
  const values = Object.values(grade.blocks);
  return {
    right: values.filter((v) => v === "right").length,
    misplaced: values.filter((v) => v === "misplaced").length,
    extra: values.filter((v) => v === "extra").length,
    missing: grade.missing,
  };
}

/** Wrong answer: what to fix, as chips the student can read at a glance. */
function Feedback({ grade }: { grade: PuzzleGrade }) {
  const c = counts(grade);
  const chips = [
    { show: c.right > 0, text: `${c.right} sudah tepat`, tone: "bg-success/10 text-success", mark: "✓" },
    { show: c.misplaced > 0, text: `${c.misplaced} perlu dipindah`, tone: "bg-warning/10 text-warning", mark: "↕" },
    { show: c.extra > 0, text: `${c.extra} tidak diperlukan`, tone: "bg-danger/10 text-danger", mark: "✕" },
    { show: c.missing > 0, text: `masih kurang ${c.missing} blok`, tone: "bg-bg text-ink", mark: "+" },
  ].filter((chip) => chip.show);
  return (
    <div className="pstage-enter flex flex-col gap-2 rounded-lg border border-danger/20 bg-danger/5 px-4 py-3">
      <p className="flex items-center gap-2 text-small font-semibold text-ink">
        <XCircle size={18} strokeWidth={2} className="shrink-0 text-danger" aria-hidden="true" />
        Hampir! Periksa lagi blok yang ditandai.
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <li key={chip.text} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-semibold ${chip.tone}`}>
            <span aria-hidden="true">{chip.mark}</span>
            {chip.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

const MODE_LABEL: Record<Mode, string> = { blocks: "Blok", code: "JavaScript" };

function Solved({ other, onOther, tries }: { other: Mode | null; onOther: () => void; tries: number }) {
  return (
    <div className="ppop relative flex flex-wrap items-center justify-between gap-3 overflow-visible rounded-lg border border-success/30 bg-success/10 px-4 py-3">
      <Confetti />
      <p className="flex items-center gap-2 text-body font-semibold text-success">
        <Trophy size={22} strokeWidth={2} className="ppop shrink-0" aria-hidden="true" />
        {tries <= 1 ? "Sempurna! Masalah terpecahkan pada percobaan pertama." : `Berhasil! Masalah terpecahkan setelah ${tries} kali mencoba.`}
      </p>
      {other && (
        <Button variant="secondary" onClick={onOther}>
          Tantang diri: coba dengan {MODE_LABEL[other]}
          <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

/** What goes in and what must come out, with worked examples: the contract the program has to meet. */
function IoCard({ io }: { io: IoSpec }) {
  if (io.examples.length === 0) return null;
  const inputs = io.params.length ? io.params : ["masukan"];
  return (
    <section aria-label="Masukan dan keluaran" className="rounded-lg border border-border bg-surface p-4">
      <p className="text-caption font-semibold uppercase tracking-wide text-primary">Masukan → Keluaran</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-small text-ink">
        <span className="text-muted">Program menerima</span>
        {inputs.map((p) => (
          <code key={p} className="rounded-md bg-[#2F6FD6]/10 px-1.5 py-0.5 font-mono text-caption font-semibold text-[#2257AD]">
            {p}
          </code>
        ))}
        <span className="text-muted">lalu memberi</span>
        <code className="rounded-md bg-success/10 px-1.5 py-0.5 font-mono text-caption font-semibold text-success">hasil</code>
      </div>
      <ul className="mt-3 flex flex-col gap-1.5">
        {io.examples.map((ex) => (
          <li key={ex.id} className="flex items-center gap-2 rounded-md border border-border bg-bg px-2.5 py-1.5 font-mono text-caption">
            <span className="flex min-w-0 flex-1 flex-wrap gap-x-2 gap-y-0.5 text-ink">
              {inputs.map((p, i) => (
                <span key={p} className="whitespace-nowrap">
                  <span className="text-muted">{p} =</span> <b className="font-semibold">{ex.inputs[i]}</b>
                </span>
              ))}
            </span>
            <ArrowRight size={14} strokeWidth={2.25} className="shrink-0 text-muted" aria-label="menghasilkan" />
            <b className="shrink-0 rounded bg-success/10 px-1.5 py-0.5 font-semibold text-success">{ex.output}</b>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted">Programmu harus benar untuk semua masukan, bukan hanya contoh di atas.</p>
    </section>
  );
}

export interface SolverProps {
  /** Seeds the shuffle of the blocks, so a reload shows the same order. */
  seed: string;
  title: string;
  story: string;
  challenge: StudentChallenge;
  /** Where the student left off. */
  initial?: { tree?: PuzzleNode[] | null; code?: string | null; solved?: Mode[] };
  checkBlocks: (tree: PuzzleNode[]) => Promise<ActionResult<{ data: PuzzleGrade }>>;
  /** After each run of the code (it runs in this browser); the session records it. */
  onCodeRun?: (code: string, passed: number, total: number) => void | Promise<unknown>;
  /** The teacher closed it: the student can look, not answer. */
  closed?: boolean;
}

/**
 * One problem, solved either way the teacher allowed: arranging the blocks (checked by the API) or writing the
 * JavaScript function (run here against the tests). The story and instruction stay beside the workspace.
 */
export function ProblemSolver({ seed, title, story, challenge, initial, checkBlocks, onCodeRun, closed }: SolverProps) {
  const modes: Mode[] = [...(challenge.blocks.length ? (["blocks"] as const) : []), ...(challenge.code ? (["code"] as const) : [])];
  const [mode, setMode] = useState<Mode>(modes[0] ?? "blocks");
  const [solved, setSolved] = useState<Set<Mode>>(() => new Set(initial?.solved ?? []));
  const [hint, setHint] = useState(false);

  // blocks
  const [tree, setTree] = useState<PuzzleNode[]>(initial?.tree ?? []);
  const [grade, setGrade] = useState<PuzzleGrade | null>(null);
  const [checks, setChecks] = useState(0);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trayOrder = useMemo(() => shuffled(challenge.blocks.map((b) => b.id), seed), [challenge.blocks, seed]);
  const flow = useFlowPlayer(tree, challenge.blocks);
  const byId = useMemo(() => new Map(challenge.blocks.map((b) => [b.id, b])), [challenge.blocks]);
  const io = useMemo(() => ioSpecOf(challenge), [challenge]);

  // code
  const [code, setCode] = useState(initial?.code ?? challenge.code?.starter ?? "");
  const [run, setRun] = useState<RunResult | null>(null);
  const [runs, setRuns] = useState(0);
  const [running, setRunning] = useState(false);

  const done = solved.has(mode);
  const other = modes.find((m) => m !== mode && !solved.has(m)) ?? null;
  const markSolved = (m: Mode) => setSolved((s) => new Set(s).add(m));

  const check = async () => {
    setChecking(true);
    setError(null);
    const result = await checkBlocks(tree);
    setChecking(false);
    if (!result.ok) return setError(result.message);
    setGrade(result.data);
    setChecks((n) => n + 1);
    if (result.data.correct) markSolved("blocks");
  };

  const runTests = async () => {
    if (!challenge.code) return;
    setRunning(true);
    const result = await runCode(code, challenge.code.fn, challenge.code.tests);
    setRunning(false);
    setRun(result);
    setRuns((n) => n + 1);
    const passed = result.error ? 0 : result.results.filter((r) => r.pass).length;
    const total = challenge.code.tests.length;
    if (passed === total) markSolved("code");
    void onCodeRun?.(code, passed, total);
  };

  /** Puts the arranged blocks into the function as comments: a plan to write the code from. */
  const blocksIntoCode = () => {
    const comments = treeAsComments(tree, byId);
    const open = code.indexOf("{\n");
    setCode(open < 0 ? `${comments}\n${code}` : `${code.slice(0, open + 2)}${comments}\n${code.slice(open + 2)}`);
  };

  return (
    <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
      {/* the problem, beside the work */}
      <aside className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-0 lg:self-start">
        <section className="relative overflow-hidden rounded-lg border border-border bg-surface p-4">
          <span className="absolute inset-y-0 left-0 w-1.5 bg-[linear-gradient(180deg,#7445CC,#2F6FD6)]" aria-hidden="true" />
          <p className="text-caption font-semibold uppercase tracking-wide text-primary">Masalah</p>
          <h2 className="text-h3 font-semibold text-ink">{title}</h2>
          <p className="mt-2 whitespace-pre-line text-small leading-relaxed text-ink">{story || "Cerita belum diisi."}</p>
        </section>

        <IoCard io={io} />

        <section className="rounded-lg border border-primary/30 bg-primary-tint p-4">
          <p className="text-caption font-semibold uppercase tracking-wide text-primary">Tugasmu</p>
          <p className="mt-1 text-small font-semibold leading-relaxed text-ink">{challenge.prompt}</p>
          {challenge.hint.trim() && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setHint((h) => !h)}
                aria-expanded={hint}
                className="inline-flex items-center gap-1.5 text-caption font-semibold text-primary hover:underline"
              >
                <Lightbulb size={15} strokeWidth={2} className="shrink-0 text-warning" aria-hidden="true" />
                {hint ? "Sembunyikan petunjuk" : "Butuh petunjuk?"}
              </button>
              {hint && <p className="pstage-enter mt-1.5 rounded-md border border-warning/40 bg-surface px-3 py-2 text-small text-ink">{challenge.hint}</p>}
            </div>
          )}
        </section>

        {solved.size > 0 && (
          <ul aria-label="Sudah terpecahkan" className="flex flex-wrap gap-1.5">
            {[...solved].map((m) => (
              <li key={m} className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-caption font-semibold text-success">
                <CheckCircle2 size={14} strokeWidth={2.25} aria-hidden="true" />
                Selesai dengan {MODE_LABEL[m]}
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section aria-label="Jawabanmu" className="flex min-w-0 flex-col gap-3">
        {modes.length > 1 && (
          <div role="tablist" aria-label="Cara menjawab" className="inline-flex w-fit gap-1 rounded-lg border border-border bg-bg p-1">
            {modes.map((m) => {
              const Icon = m === "blocks" ? Puzzle : Code2;
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-md px-4 text-small font-semibold transition-colors ${mode === m ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                >
                  <Icon size={17} strokeWidth={2} aria-hidden="true" />
                  {m === "blocks" ? "Susun blok" : "Tulis JavaScript"}
                  {solved.has(m) && <CheckCircle2 size={15} strokeWidth={2.25} className="text-success" aria-label="selesai" />}
                </button>
              );
            })}
          </div>
        )}

        {closed && (
          <p className="flex items-center gap-2 rounded-md border border-border bg-bg px-3 py-2 text-small text-muted">
            <Lock size={16} strokeWidth={2} aria-hidden="true" />
            Guru sudah menutup soal ini. Kamu masih bisa melihatnya, tetapi jawaban tidak dicatat lagi.
          </p>
        )}

        {mode === "blocks" ? (
          <div key="blocks" className="pstage-enter flex flex-col gap-3">
            <ol className="grid gap-2 text-caption text-ink sm:grid-cols-3">
              {(challenge.ordered
                ? ["Seret atau ketuk blok dari kiri ke area susun.", "Taruh blok di dalam “jika”/“ulangi” agar menjorok.", `Pakai ${challenge.answer_blocks} blok — sisanya pengecoh.`]
                : ["Seret atau ketuk blok yang benar ke area susun.", "Urutannya bebas.", `Pakai ${challenge.answer_blocks} blok — sisanya pengecoh.`]
              ).map((text, i) => (
                <li key={text} className="flex items-start gap-2 rounded-md border border-border bg-surface px-2.5 py-2">
                  <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">{i + 1}</span>
                  {text}
                </li>
              ))}
            </ol>
            <BlockWorkspace
              mode="solve"
              blocks={challenge.blocks}
              tree={tree}
              trayOrder={trayOrder}
              feedback={grade?.blocks}
              disabled={done || closed}
              flow={flow.view}
              onChange={(next) => {
                setTree(next);
                setGrade(null);
              }}
            />
            {error && (
              <p role="alert" className="text-small text-danger">
                {error}
              </p>
            )}
            <div aria-live="polite">
              {done ? <Solved other={other} onOther={() => other && setMode(other)} tries={checks || 1} /> : grade && !grade.correct ? <Feedback key={checks} grade={grade} /> : null}
            </div>
            {!done && !closed && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-caption text-muted">
                  <span className={countNodes(tree) === challenge.answer_blocks ? "font-semibold text-success" : ""}>
                    {countNodes(tree)} / {challenge.answer_blocks} blok disusun
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setTree([]);
                      setGrade(null);
                    }}
                    disabled={tree.length === 0 || checking}
                  >
                    <RotateCcw size={18} strokeWidth={1.75} aria-hidden="true" />
                    Ulangi
                  </Button>
                  <Button onClick={check} loading={checking} disabled={tree.length === 0}>
                    <CheckCircle2 size={18} strokeWidth={1.75} aria-hidden="true" />
                    Periksa jawaban
                  </Button>
                </div>
              </div>
            )}
            {challenge.ordered && (
              <FlowVisualizer tree={tree} blocks={challenge.blocks} player={flow} label="Jalankan" />
            )}
          </div>
        ) : (
          challenge.code && (
            <div key="code" className="pstage-enter flex flex-col gap-3">
              <p className="text-caption text-muted">
                Lengkapi fungsi <code className="rounded bg-bg px-1 font-mono text-ink">{challenge.code.fn}({challenge.code.params.join(", ")})</code> agar mengembalikan (<code className="font-mono">return</code>) hasil yang benar untuk setiap kasus uji. Kodemu dijalankan di peramban ini.
              </p>
              <CodeEditor id="solver-code" label={`Kode JavaScript untuk ${challenge.code.fn}`} value={code} onChange={setCode} readOnly={closed} onRun={closed ? undefined : runTests} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {modes.includes("blocks") && tree.length > 0 && !closed && (
                    <Button variant="ghost" onClick={blocksIntoCode} title="Tulis susunan blokmu sebagai komentar di dalam fungsi">
                      <Wand2 size={18} strokeWidth={1.75} aria-hidden="true" />
                      Blokku jadi komentar
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setCode(challenge.code!.starter)} disabled={closed || code === challenge.code.starter}>
                    <RotateCcw size={18} strokeWidth={1.75} aria-hidden="true" />
                    Kode awal
                  </Button>
                </div>
                <Button onClick={runTests} loading={running} disabled={closed || !code.trim()}>
                  <Play size={18} strokeWidth={1.75} aria-hidden="true" />
                  Jalankan tes
                </Button>
              </div>
              <CodeResults fn={challenge.code.fn} tests={challenge.code.tests} run={run} />
              <div aria-live="polite">{solved.has("code") && run && <Solved other={other} onOther={() => other && setMode(other)} tries={runs} />}</div>
            </div>
          )
        )}
      </section>
    </div>
  );
}
