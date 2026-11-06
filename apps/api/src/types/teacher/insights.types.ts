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

export interface TeacherInsightsRepository {
  /** A teacher id limits it to that teacher; null (an admin) reads every teacher's. At most `sessionLimit` newest sessions. */
  loadActivity(teacherId: string | null, sessionLimit: number): Promise<TeachingActivity>;
}
