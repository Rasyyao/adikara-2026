import type { Challenge } from "../../lib/block-puzzle.js";

export type ProblemStatus = "draft" | "ready";
/** pending: the AI worker is writing it · failed: it could not (see generationError) · null: a normal draft. */
export type ProblemGeneration = "pending" | "failed" | null;

/** A problem as stored; `challenge` is the raw JSON, read with readChallenge. */
export interface ProblemRecord {
  id: string;
  teacherId: string;
  /** The material (chat) it belongs to. */
  chatId: string | null;
  chatTitle: string | null;
  title: string;
  story: string;
  status: ProblemStatus;
  challenge: unknown;
  origin: "manual" | "ai";
  aiFocus: string | null;
  generation: ProblemGeneration;
  generationError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProblemChanges {
  title?: string;
  story?: string;
  challenge?: Challenge;
  status?: ProblemStatus;
  chatId?: string | null;
  /** Clears a failed generation once the teacher fills the draft in by hand. */
  generation?: null;
}

/** A material as a source of problems: its files, by how far the worker got with them. */
export interface ProblemSource {
  chatId: string;
  teacherId: string;
  title: string;
  readyFiles: number;
  pendingFiles: number;
  problems: number;
}

export interface TeacherProblemRepository {
  /** Newest change first; every teacher's when `teacherId` is null (admins). `chatId` keeps one material's. */
  list(teacherId: string | null, chatId?: string | null): Promise<ProblemRecord[]>;
  find(id: string): Promise<ProblemRecord | null>;
  create(input: { teacherId: string; chatId: string | null; title: string; story: string; challenge: Challenge }): Promise<ProblemRecord>;
  update(id: string, changes: ProblemChanges): Promise<ProblemRecord>;
  /** Also drops its generation job if the worker has not started it. */
  remove(id: string): Promise<void>;
  /** Materials of a teacher (all when null), newest first. */
  sources(teacherId: string | null): Promise<ProblemSource[]>;
  findSource(chatId: string): Promise<ProblemSource | null>;
  /** Pending AI drafts, one `generate_problem` job each, committed together and announced to the worker. */
  createGenerating(input: { teacherId: string; chatId: string; title: string; focus: string | null; challenge: Challenge; count: number }): Promise<ProblemRecord[]>;
  /** Sends a failed (or finished) AI draft back to the worker. */
  regenerate(id: string, focus: string | null): Promise<ProblemRecord>;
}
