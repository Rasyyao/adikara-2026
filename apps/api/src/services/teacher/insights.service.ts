import { AppError } from "../../http/errors.js";
import type { AuthContext } from "../../types/auth.types.js";
import type { AttemptRecord, QuizQuestion } from "../../types/shared/quiz.types.js";
import type { InsightQuiz, InsightSession, TeacherInsightsRepository } from "../../types/teacher/insights.types.js";

// The teacher's dashboard: how much of each class takes part, how the quizzes went, which questions and which parts of the
// material the class gets wrong most, and which students need help (with the questions they missed). Everything is
// computed from the recent sessions, so it needs no tables of its own and is never out of date.

/** How many of the newest sessions the dashboard reads. */
const SESSION_WINDOW = 30;
const HARDEST_LIMIT = 10;
const STUDENT_LIMIT = 50;
const MISSED_LIMIT = 5;

const round = (n: number, digits = 3) => Math.round(n * 10 ** digits) / 10 ** digits;
const rate = (part: number, whole: number) => (whole > 0 ? round(part / whole) : null);
const mean = (values: number[]) => (values.length ? round(values.reduce((a, b) => a + b, 0) / values.length) : null);
const textOf = (q: QuizQuestion, key: string) => q.options.find((o) => o.key === key)?.text ?? null;
const nameOf = (a: AttemptRecord) => a.studentName ?? a.studentUsername ?? "Siswa";
/** What a question tests: the part of the material it came from, else the material, else the quiz. */
const topicOf = (q: QuizQuestion, session: InsightSession | undefined, quizTitle: string) =>
  q.source?.trim() || session?.materialTitle || quizTitle;

export interface InsightsOverview {
  generated_at: string;
  window: { sessions: number };
  totals: {
    classes: number;
    students: number;
    sessions: number;
    live_sessions: number;
    quizzes: number;
    submissions: number;
    /** Share of a class that joined, averaged over the sessions that started. */
    participation_rate: number | null;
    /** Share of answers right, over every handed-in quiz. */
    correct_rate: number | null;
  };
  classes: { id: string; name: string; student_count: number; sessions: number; participation_rate: number | null; correct_rate: number | null; last_session_at: string | null }[];
  /** Newest first. */
  sessions: {
    id: string;
    class_id: string;
    class_name: string;
    status: InsightSession["status"];
    date: string;
    material_title: string | null;
    joined: number;
    class_size: number;
    participation_rate: number | null;
    quizzes: number;
    correct_rate: number | null;
  }[];
  /** Newest first. */
  quizzes: {
    id: string;
    session_id: string;
    class_name: string;
    title: string;
    kind: string;
    status: "open" | "closed";
    opened_at: string;
    question_count: number;
    joined: number;
    started: number;
    submitted: number;
    average_percent: number | null;
  }[];
  /** The questions answered wrong most, worst first. */
  hardest_questions: {
    quiz_id: string;
    session_id: string;
    quiz_title: string;
    class_name: string;
    topic: string;
    question_id: number;
    question: string;
    answer: string;
    answer_text: string | null;
    answered: number;
    wrong: number;
    correct_rate: number;
    top_wrong: { key: string; text: string; count: number } | null;
    /** Names of the students who got it wrong. */
    missed_by: string[];
  }[];
  /** Parts of the material, weakest first. */
  topics: { topic: string; material_title: string | null; questions: number; answered: number; wrong: number; correct_rate: number | null; struggling_students: number }[];
  /** Students, the ones needing help first. */
  students: {
    student_id: string;
    name: string;
    username: string | null;
    class_name: string;
    sessions_joined: number;
    /** Started sessions of their class in the window. */
    class_sessions: number;
    quizzes_taken: number;
    answered: number;
    correct: number;
    correct_rate: number | null;
    weakest_topic: string | null;
    /** The latest questions they got wrong, with their pick. */
    missed: { quiz_title: string; question: string; topic: string; picked: string | null; picked_text: string | null; answer: string; answer_text: string | null }[];
  }[];
}

export interface TeacherInsightsService {
  overview(auth: AuthContext): Promise<InsightsOverview>;
}

interface Answer {
  quiz: InsightQuiz;
  session: InsightSession | undefined;
  question: QuizQuestion;
  attempt: AttemptRecord;
  /** null: handed in without answering it (counts as wrong). */
  choice: string | null;
  correct: boolean;
  topic: string;
}

export function createTeacherInsightsService(repository: TeacherInsightsRepository, now: () => Date = () => new Date()): TeacherInsightsService {
  return {
    async overview(auth) {
      if (auth.kind !== "teacher") throw new AppError(403, "forbidden", "You do not have access to this resource");
      const activity = await repository.loadActivity(auth.role === "ADMIN" ? null : auth.userId, SESSION_WINDOW);
      const classById = new Map(activity.classes.map((c) => [c.id, c]));
      const sessionById = new Map(activity.sessions.map((s) => [s.id, s]));
      const className = (classId: string | undefined) => (classId && classById.get(classId)?.name) || "Kelas";
      const participationOf = (s: InsightSession) => {
        const size = classById.get(s.classId)?.studentCount ?? 0;
        return size > 0 ? Math.min(1, s.participants.length / size) : null;
      };
      // a session that never started (a PIN opened and abandoned) says nothing about participation
      const started = activity.sessions.filter((s) => s.startedAt !== null || s.status !== "LOBBY");

      // every graded answer: the handed-in attempts, one row per question (an unanswered one counts as wrong, as in grading)
      const answers: Answer[] = activity.quizzes.flatMap((quiz) => {
        const session = sessionById.get(quiz.quiz.sessionId);
        return quiz.attempts
          .filter((a) => a.submittedAt)
          .flatMap((attempt) =>
            quiz.quiz.questions.map((question) => {
              const response = attempt.responses.find((r) => r.questionId === question.id);
              return {
                quiz,
                session,
                question,
                attempt,
                choice: response?.choice ?? null,
                correct: response?.isCorrect ?? false,
                topic: topicOf(question, session, quiz.quiz.title),
              };
            }),
          );
      });
      const correctRate = (rows: Answer[]) => rate(rows.filter((a) => a.correct).length, rows.length);
      const group = <K>(rows: Answer[], keyOf: (a: Answer) => K) => {
        const map = new Map<K, Answer[]>();
        for (const row of rows) map.set(keyOf(row), [...(map.get(keyOf(row)) ?? []), row]);
        return map;
      };
      const bySession = group(answers, (a) => a.quiz.quiz.sessionId);

      const sessions = activity.sessions.map((s) => ({
        id: s.id,
        class_id: s.classId,
        class_name: className(s.classId),
        status: s.status,
        date: (s.startedAt ?? s.createdAt).toISOString(),
        material_title: s.materialTitle,
        joined: s.participants.length,
        class_size: classById.get(s.classId)?.studentCount ?? 0,
        participation_rate: participationOf(s) === null ? null : round(participationOf(s)!),
        quizzes: activity.quizzes.filter((q) => q.quiz.sessionId === s.id).length,
        correct_rate: correctRate(bySession.get(s.id) ?? []),
      }));

      const classes = activity.classes.map((c) => {
        const own = started.filter((s) => s.classId === c.id);
        const last = activity.sessions.find((s) => s.classId === c.id);
        return {
          id: c.id,
          name: c.name,
          student_count: c.studentCount,
          sessions: own.length,
          participation_rate: mean(own.flatMap((s) => (participationOf(s) === null ? [] : [participationOf(s)!]))),
          correct_rate: correctRate(answers.filter((a) => a.session?.classId === c.id)),
          last_session_at: last ? (last.startedAt ?? last.createdAt).toISOString() : null,
        };
      });

      const quizzes = [...activity.quizzes].reverse().map(({ quiz, attempts }) => {
        const session = sessionById.get(quiz.sessionId);
        const handedIn = attempts.filter((a) => a.submittedAt);
        const total = quiz.questions.length;
        return {
          id: quiz.id,
          session_id: quiz.sessionId,
          class_name: className(session?.classId),
          title: quiz.title,
          kind: quiz.kind,
          status: quiz.status === "OPEN" ? ("open" as const) : ("closed" as const),
          opened_at: quiz.openedAt.toISOString(),
          question_count: total,
          joined: session?.participants.length ?? 0,
          started: attempts.length,
          submitted: handedIn.length,
          average_percent: total && handedIn.length ? round((handedIn.reduce((sum, a) => sum + (a.score ?? 0), 0) / handedIn.length / total) * 100, 1) : null,
        };
      });

      const hardest_questions = [...group(answers, (a) => `${a.quiz.quiz.id}:${a.question.id}`).values()]
        .map((rows) => {
          const { quiz, question, session, topic } = rows[0];
          const wrongRows = rows.filter((a) => !a.correct);
          const picks = new Map<string, number>();
          for (const a of wrongRows) if (a.choice) picks.set(a.choice, (picks.get(a.choice) ?? 0) + 1);
          const [topKey, topCount] = [...picks.entries()].sort((x, y) => y[1] - x[1])[0] ?? [];
          return {
            quiz_id: quiz.quiz.id,
            session_id: quiz.quiz.sessionId,
            quiz_title: quiz.quiz.title,
            class_name: className(session?.classId),
            topic,
            question_id: question.id,
            question: question.question,
            answer: question.answer,
            answer_text: textOf(question, question.answer),
            answered: rows.length,
            wrong: wrongRows.length,
            correct_rate: rate(rows.length - wrongRows.length, rows.length)!,
            top_wrong: topKey ? { key: topKey, text: textOf(question, topKey) ?? "", count: topCount! } : null,
            missed_by: wrongRows.map((a) => nameOf(a.attempt)),
          };
        })
        .filter((q) => q.wrong > 0)
        .sort((a, b) => a.correct_rate - b.correct_rate || b.wrong - a.wrong)
        .slice(0, HARDEST_LIMIT);

      const topics = [...group(answers, (a) => a.topic).entries()]
        .map(([topic, rows]) => {
          const perStudent = group(rows, (a) => a.attempt.studentId);
          return {
            topic,
            material_title: rows[0].session?.materialTitle ?? null,
            questions: new Set(rows.map((a) => `${a.quiz.quiz.id}:${a.question.id}`)).size,
            answered: rows.length,
            wrong: rows.filter((a) => !a.correct).length,
            correct_rate: correctRate(rows),
            // a student who got half or more of this part wrong
            struggling_students: [...perStudent.values()].filter((own) => (correctRate(own) ?? 1) < 0.5).length,
          };
        })
        .sort((a, b) => (a.correct_rate ?? 1) - (b.correct_rate ?? 1) || b.wrong - a.wrong);

      // students: everyone who joined a recent session (or took a quiz in one)
      const joinedSessions = new Map<string, Set<string>>();
      const studentInfo = new Map<string, { name: string; username: string | null; classId: string | undefined }>();
      for (const s of activity.sessions) {
        for (const p of s.participants) {
          joinedSessions.set(p.studentId, (joinedSessions.get(p.studentId) ?? new Set()).add(s.id));
          studentInfo.set(p.studentId, { name: p.name ?? p.username ?? "Siswa", username: p.username, classId: s.classId });
        }
      }
      for (const { quiz, attempts } of activity.quizzes) {
        for (const a of attempts) {
          if (!studentInfo.has(a.studentId)) studentInfo.set(a.studentId, { name: nameOf(a), username: a.studentUsername, classId: sessionById.get(quiz.sessionId)?.classId });
        }
      }
      const byStudent = group(answers, (a) => a.attempt.studentId);
      const students = [...studentInfo.entries()]
        .map(([studentId, info]) => {
          const own = byStudent.get(studentId) ?? [];
          const wrong = own.filter((a) => !a.correct);
          const topicRates = [...group(own, (a) => a.topic).entries()].map(([topic, rows]) => ({ topic, rate: correctRate(rows) ?? 1, wrong: rows.filter((a) => !a.correct).length }));
          const weakest = topicRates.filter((t) => t.wrong > 0).sort((a, b) => a.rate - b.rate || b.wrong - a.wrong)[0];
          return {
            student_id: studentId,
            name: info.name,
            username: info.username,
            class_name: className(info.classId),
            sessions_joined: joinedSessions.get(studentId)?.size ?? 0,
            class_sessions: started.filter((s) => s.classId === info.classId).length,
            quizzes_taken: new Set(own.map((a) => a.quiz.quiz.id)).size,
            answered: own.length,
            correct: own.length - wrong.length,
            correct_rate: correctRate(own),
            weakest_topic: weakest?.topic ?? null,
            missed: [...wrong]
              .sort((a, b) => b.quiz.quiz.openedAt.getTime() - a.quiz.quiz.openedAt.getTime() || a.question.id - b.question.id)
              .slice(0, MISSED_LIMIT)
              .map((a) => ({
                quiz_title: a.quiz.quiz.title,
                question: a.question.question,
                topic: a.topic,
                picked: a.choice,
                picked_text: a.choice ? textOf(a.question, a.choice) : null,
                answer: a.question.answer,
                answer_text: textOf(a.question, a.question.answer),
              })),
          };
        })
        .sort((a, b) => (a.correct_rate ?? 2) - (b.correct_rate ?? 2) || b.answered - a.answered)
        .slice(0, STUDENT_LIMIT);

      const participation = started.flatMap((s) => (participationOf(s) === null ? [] : [participationOf(s)!]));
      return {
        generated_at: now().toISOString(),
        window: { sessions: SESSION_WINDOW },
        totals: {
          classes: activity.classes.length,
          students: activity.classes.reduce((sum, c) => sum + c.studentCount, 0),
          sessions: started.length,
          live_sessions: activity.sessions.filter((s) => s.status !== "ENDED").length,
          quizzes: activity.quizzes.length,
          submissions: activity.quizzes.reduce((sum, q) => sum + q.attempts.filter((a) => a.submittedAt).length, 0),
          participation_rate: mean(participation),
          correct_rate: correctRate(answers),
        },
        classes,
        sessions,
        quizzes,
        hardest_questions,
        topics,
        students,
      };
    },
  };
}
