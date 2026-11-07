import { AppError } from "../../http/errors.js";
import type { AuthContext } from "../../types/auth.types.js";
import type { AttemptRecord, QuizQuestion } from "../../types/shared/quiz.types.js";
import type { ClassReportRecord, InsightQuiz, InsightSession, TeacherInsightsRepository, TeachingActivity } from "../../types/teacher/insights.types.js";

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

/** The AI's feedback for the teacher, as the worker writes it (see adikara-ai/report_gen.py). */
export interface ReportFeedback {
  summary: string;
  focus_topics: { topic: string; finding: string; suggestion: string }[];
  questions: { question: string; misconception: string; suggestion: string }[];
  students: { name: string; reason: string; action: string }[];
  next_steps: string[];
}

export interface ReportView {
  id: string;
  status: "pending" | "done" | "failed";
  created_at: string;
  finished_at: string | null;
  error: string | null;
  feedback: ReportFeedback | null;
}

/** One class: the dashboard numbers for its sessions alone, plus who attended which session and the latest AI feedback. */
export interface ClassInsights extends InsightsOverview {
  class: { id: string; name: string; student_count: number };
  attendance: {
    /** Started sessions, oldest first (at most the newest ATTENDANCE_LIMIT). */
    sessions: { id: string; date: string; material_title: string | null; status: InsightSession["status"] }[];
    /** Everyone on the roster, lowest attendance first; `present` lines up with `sessions`. */
    students: { student_id: string; name: string; username: string | null; present: boolean[]; attended: number; rate: number | null }[];
  };
  report: ReportView | null;
}

export interface TeacherInsightsService {
  overview(auth: AuthContext): Promise<InsightsOverview>;
  classView(auth: AuthContext, classId: string): Promise<ClassInsights>;
  /** Queues AI feedback on the class's current results; a request still being written is returned instead of a new one. */
  requestFeedback(auth: AuthContext, classId: string): Promise<{ report: ReportView }>;
  feedback(auth: AuthContext, classId: string): Promise<{ report: ReportView | null }>;
}

const ATTENDANCE_LIMIT = 15;
/** A pending report older than this is treated as lost (the worker died), so a new one may be requested. */
const PENDING_FOR_MS = 10 * 60 * 1000;
const str = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown) => (Array.isArray(v) ? v : []);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** The worker's JSON, trimmed to the shape the page renders; anything else is dropped. */
function toFeedback(raw: unknown): ReportFeedback | null {
  if (!raw || typeof raw !== "object") return null;
  const r = obj(raw);
  return {
    summary: str(r.summary, 2000),
    focus_topics: list(r.focus_topics).map(obj).map((t) => ({ topic: str(t.topic, 200), finding: str(t.finding), suggestion: str(t.suggestion) })).filter((t) => t.topic),
    questions: list(r.questions).map(obj).map((q) => ({ question: str(q.question), misconception: str(q.misconception), suggestion: str(q.suggestion) })).filter((q) => q.question),
    students: list(r.students).map(obj).map((s) => ({ name: str(s.name, 120), reason: str(s.reason), action: str(s.action) })).filter((s) => s.name),
    next_steps: list(r.next_steps).map((x) => str(x)).filter(Boolean),
  };
}

const reportView = (r: ClassReportRecord): ReportView => ({
  id: r.id,
  status: r.status,
  created_at: r.createdAt.toISOString(),
  finished_at: r.finishedAt?.toISOString() ?? null,
  error: r.error,
  feedback: r.status === "done" ? toFeedback(r.feedback) : null,
});

/** What the AI reads: the class's results, small enough for a prompt and without anything it does not need. */
function reportInput(view: ClassInsights) {
  return {
    class_name: view.class.name,
    student_count: view.class.student_count,
    sessions: view.totals.sessions,
    participation_rate: view.totals.participation_rate,
    correct_rate: view.totals.correct_rate,
    quizzes: view.quizzes.slice(0, 10).map((q) => ({ title: q.title, kind: q.kind, questions: q.question_count, joined: q.joined, submitted: q.submitted, average_percent: q.average_percent })),
    hardest_questions: view.hardest_questions.slice(0, 8).map((q) => ({
      quiz: q.quiz_title,
      topic: q.topic,
      question: q.question,
      correct_answer: q.answer_text ?? q.answer,
      most_picked_wrong: q.top_wrong ? { answer: q.top_wrong.text || q.top_wrong.key, students: q.top_wrong.count } : null,
      answered: q.answered,
      wrong: q.wrong,
      correct_rate: q.correct_rate,
    })),
    topics: view.topics.slice(0, 8).map((t) => ({ topic: t.topic, correct_rate: t.correct_rate, wrong: t.wrong, answered: t.answered, struggling_students: t.struggling_students })),
    students_needing_help: view.students
      .filter((s) => s.correct_rate !== null && s.correct_rate < 0.6)
      .slice(0, 10)
      .map((s) => ({ name: s.name, correct_rate: s.correct_rate, sessions_joined: s.sessions_joined, class_sessions: s.class_sessions, weakest_topic: s.weakest_topic })),
    low_attendance: view.attendance.students
      .filter((s) => s.rate !== null && s.rate < 0.75)
      .slice(0, 10)
      .map((s) => ({ name: s.name, attended: s.attended, of: view.attendance.sessions.length })),
  };
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

/** The dashboard numbers, from whatever activity is loaded (every class of a teacher, or one class). */
function summarize(activity: TeachingActivity, now: Date): InsightsOverview {
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
        generated_at: now.toISOString(),
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
}

export function createTeacherInsightsService(repository: TeacherInsightsRepository, now: () => Date = () => new Date()): TeacherInsightsService {
  const teacherOnly = (auth: AuthContext) => {
    if (auth.kind !== "teacher") throw new AppError(403, "forbidden", "You do not have access to this resource");
  };
  /** The class, if this teacher teaches it (an admin sees every class). */
  const ownClass = async (auth: AuthContext, classId: string) => {
    teacherOnly(auth);
    const cls = await repository.findClass(classId);
    if (!cls || (auth.role !== "ADMIN" && cls.teacherId !== auth.userId)) throw new AppError(404, "class_not_found", "Class not found");
    return cls;
  };

  const classView = async (auth: AuthContext, classId: string): Promise<ClassInsights> => {
    const cls = await ownClass(auth, classId);
    const [activity, roster, latest] = await Promise.all([repository.loadActivity(null, SESSION_WINDOW, classId), repository.listRoster(classId), repository.latestReport(classId)]);
    const summary = summarize(activity, now());
    const started = activity.sessions.filter((s) => s.startedAt !== null || s.status !== "LOBBY");
    const columns = started.slice(0, ATTENDANCE_LIMIT).reverse();
    const attendance = {
      sessions: columns.map((s) => ({ id: s.id, date: (s.startedAt ?? s.createdAt).toISOString(), material_title: s.materialTitle, status: s.status })),
      students: roster
        .map((st) => {
          const present = columns.map((s) => s.participants.some((p) => p.studentId === st.id));
          const attended = present.filter(Boolean).length;
          return { student_id: st.id, name: st.name ?? st.username ?? "Siswa", username: st.username, present, attended, rate: rate(attended, columns.length) };
        })
        .sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2) || a.name.localeCompare(b.name)),
    };
    // students on the roster who never joined a session still belong in the class's list
    const listed = new Set(summary.students.map((s) => s.student_id));
    const absent = roster
      .filter((st) => !listed.has(st.id))
      .map((st) => ({
        student_id: st.id,
        name: st.name ?? st.username ?? "Siswa",
        username: st.username,
        class_name: cls.name,
        sessions_joined: 0,
        class_sessions: started.length,
        quizzes_taken: 0,
        answered: 0,
        correct: 0,
        correct_rate: null,
        weakest_topic: null,
        missed: [],
      }));
    return {
      ...summary,
      students: [...summary.students, ...absent],
      class: { id: cls.id, name: cls.name, student_count: roster.length },
      attendance,
      report: latest ? reportView(latest) : null,
    };
  };

  return {
    async overview(auth) {
      teacherOnly(auth);
      return summarize(await repository.loadActivity(auth.role === "ADMIN" ? null : auth.userId, SESSION_WINDOW), now());
    },
    classView,
    async requestFeedback(auth, classId) {
      const view = await classView(auth, classId);
      const latest = view.report;
      if (latest?.status === "pending" && now().getTime() - new Date(latest.created_at).getTime() < PENDING_FOR_MS) return { report: latest };
      if (view.totals.submissions === 0) throw new AppError(409, "no_results", "This class has no handed-in quizzes to analyse yet");
      const created = await repository.createReport({ classId, teacherId: auth.userId, input: reportInput(view) });
      return { report: reportView(created) };
    },
    async feedback(auth, classId) {
      await ownClass(auth, classId);
      const latest = await repository.latestReport(classId);
      return { report: latest ? reportView(latest) : null };
    },
  };
}
