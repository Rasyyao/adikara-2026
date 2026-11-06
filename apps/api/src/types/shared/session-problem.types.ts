/** A problem sent to a session, as stored; `challenge` is the frozen JSON, read with readChallenge. */
export interface SessionProblemRecord {
  id: string;
  sessionId: string;
  problemId: string | null;
  title: string;
  story: string;
  challenge: unknown;
  status: "OPEN" | "CLOSED";
  openedAt: Date;
  closedAt: Date | null;
}

export type SolvedWith = "blocks" | "code";

export interface ProblemAttemptRecord {
  id: string;
  problemId: string;
  studentId: string;
  studentName: string | null;
  studentUsername: string | null;
  startedAt: Date;
  updatedAt: Date;
  solvedAt: Date | null;
  solvedWith: SolvedWith | null;
  blockChecks: number;
  blockAnswer: unknown;
  codeRuns: number;
  code: string | null;
  codePassed: number | null;
  codeTotal: number | null;
}

export interface AttemptChanges {
  blockChecks?: number;
  blockAnswer?: unknown;
  codeRuns?: number;
  code?: string;
  codePassed?: number;
  codeTotal?: number;
  solvedAt?: Date;
  solvedWith?: SolvedWith;
}

export interface SessionProblemRepository {
  create(data: { sessionId: string; problemId: string; title: string; story: string; challenge: unknown }): Promise<SessionProblemRecord>;
  find(id: string): Promise<SessionProblemRecord | null>;
  /** Oldest first. */
  list(sessionId: string): Promise<SessionProblemRecord[]>;
  close(id: string, closedAt: Date): Promise<SessionProblemRecord>;
  listAttempts(problemId: string): Promise<ProblemAttemptRecord[]>;
  findAttempt(problemId: string, studentId: string): Promise<ProblemAttemptRecord | null>;
  /** The student's attempt, made the first time they open the problem. */
  startAttempt(problemId: string, studentId: string): Promise<ProblemAttemptRecord>;
  updateAttempt(id: string, changes: AttemptChanges): Promise<ProblemAttemptRecord>;
}
