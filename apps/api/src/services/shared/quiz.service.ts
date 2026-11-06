import { AppError } from "../../http/errors.js";
import type { AuthContext } from "../../types/auth.types.js";
import type { SessionRecord } from "../../types/shared/session.types.js";
import type { AttemptRecord, ChoiceChange, QuizQuestion, QuizRecord, QuizRepository } from "../../types/shared/quiz.types.js";
import type { SessionCore } from "./session-core.js";
import { iso, sessionEnded, sessionNotFound } from "./session-views.js";

// A quiz in a live session: the teacher puts a test on the board, the students take it (from the board, a QR code or a
// link), and every pick is kept with how it was reached, so a class's mistakes can be analysed later, not only counted.

export interface NewQuizInput {
  kind: string;
  title: string;
  questions: QuizQuestion[];
  sourceChatId: string | null;
  sourceMessageId: string | null;
}

export interface AnswerInput {
  questionId: number;
  choice: string;
  timeMs: number;
  visits: number;
  changes: ChoiceChange[];
}

export interface StartInput {
  entry: string | null;
  client: Record<string, unknown> | null;
}

export interface QuizView {
  id: string;
  session_id: string;
  kind: string;
  title: string;
  status: "open" | "closed";
  question_count: number;
  opened_at: string;
  closed_at: string | null;
  source_chat_id: string | null;
  source_message_id: string | null;
}

export interface QuizService {
  create(auth: AuthContext, sessionId: string, input: NewQuizInput): Promise<{ quiz: QuizView }>;
  list(auth: AuthContext, sessionId: string): Promise<{ items: (QuizView & { started: number; submitted: number })[] }>;
  close(auth: AuthContext, sessionId: string, quizId: string): Promise<{ quiz: QuizView }>;
  results(auth: AuthContext, sessionId: string, quizId: string): Promise<QuizResults>;
  /** Every pick of every student as flat rows, with the class and quiz around them: the dataset for analysis. */
  exportData(auth: AuthContext, sessionId: string, quizId: string): Promise<Record<string, unknown>>;
  /** What a student sees: the questions (with the answers only once they handed in), and their attempt. */
  play(auth: AuthContext, sessionId: string, quizId: string): Promise<StudentQuiz>;
  start(auth: AuthContext, sessionId: string, quizId: string, input: StartInput): Promise<StudentQuiz>;
  answer(auth: AuthContext, sessionId: string, quizId: string, input: AnswerInput): Promise<{ answered: number; total: number }>;
  submit(auth: AuthContext, sessionId: string, quizId: string): Promise<StudentQuiz>;
}

export interface StudentQuiz {
  quiz: QuizView;
  questions: { id: number; question: string; options: { key: string; text: string }[]; answer?: string; explanation?: string }[];
  attempt: {
    started_at: string;
    submitted_at: string | null;
    score: number | null;
    total: number;
    duration_ms: number | null;
    answers: { question_id: number; choice: string; is_correct?: boolean }[];
    /** Place among the students who handed in, once this one has. */
    rank: number | null;
    ranked: number;
  } | null;
}

export interface QuizResults {
  quiz: QuizView & { questions: QuizQuestion[] };
  summary: {
    joined: number;
    started: number;
    submitted: number;
    average_score: number | null;
    average_percent: number | null;
    highest: number | null;
    lowest: number | null;
    average_duration_ms: number | null;
  };
  leaderboard: {
    rank: number | null;
    student_id: string;
    name: string;
    username: string | null;
    status: "submitted" | "in_progress";
    score: number;
    total: number;
    percent: number;
    answered: number;
    duration_ms: number | null;
    started_at: string;
    submitted_at: string | null;
  }[];
  /** Students in the session who have not opened the quiz yet; `online` is false once they dropped out of the session. */
  waiting: { student_id: string; name: string; username: string | null; online: boolean }[];
  questions: {
    id: number;
    question: string;
    answer: string;
    answered: number;
    correct: number;
    correct_rate: number | null;
    average_time_ms: number | null;
    /** Students who changed their pick at least once. */
    changed: number;
    /** Students whose first pick was right but who then changed to a wrong one, and the other way round. */
    right_to_wrong: number;
    wrong_to_right: number;
    options: { key: string; text: string; count: number; is_answer: boolean }[];
    /** The wrong option picked most: the likely misconception. */
    top_wrong: { key: string; text: string; count: number } | null;
  }[];
}

const quizNotFound = () => new AppError(404, "quiz_not_found", "Quiz not found");
const quizClosed = () => new AppError(409, "quiz_closed", "The quiz is closed");

const toView = (q: QuizRecord): QuizView => ({
  id: q.id,
  session_id: q.sessionId,
  kind: q.kind,
  title: q.title,
  status: q.status === "OPEN" ? "open" : "closed",
  question_count: q.questions.length,
  opened_at: q.openedAt.toISOString(),
  closed_at: iso(q.closedAt),
  source_chat_id: q.sourceChatId,
  source_message_id: q.sourceMessageId,
});

const scoreOf = (attempt: AttemptRecord) => attempt.score ?? attempt.responses.filter((r) => r.isCorrect).length;
const nameOf = (a: AttemptRecord) => a.studentName ?? a.studentUsername ?? "Siswa";
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const round = (n: number | null, digits = 1) => (n === null ? null : Math.round(n * 10 ** digits) / 10 ** digits);

/** The handed-in attempts, best first: more right answers, then faster. */
function ranking(attempts: AttemptRecord[]): AttemptRecord[] {
  return attempts
    .filter((a) => a.submittedAt)
    .sort((a, b) => scoreOf(b) - scoreOf(a) || (a.durationMs ?? Infinity) - (b.durationMs ?? Infinity));
}

export function createQuizService(core: SessionCore, repository: QuizRepository): QuizService {
  const { hub, sessions } = core;

  const teacherQuiz = async (auth: AuthContext, sessionId: string, quizId: string) => {
    const session = await core.loadManaged(auth, sessionId);
    const quiz = await repository.findQuiz(quizId);
    if (!quiz || quiz.sessionId !== session.id) throw quizNotFound();
    return { session, quiz };
  };

  const studentQuiz = async (auth: AuthContext, sessionId: string, quizId: string): Promise<{ session: SessionRecord; quiz: QuizRecord }> => {
    if (auth.kind !== "student") throw new AppError(403, "forbidden", "Only students take a quiz");
    const found = await sessions.findSessionById(sessionId);
    if (!found) throw sessionNotFound();
    const session = await core.closeIfExpired(found);
    const participant = await sessions.findParticipant(session.id, auth.userId);
    if (!participant) throw new AppError(403, "not_joined", "Join the session with its PIN first");
    if (participant.kickedAt) throw new AppError(403, "kicked", "You were removed from this session");
    const quiz = await repository.findQuiz(quizId);
    if (!quiz || quiz.sessionId !== session.id) throw quizNotFound();
    return { session, quiz };
  };

  const progress = (quiz: QuizRecord, attempt: AttemptRecord) =>
    hub.publish(
      quiz.sessionId,
      {
        type: "quiz_progress",
        data: {
          quiz_id: quiz.id,
          student_id: attempt.studentId,
          name: nameOf(attempt),
          answered: attempt.responses.length,
          total: attempt.total,
          submitted: Boolean(attempt.submittedAt),
          score: attempt.submittedAt ? scoreOf(attempt) : null,
        },
      },
      "staff",
    );

  /** Grades what was answered; an unanswered question counts as wrong. */
  const finish = async (attempt: AttemptRecord, at: Date) =>
    repository.finishAttempt(attempt.id, {
      submittedAt: at,
      score: attempt.responses.filter((r) => r.isCorrect).length,
      durationMs: Math.max(0, at.getTime() - attempt.startedAt.getTime()),
    });

  const studentView = async (quiz: QuizRecord, attempt: AttemptRecord | null): Promise<StudentQuiz> => {
    const done = Boolean(attempt?.submittedAt);
    let rank: number | null = null;
    let ranked = 0;
    if (done && attempt) {
      const order = ranking(await repository.listAttempts(quiz.id));
      ranked = order.length;
      rank = order.findIndex((a) => a.studentId === attempt.studentId) + 1 || null;
    }
    return {
      quiz: toView(quiz),
      questions: quiz.questions.map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options,
        ...(done ? { answer: q.answer, explanation: q.explanation } : {}),
      })),
      attempt: attempt && {
        started_at: attempt.startedAt.toISOString(),
        submitted_at: iso(attempt.submittedAt),
        score: done ? scoreOf(attempt) : null,
        total: attempt.total,
        duration_ms: attempt.durationMs,
        answers: attempt.responses.map((r) => ({ question_id: r.questionId, choice: r.choice, ...(done ? { is_correct: r.isCorrect } : {}) })),
        rank,
        ranked,
      },
    };
  };

  return {
    async create(auth, sessionId, input) {
      const session = await core.loadManaged(auth, sessionId);
      if (session.status === "ENDED") throw sessionEnded();
      const quiz = await repository.createQuiz({ sessionId: session.id, ...input });
      hub.publish(session.id, { type: "quiz_opened", data: { quiz: toView(quiz) } }, "all");
      return { quiz: toView(quiz) };
    },

    async list(auth, sessionId) {
      const session = await core.loadManaged(auth, sessionId);
      const quizzes = await repository.listQuizzes(session.id);
      const items = await Promise.all(
        quizzes.map(async (q) => {
          const attempts = await repository.listAttempts(q.id);
          return { ...toView(q), started: attempts.length, submitted: attempts.filter((a) => a.submittedAt).length };
        }),
      );
      return { items };
    },

    async close(auth, sessionId, quizId) {
      const { quiz } = await teacherQuiz(auth, sessionId, quizId);
      if (quiz.status === "CLOSED") return { quiz: toView(quiz) };
      const now = core.options.now();
      // whoever is still answering hands in what they have, so their picks count in the results
      for (const attempt of await repository.listAttempts(quiz.id)) {
        if (!attempt.submittedAt) progress(quiz, await finish(attempt, now));
      }
      const closed = await repository.closeQuiz(quiz.id, now);
      hub.publish(quiz.sessionId, { type: "quiz_closed", data: { quiz: toView(closed) } }, "all");
      return { quiz: toView(closed) };
    },

    async results(auth, sessionId, quizId) {
      const { session, quiz } = await teacherQuiz(auth, sessionId, quizId);
      const [attempts, participants] = await Promise.all([repository.listAttempts(quiz.id), sessions.listParticipants(session.id)]);
      const present = participants.filter((p) => !p.kickedAt);
      const joined = present.length;
      const begun = new Set(attempts.map((a) => a.studentId));
      const waiting = present
        .filter((p) => !begun.has(p.studentId))
        .map((p) => ({ student_id: p.studentId, name: p.name ?? p.username ?? "Siswa", username: p.username, online: !p.leftAt }));
      const total = quiz.questions.length;
      const order = ranking(attempts);
      const submitted = order.map(scoreOf);
      const leaderboard = [...order, ...attempts.filter((a) => !a.submittedAt)].map((a) => {
        const score = scoreOf(a);
        const place = order.indexOf(a);
        return {
          rank: place >= 0 ? place + 1 : null,
          student_id: a.studentId,
          name: nameOf(a),
          username: a.studentUsername,
          status: a.submittedAt ? ("submitted" as const) : ("in_progress" as const),
          score,
          total,
          percent: total ? Math.round((score / total) * 100) : 0,
          answered: a.responses.length,
          duration_ms: a.durationMs,
          started_at: a.startedAt.toISOString(),
          submitted_at: iso(a.submittedAt),
        };
      });
      const questions = quiz.questions.map((q) => {
        const responses = attempts.flatMap((a) => a.responses.filter((r) => r.questionId === q.id));
        const correct = responses.filter((r) => r.isCorrect).length;
        const options = q.options.map((o) => ({ ...o, count: responses.filter((r) => r.choice === o.key).length, is_answer: o.key === q.answer }));
        const wrong = options.filter((o) => !o.is_answer && o.count > 0).sort((a, b) => b.count - a.count)[0];
        return {
          id: q.id,
          question: q.question,
          answer: q.answer,
          answered: responses.length,
          correct,
          correct_rate: responses.length ? round(correct / responses.length, 3) : null,
          average_time_ms: round(mean(responses.map((r) => r.timeMs)), 0),
          changed: responses.filter((r) => r.changes.length > 1).length,
          right_to_wrong: responses.filter((r) => r.firstChoice === q.answer && !r.isCorrect).length,
          wrong_to_right: responses.filter((r) => r.firstChoice !== q.answer && r.isCorrect).length,
          options,
          top_wrong: wrong ? { key: wrong.key, text: wrong.text, count: wrong.count } : null,
        };
      });
      const avg = mean(submitted);
      return {
        quiz: { ...toView(quiz), questions: quiz.questions },
        summary: {
          joined,
          started: attempts.length,
          submitted: order.length,
          average_score: round(avg),
          average_percent: avg === null || !total ? null : round((avg / total) * 100),
          highest: submitted.length ? Math.max(...submitted) : null,
          lowest: submitted.length ? Math.min(...submitted) : null,
          average_duration_ms: round(mean(order.flatMap((a) => (a.durationMs === null ? [] : [a.durationMs]))), 0),
        },
        leaderboard,
        waiting,
        questions,
      };
    },

    async exportData(auth, sessionId, quizId) {
      const { session, quiz } = await teacherQuiz(auth, sessionId, quizId);
      const attempts = await repository.listAttempts(quiz.id);
      const byId = new Map(quiz.questions.map((q) => [q.id, q]));
      const textOf = (q: QuizQuestion | undefined, key: string) => q?.options.find((o) => o.key === key)?.text ?? null;
      const rows = attempts.flatMap((a) =>
        quiz.questions.map((q) => {
          const r = a.responses.find((x) => x.questionId === q.id);
          return {
            student_id: a.studentId,
            student_name: nameOf(a),
            student_username: a.studentUsername,
            question_id: q.id,
            question: q.question,
            correct_choice: q.answer,
            correct_text: textOf(q, q.answer),
            choice: r?.choice ?? null,
            choice_text: r ? textOf(byId.get(q.id), r.choice) : null,
            is_correct: r?.isCorrect ?? false,
            answered: Boolean(r),
            first_choice: r?.firstChoice ?? null,
            first_choice_text: r ? textOf(q, r.firstChoice) : null,
            changed: r ? r.changes.length > 1 : false,
            changes: r?.changes ?? [],
            time_ms: r?.timeMs ?? null,
            visits: r?.visits ?? 0,
            answer_order: r?.answerOrder ?? null,
            answered_at: r ? r.answeredAt.toISOString() : null,
            explanation: q.explanation,
            source: q.source,
            attempt_started_at: a.startedAt.toISOString(),
            attempt_submitted_at: iso(a.submittedAt),
            attempt_score: a.submittedAt ? scoreOf(a) : null,
            attempt_total: a.total,
            attempt_duration_ms: a.durationMs,
            entry: a.entry,
            client: a.client,
          };
        }),
      );
      return {
        schema_version: 1,
        exported_at: core.options.now().toISOString(),
        session: { id: session.id, class_id: session.classId, status: session.status, started_at: iso(session.startedAt), ended_at: iso(session.endedAt) },
        quiz: { ...toView(quiz), questions: quiz.questions },
        attempts: attempts.map((a) => ({
          student_id: a.studentId,
          student_name: nameOf(a),
          started_at: a.startedAt.toISOString(),
          submitted_at: iso(a.submittedAt),
          score: a.submittedAt ? scoreOf(a) : null,
          total: a.total,
          duration_ms: a.durationMs,
          entry: a.entry,
          client: a.client,
        })),
        rows,
      };
    },

    async play(auth, sessionId, quizId) {
      const { quiz } = await studentQuiz(auth, sessionId, quizId);
      return studentView(quiz, await repository.findAttempt(quiz.id, auth.userId));
    },

    async start(auth, sessionId, quizId, input) {
      const { session, quiz } = await studentQuiz(auth, sessionId, quizId);
      const existing = await repository.findAttempt(quiz.id, auth.userId);
      if (existing) return studentView(quiz, existing);
      if (session.status === "ENDED") throw sessionEnded();
      if (quiz.status === "CLOSED") throw quizClosed();
      const attempt = await repository.startAttempt({ quizId: quiz.id, studentId: auth.userId, total: quiz.questions.length, ...input });
      progress(quiz, attempt);
      return studentView(quiz, attempt);
    },

    async answer(auth, sessionId, quizId, input) {
      const { session, quiz } = await studentQuiz(auth, sessionId, quizId);
      if (session.status === "ENDED") throw sessionEnded();
      if (quiz.status === "CLOSED") throw quizClosed();
      const attempt = await repository.findAttempt(quiz.id, auth.userId);
      if (!attempt) throw new AppError(409, "quiz_not_started", "Start the quiz first");
      if (attempt.submittedAt) throw new AppError(409, "quiz_submitted", "You already handed in this quiz");
      const question = quiz.questions.find((q) => q.id === input.questionId);
      if (!question) throw new AppError(400, "validation_error", "Request validation failed", { fields: { question_id: "is not a question of this quiz" } });
      if (!question.options.some((o) => o.key === input.choice)) {
        throw new AppError(400, "validation_error", "Request validation failed", { fields: { choice: "is not an option of this question" } });
      }
      const before = attempt.responses.find((r) => r.questionId === question.id);
      // the history is the client's, but always ends on the pick being saved
      const changes = input.changes.length && input.changes[input.changes.length - 1].choice === input.choice ? input.changes : [...input.changes, { choice: input.choice, at_ms: input.timeMs }];
      await repository.saveResponse(attempt.id, {
        questionId: question.id,
        choice: input.choice,
        firstChoice: before?.firstChoice ?? changes[0].choice,
        isCorrect: input.choice === question.answer,
        timeMs: input.timeMs,
        visits: input.visits,
        changes,
        answerOrder: before?.answerOrder ?? attempt.responses.length + 1,
      });
      const saved = (await repository.findAttempt(quiz.id, auth.userId)) ?? attempt;
      progress(quiz, saved);
      return { answered: saved.responses.length, total: quiz.questions.length };
    },

    async submit(auth, sessionId, quizId) {
      const { session, quiz } = await studentQuiz(auth, sessionId, quizId);
      const attempt = await repository.findAttempt(quiz.id, auth.userId);
      if (!attempt) throw new AppError(409, "quiz_not_started", "Start the quiz first");
      if (attempt.submittedAt) return studentView(quiz, attempt);
      if (session.status === "ENDED") throw sessionEnded();
      const done = await finish(attempt, core.options.now());
      progress(quiz, done);
      return studentView(quiz, done);
    },
  };
}
