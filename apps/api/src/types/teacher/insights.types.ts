import type { AttemptRecord, QuizRecord } from "../shared/quiz.types.js";
import type { SessionStatus } from "../shared/session.types.js";

export interface InsightClass {
  id: string;
  name: string;
  studentCount: number;
}

export interface InsightSession {
  id: string;
  classId: string;
  status: SessionStatus;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  /** The material (chat) the session used, if any. */
  materialId: string | null;
  materialTitle: string | null;
  /** Students who joined and were not removed. */
  participants: { studentId: string; name: string | null; username: string | null }[];
}

export interface InsightQuiz {
  quiz: QuizRecord;
  attempts: AttemptRecord[];
}

/** Everything a teacher's dashboard is computed from: their classes, recent sessions and the quizzes in them. */
export interface TeachingActivity {
  classes: InsightClass[];
  /** Newest first. */
  sessions: InsightSession[];
  quizzes: InsightQuiz[];
}

/** A student on a class's roster. */
export interface RosterStudent {
  id: string;
  name: string | null;
  username: string | null;
}

export type ReportStatus = "pending" | "done" | "failed";

/** AI feedback about one class, see the ClassReport model. */
export interface ClassReportRecord {
  id: string;
  classId: string;
  teacherId: string;
  status: ReportStatus;
  input: unknown;
  feedback: unknown;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
}

export interface TeacherInsightsRepository {
  /**
   * A teacher id limits it to that teacher; null (an admin) reads every teacher's. At most `sessionLimit` newest sessions.
   * A class id limits the sessions (and so the quizzes) and the classes to that one class.
   */
  loadActivity(teacherId: string | null, sessionLimit: number, classId?: string): Promise<TeachingActivity>;
  /** The class (archived ones too) with its owner, or null. */
  findClass(classId: string): Promise<{ id: string; teacherId: string; name: string } | null>;
  /** Everyone on the class's roster, by name. */
  listRoster(classId: string): Promise<RosterStudent[]>;
  /** Stores a pending report and queues the AI job that fills it, in one transaction. */
  createReport(data: { classId: string; teacherId: string; input: unknown }): Promise<ClassReportRecord>;
  latestReport(classId: string): Promise<ClassReportRecord | null>;
}
