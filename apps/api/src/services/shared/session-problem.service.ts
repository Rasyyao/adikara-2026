import { AppError } from "../../http/errors.js";
import { LIMITS, gradeArrangement, modesOf, problemIssues, readArrangement, readChallenge, type Challenge, type GradeResult } from "../../lib/block-puzzle.js";
import type { AuthContext } from "../../types/auth.types.js";
import type { SessionRecord } from "../../types/shared/session.types.js";
import type { ProblemAttemptRecord, SessionProblemRecord, SessionProblemRepository, SolvedWith } from "../../types/shared/session-problem.types.js";
import type { TeacherProblemRepository } from "../../types/teacher/problem.types.js";
import type { SessionCore } from "./session-core.js";
import { iso, sessionEnded, sessionNotFound } from "./session-views.js";

// A problem in a live session, the way LiveBoard pushes an activity: the teacher sends a ready problem, it pops up on
// every student's screen, each student solves it with blocks or JavaScript, and the teacher watches who solved it, how,
// and after how many tries.

export interface SessionProblemView {
  id: string;
  session_id: string;
  problem_id: string | null;
  title: string;
  status: "open" | "closed";
  modes: { blocks: boolean; code: boolean };
  opened_at: string;
  closed_at: string | null;
}

/** The challenge without its answers: no block solution, no reference code. */
export interface StudentChallenge {
  prompt: string;
  hint: string;
  ordered: boolean;
  blocks: Challenge["blocks"];
  /** Blocks in the answer, so the student knows how many to use. */
  answer_blocks: number;
  code: { fn: string; params: string[]; starter: string; tests: NonNullable<Challenge["code"]>["tests"] } | null;
}

export interface StudentAttemptView {
  started_at: string;
  solved_at: string | null;
  solved_with: SolvedWith | null;
  block_checks: number;
  block_answer: unknown;
  code_runs: number;
  code: string | null;
  code_passed: number | null;
  code_total: number | null;
}

export interface StudentProblem {
  problem: SessionProblemView & { story: string; challenge: StudentChallenge };
  attempt: StudentAttemptView;
}

export interface ProblemResults {
  problem: SessionProblemView & { story: string; challenge: Challenge };
  summary: { joined: number; opened: number; solved: number; solved_blocks: number; solved_code: number };
  students: {
    student_id: string;
    name: string;
    username: string | null;
    /** solved · working: opened it, not solved yet · waiting: has not opened it. */
    status: "solved" | "working" | "waiting";
    online: boolean;
    solved_with: SolvedWith | null;
    block_checks: number;
    code_runs: number;
    code_passed: number | null;
    code_total: number | null;
    code: string | null;
    started_at: string | null;
    solved_at: string | null;
    /** From opening it to solving it. */
    duration_ms: number | null;
  }[];
}

export interface SessionProblemService {
  /** Sends a ready problem of the teacher to the class; everyone gets `problem_opened`. */
  send(auth: AuthContext, sessionId: string, problemId: string): Promise<{ problem: SessionProblemView }>;
  list(auth: AuthContext, sessionId: string): Promise<{ items: (SessionProblemView & { opened: number; solved: number })[] }>;
  close(auth: AuthContext, sessionId: string, id: string): Promise<{ problem: SessionProblemView }>;
  results(auth: AuthContext, sessionId: string, id: string): Promise<ProblemResults>;
  /** The open problems of a session, for a student who joins after they were sent. */
  openFor(auth: AuthContext, sessionId: string): Promise<{ items: (SessionProblemView & { solved: boolean })[] }>;
  /** Opens a problem for the student, starting their attempt. */
  play(auth: AuthContext, sessionId: string, id: string): Promise<StudentProblem>;
  checkBlocks(auth: AuthContext, sessionId: string, id: string, answer: unknown): Promise<{ grade: GradeResult; attempt: StudentAttemptView }>;
  /** Code runs in the student's browser; this records what it reported. */
  reportCode(auth: AuthContext, sessionId: string, id: string, input: { code: string; passed: number; total: number }): Promise<{ solved: boolean; attempt: StudentAttemptView }>;
}

const notFound = () => new AppError(404, "problem_not_found", "Problem not found");
const closed = () => new AppError(409, "problem_closed", "The teacher closed this problem");

const toView = (p: SessionProblemRecord): SessionProblemView => ({
  id: p.id,
  session_id: p.sessionId,
  problem_id: p.problemId,
  title: p.title,
  status: p.status === "OPEN" ? "open" : "closed",
  modes: modesOf(readChallenge(p.challenge)),
  opened_at: p.openedAt.toISOString(),
  closed_at: iso(p.closedAt),
});

const count = (nodes: Challenge["solution"]): number => nodes.reduce((sum, n) => sum + 1 + count(n.children ?? []), 0);

function forStudent(challenge: Challenge): StudentChallenge {
  return {
    prompt: challenge.prompt,
    hint: challenge.hint,
    ordered: challenge.ordered,
    blocks: challenge.blocks,
    answer_blocks: count(challenge.solution),
    code: challenge.code && { fn: challenge.code.fn, params: challenge.code.params, starter: challenge.code.starter, tests: challenge.code.tests },
  };
}

const attemptView = (a: ProblemAttemptRecord): StudentAttemptView => ({
  started_at: a.startedAt.toISOString(),
  solved_at: iso(a.solvedAt),
  solved_with: a.solvedWith,
  block_checks: a.blockChecks,
  block_answer: a.blockAnswer ?? null,
  code_runs: a.codeRuns,
  code: a.code,
  code_passed: a.codePassed,
  code_total: a.codeTotal,
});

const nameOf = (a: { studentName: string | null; studentUsername: string | null }) => a.studentName ?? a.studentUsername ?? "Siswa";

export function createSessionProblemService(core: SessionCore, repository: SessionProblemRepository, problems: TeacherProblemRepository): SessionProblemService {
  const { hub, sessions } = core;

  const teacherProblem = async (auth: AuthContext, sessionId: string, id: string) => {
    const session = await core.loadManaged(auth, sessionId);
    const problem = await repository.find(id);
    if (!problem || problem.sessionId !== session.id) throw notFound();
    return { session, problem };
  };

  const joinedSession = async (auth: AuthContext, sessionId: string): Promise<SessionRecord> => {
    if (auth.kind !== "student") throw new AppError(403, "forbidden", "Only students solve a problem");
    const found = await sessions.findSessionById(sessionId);
    if (!found) throw sessionNotFound();
    const session = await core.closeIfExpired(found);
    const participant = await sessions.findParticipant(session.id, auth.userId);
    if (!participant) throw new AppError(403, "not_joined", "Join the session with its PIN first");
    if (participant.kickedAt) throw new AppError(403, "kicked", "You were removed from this session");
    return session;
  };

  const studentProblem = async (auth: AuthContext, sessionId: string, id: string) => {
    const session = await joinedSession(auth, sessionId);
    const problem = await repository.find(id);
    if (!problem || problem.sessionId !== session.id) throw notFound();
    return { session, problem };
  };

  /** Checking needs a live session, an open problem, and the attempt the student started by opening it. */
  const working = async (auth: AuthContext, sessionId: string, id: string) => {
    const { session, problem } = await studentProblem(auth, sessionId, id);
    if (session.status === "ENDED") throw sessionEnded();
    if (problem.status === "CLOSED") throw closed();
    const attempt = (await repository.findAttempt(problem.id, auth.userId)) ?? (await repository.startAttempt(problem.id, auth.userId));
    return { problem, challenge: readChallenge(problem.challenge), attempt };
  };

  const progress = (problem: SessionProblemRecord, attempt: ProblemAttemptRecord) =>
    hub.publish(
      problem.sessionId,
      {
        type: "problem_progress",
        data: { problem_id: problem.id, student_id: attempt.studentId, name: nameOf(attempt), solved: Boolean(attempt.solvedAt), solved_with: attempt.solvedWith },
      },
      "staff",
    );

  return {
    async send(auth, sessionId, problemId) {
      const session = await core.loadManaged(auth, sessionId);
      if (session.status === "ENDED") throw sessionEnded();
      const source = await problems.find(problemId);
      if (!source || (auth.role !== "ADMIN" && source.teacherId !== auth.userId)) throw new AppError(404, "problem_not_found", "Problem not found");
      const challenge = readChallenge(source.challenge);
      if (source.status !== "ready" || source.generation !== null || problemIssues({ story: source.story, challenge }).length > 0) {
        throw new AppError(409, "problem_not_ready", "Mark the problem ready before sending it to the class");
      }
      const sent = await repository.create({ sessionId: session.id, problemId: source.id, title: source.title, story: source.story, challenge });
      hub.publish(session.id, { type: "problem_opened", data: { problem: toView(sent) } }, "all");
      return { problem: toView(sent) };
    },

    async list(auth, sessionId) {
      const session = await core.loadManaged(auth, sessionId);
      const rows = await repository.list(session.id);
      const items = await Promise.all(
        rows.map(async (p) => {
          const attempts = await repository.listAttempts(p.id);
          return { ...toView(p), opened: attempts.length, solved: attempts.filter((a) => a.solvedAt).length };
        }),
      );
      return { items };
    },

    async close(auth, sessionId, id) {
      const { problem } = await teacherProblem(auth, sessionId, id);
      if (problem.status === "CLOSED") return { problem: toView(problem) };
      const done = await repository.close(problem.id, core.options.now());
      hub.publish(done.sessionId, { type: "problem_closed", data: { problem: toView(done) } }, "all");
      return { problem: toView(done) };
    },

    async results(auth, sessionId, id) {
      const { session, problem } = await teacherProblem(auth, sessionId, id);
      const [attempts, participants] = await Promise.all([repository.listAttempts(problem.id), sessions.listParticipants(session.id)]);
      const present = participants.filter((p) => !p.kickedAt);
      const online = new Map(present.map((p) => [p.studentId, !p.leftAt]));
      const seen = new Set(attempts.map((a) => a.studentId));
      const rows: ProblemResults["students"] = attempts.map((a) => ({
        student_id: a.studentId,
        name: nameOf(a),
        username: a.studentUsername,
        status: a.solvedAt ? "solved" : "working",
        online: online.get(a.studentId) ?? false,
        solved_with: a.solvedWith,
        block_checks: a.blockChecks,
        code_runs: a.codeRuns,
        code_passed: a.codePassed,
        code_total: a.codeTotal,
        code: a.code,
        started_at: a.startedAt.toISOString(),
        solved_at: iso(a.solvedAt),
        duration_ms: a.solvedAt ? a.solvedAt.getTime() - a.startedAt.getTime() : null,
      }));
      for (const p of present) {
        if (seen.has(p.studentId)) continue;
        rows.push({
          student_id: p.studentId,
          name: p.name ?? p.username ?? "Siswa",
          username: p.username,
          status: "waiting",
          online: !p.leftAt,
          solved_with: null,
          block_checks: 0,
          code_runs: 0,
          code_passed: null,
          code_total: null,
          code: null,
          started_at: null,
          solved_at: null,
          duration_ms: null,
        });
      }
      // solved first (fastest first), then working, then waiting
      const order = { solved: 0, working: 1, waiting: 2 } as const;
      rows.sort((a, b) => order[a.status] - order[b.status] || (a.duration_ms ?? Infinity) - (b.duration_ms ?? Infinity) || a.name.localeCompare(b.name));
      const solved = attempts.filter((a) => a.solvedAt);
      return {
        problem: { ...toView(problem), story: problem.story, challenge: readChallenge(problem.challenge) },
        summary: {
          joined: present.length,
          opened: attempts.length,
          solved: solved.length,
          solved_blocks: solved.filter((a) => a.solvedWith === "blocks").length,
          solved_code: solved.filter((a) => a.solvedWith === "code").length,
        },
        students: rows,
      };
    },

    async openFor(auth, sessionId) {
      const session = await joinedSession(auth, sessionId);
      const open = (await repository.list(session.id)).filter((p) => p.status === "OPEN");
      const items = await Promise.all(open.map(async (p) => ({ ...toView(p), solved: Boolean((await repository.findAttempt(p.id, auth.userId))?.solvedAt) })));
      return { items };
    },

    async play(auth, sessionId, id) {
      const { session, problem } = await studentProblem(auth, sessionId, id);
      let attempt = await repository.findAttempt(problem.id, auth.userId);
      if (!attempt) {
        if (session.status === "ENDED") throw sessionEnded();
        if (problem.status === "CLOSED") throw closed();
        attempt = await repository.startAttempt(problem.id, auth.userId);
        progress(problem, attempt);
      }
      return { problem: { ...toView(problem), story: problem.story, challenge: forStudent(readChallenge(problem.challenge)) }, attempt: attemptView(attempt) };
    },

    async checkBlocks(auth, sessionId, id, answer) {
      const { problem, challenge, attempt } = await working(auth, sessionId, id);
      if (challenge.blocks.length === 0) throw new AppError(409, "mode_unavailable", "This problem is not solved with blocks");
      const read = readArrangement(answer, challenge.blocks);
      if ("error" in read) throw new AppError(400, "validation_error", "Request validation failed", { fields: { answer: read.error } });
      const grade = gradeArrangement(challenge, read.nodes);
      const firstSolve = grade.correct && !attempt.solvedAt;
      const saved = await repository.updateAttempt(attempt.id, {
        blockChecks: attempt.blockChecks + 1,
        blockAnswer: read.nodes,
        ...(firstSolve ? { solvedAt: core.options.now(), solvedWith: "blocks" as const } : {}),
      });
      progress(problem, saved);
      return { grade, attempt: attemptView(saved) };
    },

    async reportCode(auth, sessionId, id, input) {
      const { problem, challenge, attempt } = await working(auth, sessionId, id);
      if (!challenge.code) throw new AppError(409, "mode_unavailable", "This problem is not solved with JavaScript");
      const total = challenge.code.tests.length;
      if (input.total !== total || input.passed > total) {
        throw new AppError(400, "validation_error", "Request validation failed", { fields: { total: `must be ${total}`, passed: `must be 0-${total}` } });
      }
      if (input.code.length > LIMITS.code) throw new AppError(400, "validation_error", "Request validation failed", { fields: { code: `must be at most ${LIMITS.code} characters` } });
      const solved = input.passed === total && total > 0;
      const firstSolve = solved && !attempt.solvedAt;
      const saved = await repository.updateAttempt(attempt.id, {
        codeRuns: attempt.codeRuns + 1,
        code: input.code,
        codePassed: input.passed,
        codeTotal: total,
        ...(firstSolve ? { solvedAt: core.options.now(), solvedWith: "code" as const } : {}),
      });
      progress(problem, saved);
      return { solved, attempt: attemptView(saved) };
    },
  };
}
