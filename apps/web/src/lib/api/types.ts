// Mirrors the OpenAPI components in apps/api/docs/openapi.json. Keep in sync when the API changes.

export type Role = "ADMIN" | "TEACHER" | "USER";
export type SessionStatus = "LOBBY" | "ACTIVE" | "ENDED";
export type ParticipantState = "joined" | "left" | "kicked";
export type AttendanceStatus = "present" | "late" | "absent" | "kicked";

export interface PublicUser {
  id: string;
  role: Role;
  name: string | null;
}

export interface LoginResult {
  access_token: string;
  token_type: "Bearer";
  /** Lifetime in seconds. */
  expires_in: number;
  user: PublicUser;
}

export interface ClassView {
  id: string;
  name: string;
  class_code: string;
  teacher: { id: string; name: string };
  archived: boolean;
  student_count: number;
  created_at: string;
}

export interface SessionView {
  id: string;
  class_id: string;
  /** The 6-digit PIN; null once the session has ended. */
  join_code: string | null;
  status: SessionStatus;
  locked: boolean;
  started_at: string | null;
  ended_at: string | null;
  expires_at: string;
  created_at: string;
  /** The prepared material (chat) assigned to the session, if any. */
  chat_id: string | null;
}

/** A whiteboard scene (Excalidraw elements plus the background colour). */
export interface BoardScene {
  elements: Record<string, unknown>[];
  appState: { viewBackgroundColor?: string };
}

export interface BoardResponse {
  board: BoardScene | null;
  updated_at: string | null;
}

/** The prepared material assigned to a session. */
export interface SessionMaterial {
  id: string;
  title: string;
}

/** One row of `GET /sessions?status=live`. */
export interface LiveSession {
  session: SessionView;
  class_name: string;
  joined_count: number;
}

export interface StudentSessionView {
  id: string;
  class_id: string;
  status: SessionStatus;
  locked: boolean;
  started_at: string | null;
}

export interface ParticipantView {
  student_id: string;
  name: string | null;
  username: string | null;
  state: ParticipantState;
  joined_at: string;
  left_at: string | null;
  kicked_at: string | null;
}

export interface SessionDetail {
  session: SessionView;
  material: SessionMaterial | null;
  participants: ParticipantView[];
}

export interface JoinResult {
  session: StudentSessionView;
  participant: ParticipantView;
}

export interface Attendance {
  session_id: string;
  class_id: string;
  summary: { present: number; late: number; absent: number; kicked: number; total: number };
  students: Array<{
    student_id: string;
    name: string | null;
    username: string | null;
    status: AttendanceStatus;
    joined_at: string | null;
  }>;
}

export interface EndSessionResponse {
  session: SessionView;
  attendance: Attendance;
}

export type ChatMessageRole = "USER" | "ASSISTANT";
export type MaterialState = "UPLOADED" | "EXTRACTED" | "FAILED";

export interface ChatView {
  id: string;
  title: string;
  created_at: string;
}

export interface MaterialView {
  id: string;
  title: string;
  file_type: string;
  status: MaterialState;
  error: string | null;
}

export interface MessageView {
  id: string;
  role: ChatMessageRole;
  content: string;
  sources: string[] | null;
  created_at: string;
}

export interface ChatDetail {
  chat: ChatView;
  materials: MaterialView[];
  reply_pending: boolean;
}

export interface ChatMessagesResponse {
  items: MessageView[];
  reply_pending: boolean;
}

export interface SendMessageResult {
  message: MessageView;
  material: MaterialView | null;
  reply_pending: boolean;
}

// ---- Quizzes ------------------------------------------------------------------------------

export interface QuizOption {
  key: string;
  text: string;
}

export interface QuizQuestionFull {
  id: number;
  question: string;
  options: QuizOption[];
  answer: string;
  explanation: string;
  source: string | null;
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

/** A pick and when it was made, in milliseconds since the question was first shown. */
export interface QuizChoiceChange {
  choice: string;
  at_ms: number;
}

export interface StudentQuiz {
  quiz: QuizView;
  questions: { id: number; question: string; options: QuizOption[]; answer?: string; explanation?: string }[];
  attempt: {
    started_at: string;
    submitted_at: string | null;
    score: number | null;
    total: number;
    duration_ms: number | null;
    answers: { question_id: number; choice: string; is_correct?: boolean }[];
    rank: number | null;
    ranked: number;
  } | null;
}

export interface QuizResults {
  quiz: QuizView & { questions: QuizQuestionFull[] };
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
  /** Students in the session who have not opened the quiz yet. */
  waiting?: { student_id: string; name: string; username: string | null; online: boolean }[];
  questions: {
    id: number;
    question: string;
    answer: string;
    answered: number;
    correct: number;
    correct_rate: number | null;
    average_time_ms: number | null;
    changed: number;
    right_to_wrong: number;
    wrong_to_right: number;
    options: { key: string; text: string; count: number; is_answer: boolean }[];
    top_wrong: { key: string; text: string; count: number } | null;
  }[];
}

export interface NewQuiz {
  title: string;
  kind: "pretest" | "posttest" | "quiz";
  questions: { question: string; options: QuizOption[]; answer: string; explanation: string; source: string | null }[];
  source_chat_id?: string | null;
  source_message_id?: string | null;
}

/** GET /insights: the teacher dashboard, computed from the newest sessions. Rates are 0-1, `average_percent` 0-100. */
export interface TeacherInsights {
  generated_at: string;
  window: { sessions: number };
  totals: {
    classes: number;
    students: number;
    sessions: number;
    live_sessions: number;
    quizzes: number;
    submissions: number;
    participation_rate: number | null;
    correct_rate: number | null;
  };
  classes: { id: string; name: string; student_count: number; sessions: number; participation_rate: number | null; correct_rate: number | null; last_session_at: string | null }[];
  sessions: {
    id: string;
    class_id: string;
    class_name: string;
    status: SessionStatus;
    date: string;
    material_title: string | null;
    joined: number;
    class_size: number;
    participation_rate: number | null;
    quizzes: number;
    correct_rate: number | null;
  }[];
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
    missed_by: string[];
  }[];
  topics: { topic: string; material_title: string | null; questions: number; answered: number; wrong: number; correct_rate: number | null; struggling_students: number }[];
  students: {
    student_id: string;
    name: string;
    username: string | null;
    class_name: string;
    sessions_joined: number;
    class_sessions: number;
    quizzes_taken: number;
    answered: number;
    correct: number;
    correct_rate: number | null;
    weakest_topic: string | null;
    missed: { quiz_title: string; question: string; topic: string; picked: string | null; picked_text: string | null; answer: string; answer_text: string | null }[];
  }[];
}

// ---- Problems (problem solving: one challenge, blocks and/or JavaScript) -------------------

export type BlockKind = "event" | "action" | "loop" | "if" | "part" | "info";

export interface PuzzleBlock {
  id: string;
  text: string;
  kind: BlockKind;
}

export interface PuzzleNode {
  block: string;
  children?: PuzzleNode[];
}

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface CodeTest {
  args: Json[];
  expected: Json;
}

/** A JavaScript task: one function that must pass the tests. `reference` is the teacher's solution. */
export interface CodeTask {
  fn: string;
  params: string[];
  starter: string;
  reference: string;
  tests: CodeTest[];
}

export interface Challenge {
  prompt: string;
  hint: string;
  ordered: boolean;
  blocks: PuzzleBlock[];
  solution: PuzzleNode[];
  /** Null: solved with blocks only. */
  code: CodeTask | null;
}

export interface ProblemModes {
  blocks: boolean;
  code: boolean;
}

export type ProblemIssueCode = "story_missing" | "prompt_missing" | "no_mode" | "solution_missing" | "container_empty" | "code_tests_missing";

/** What the AI worker is doing with a draft: writing it, or it could not; null for a normal draft. */
export type ProblemGeneration = "pending" | "failed" | null;

interface ProblemMeta {
  material: { id: string; title: string } | null;
  origin: "manual" | "ai";
  ai_focus: string | null;
  generation: ProblemGeneration;
  generation_error: string | null;
}

/** A material (chat) as a source of block problems. */
export interface ProblemMaterial {
  id: string;
  title: string;
  ready_files: number;
  pending_files: number;
  problems: number;
}

export interface Problem extends ProblemMeta {
  id: string;
  title: string;
  story: string;
  status: "draft" | "ready";
  challenge: Challenge;
  issues: { code: ProblemIssueCode }[];
  created_at: string;
  updated_at: string;
}

export interface ProblemSummary extends ProblemMeta {
  id: string;
  title: string;
  story: string;
  status: "draft" | "ready";
  issues: number;
  answer_blocks: number;
  modes: ProblemModes;
  updated_at: string;
}

export interface PuzzleGrade {
  correct: boolean;
  blocks: Record<string, "right" | "misplaced" | "extra">;
  missing: number;
  expected: number;
  placed: number;
}

// ---- Problems sent to a live session -------------------------------------------------------

export type SolvedWith = "blocks" | "code";

export interface SessionProblemView {
  id: string;
  session_id: string;
  problem_id: string | null;
  title: string;
  status: "open" | "closed";
  modes: ProblemModes;
  opened_at: string;
  closed_at: string | null;
}

/** The challenge as a student gets it: no block solution, no reference code. */
export interface StudentChallenge {
  prompt: string;
  hint: string;
  ordered: boolean;
  blocks: PuzzleBlock[];
  answer_blocks: number;
  code: { fn: string; params: string[]; starter: string; tests: CodeTest[] } | null;
}

export interface ProblemAttemptView {
  started_at: string;
  solved_at: string | null;
  solved_with: SolvedWith | null;
  block_checks: number;
  block_answer: PuzzleNode[] | null;
  code_runs: number;
  code: string | null;
  code_passed: number | null;
  code_total: number | null;
}

export interface StudentProblem {
  problem: SessionProblemView & { story: string; challenge: StudentChallenge };
  attempt: ProblemAttemptView;
}

export interface ProblemResults {
  problem: SessionProblemView & { story: string; challenge: Challenge };
  summary: { joined: number; opened: number; solved: number; solved_blocks: number; solved_code: number };
  students: {
    student_id: string;
    name: string;
    username: string | null;
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
    duration_ms: number | null;
  }[];
}
