/** One question of a quiz, frozen when the quiz was put on the board. `id` is its 1-based number. */
export interface QuizQuestion {
  id: number;
  question: string;
  options: { key: string; text: string }[];
  answer: string;
  explanation: string;
  source: string | null;
}

export type QuizStatus = "OPEN" | "CLOSED";

export interface QuizRecord {
  id: string;
  sessionId: string;
  kind: string;
  title: string;
  questions: QuizQuestion[];
  status: QuizStatus;
  sourceChatId: string | null;
  sourceMessageId: string | null;
  openedAt: Date;
  closedAt: Date | null;
  createdAt: Date;
}

/** A pick and when it was made, in milliseconds since the question was first shown. */
export interface ChoiceChange {
  choice: string;
  at_ms: number;
}

export interface ResponseRecord {
  questionId: number;
  choice: string;
  firstChoice: string;
  isCorrect: boolean;
  timeMs: number;
  visits: number;
  changes: ChoiceChange[];
  answerOrder: number;
  answeredAt: Date;
}

export interface AttemptRecord {
  id: string;
  quizId: string;
  studentId: string;
  /** The student's alias, else their username. */
  studentName: string | null;
  studentUsername: string | null;
  startedAt: Date;
  submittedAt: Date | null;
  score: number | null;
  total: number;
  durationMs: number | null;
  entry: string | null;
  client: Record<string, unknown> | null;
  responses: ResponseRecord[];
}

export interface NewQuiz {
  sessionId: string;
  kind: string;
  title: string;
  questions: QuizQuestion[];
  sourceChatId: string | null;
  sourceMessageId: string | null;
}

export interface QuizRepository {
  createQuiz(data: NewQuiz): Promise<QuizRecord>;
  findQuiz(id: string): Promise<QuizRecord | null>;
  listQuizzes(sessionId: string): Promise<QuizRecord[]>;
  closeQuiz(id: string, closedAt: Date): Promise<QuizRecord>;
  /** Every attempt of a quiz with its responses, oldest first. */
  listAttempts(quizId: string): Promise<AttemptRecord[]>;
  findAttempt(quizId: string, studentId: string): Promise<AttemptRecord | null>;
  /** The attempt of the student, made when there is none yet (a second start returns the first). */
  startAttempt(data: { quizId: string; studentId: string; total: number; entry: string | null; client: Record<string, unknown> | null }): Promise<AttemptRecord>;
  saveResponse(attemptId: string, response: Omit<ResponseRecord, "answeredAt">): Promise<void>;
  finishAttempt(attemptId: string, data: { submittedAt: Date; score: number; durationMs: number }): Promise<AttemptRecord>;
}
