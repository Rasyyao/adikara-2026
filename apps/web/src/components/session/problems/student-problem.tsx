"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { checkSessionBlocksAction, playProblemAction, reportSessionCodeAction } from "@/app/actions/session-problems";
import { ProblemDialog } from "@/components/problems/problem-dialog";
import { ProblemSolver } from "@/components/problems/problem-solver";
import type { StudentProblem } from "@/lib/api/types";

/**
 * A problem the teacher sent, in a popup over the class board. Opening it starts the student's attempt; blocks are
 * checked by the API, code runs here and its result is recorded. Minimising keeps the work; the teacher closing the
 * problem leaves it readable but no longer answerable.
 */
export function StudentProblemPopup({ sessionId, problemId, closed, onMinimize }: { sessionId: string; problemId: string; closed: boolean; onMinimize: () => void }) {
  const [data, setData] = useState<StudentProblem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    playProblemAction(sessionId, problemId).then((r) => {
      if (!alive) return;
      if (r.ok) setData(r.data);
      else setError(r.message);
    });
    return () => {
      alive = false;
    };
  }, [problemId, sessionId]);

  const isClosed = closed || data?.problem.status === "closed";

  return (
    <ProblemDialog eyebrow="Soal dari guru" title={data?.problem.title ?? "Soal"} onClose={onMinimize} closeKind="minimize">
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : !data ? (
        <p className="flex items-center gap-2 text-small text-muted">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          Membuka soal…
        </p>
      ) : (
        <ProblemSolver
          seed={`${data.problem.id}:${data.attempt.started_at}`}
          title={data.problem.title}
          story={data.problem.story}
          challenge={data.problem.challenge}
          closed={isClosed}
          initial={{ tree: data.attempt.block_answer, code: data.attempt.code, solved: data.attempt.solved_with ? [data.attempt.solved_with] : [] }}
          checkBlocks={async (tree) => {
            const result = await checkSessionBlocksAction(sessionId, problemId, tree);
            return result.ok ? { ok: true, data: result.data.grade } : result;
          }}
          onCodeRun={(code, passed, total) => reportSessionCodeAction(sessionId, problemId, { code, passed, total })}
        />
      )}
    </ProblemDialog>
  );
}
