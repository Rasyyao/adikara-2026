"use client";

import { AlertTriangle, CheckCircle2, Terminal, XCircle } from "lucide-react";
import type { CodeTest } from "@/lib/api/types";
import { showCall, showValue, type RunResult } from "./code-runner";

/** The tests of a JavaScript task, before or after a run: the call, what it should return, and what it did. */
export function CodeResults({ fn, tests, run }: { fn: string; tests: CodeTest[]; run: RunResult | null }) {
  const passed = run?.results.filter((r) => r.pass).length ?? 0;
  return (
    <div className="flex flex-col gap-2">
      {run?.error && (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 font-mono text-caption text-danger">
          <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className="whitespace-pre-wrap break-words">{run.error}</span>
        </p>
      )}
      <ul aria-label="Kasus uji" className="flex flex-col gap-1.5">
        {tests.map((test, i) => {
          const outcome = run?.results[i];
          const tone = !outcome ? "border-border bg-bg" : outcome.pass ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5";
          return (
            <li key={i} className={`flex items-start gap-2 rounded-md border px-3 py-2 ${tone}`}>
              {outcome ? (
                outcome.pass ? (
                  <CheckCircle2 size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-success" aria-label="lolos" />
                ) : (
                  <XCircle size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-danger" aria-label="belum lolos" />
                )
              ) : (
                <span className="mt-1 size-3 shrink-0 rounded-full border-2 border-border" aria-label="belum dijalankan" />
              )}
              <span className="min-w-0 flex-1 font-mono text-caption text-ink">
                <span className="block break-words">
                  {showCall(fn, test.args)} <span className="text-muted">harus</span> {showValue(test.expected)}
                </span>
                {outcome && !outcome.pass && (
                  <span className="block break-words text-danger">{outcome.error ? outcome.error : `hasilmu: ${outcome.actual}`}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {run && !run.error && (
        <p className={`text-small font-semibold ${passed === tests.length ? "text-success" : "text-ink"}`} aria-live="polite">
          {passed}/{tests.length} kasus uji lolos
        </p>
      )}
      {run && run.logs.length > 0 && (
        <div className="rounded-md bg-[#1e2129] px-3 py-2">
          <p className="mb-1 flex items-center gap-1.5 text-caption font-semibold text-[#9aa3b2]">
            <Terminal size={14} strokeWidth={2} aria-hidden="true" />
            console.log
          </p>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap font-mono text-caption text-[#e6e8ee]">{run.logs.join("\n")}</pre>
        </div>
      )}
    </div>
  );
}
