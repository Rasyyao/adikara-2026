import { AppError } from "../../http/errors.js";
import { blankChallenge, gradeArrangement, modesOf, problemIssues, readArrangement, readChallenge, type Challenge, type GradeResult, type Issue } from "../../lib/block-puzzle.js";
import type { AuthContext } from "../../types/auth.types.js";
import type { ProblemGeneration, ProblemRecord, ProblemSource, ProblemStatus, TeacherProblemRepository } from "../../types/teacher/problem.types.js";

/** AI drafts made in one request. */
export const MAX_GENERATE = 3;

interface ProblemMeta {
  /** The material it belongs to. */
  material: { id: string; title: string } | null;
  origin: "manual" | "ai";
  ai_focus: string | null;
  /** "pending" while the AI writes it, "failed" when it could not; null otherwise. */
  generation: ProblemGeneration;
  generation_error: string | null;
}

export interface MaterialSourceView {
  id: string;
  title: string;
  /** Files read and ready to make problems from. */
  ready_files: number;
  /** Files the worker is still reading. */
  pending_files: number;
  problems: number;
}

export interface ProblemView extends ProblemMeta {
  id: string;
  title: string;
  story: string;
  status: ProblemStatus;
  challenge: Challenge;
  /** What still keeps the draft from being ready; empty when it can be given to students. */
  issues: Issue[];
  created_at: string;
  updated_at: string;
}

export interface ProblemSummary extends ProblemMeta {
  id: string;
  title: string;
  story: string;
  status: ProblemStatus;
  issues: number;
  /** Blocks in the answer key. */
  answer_blocks: number;
  /** Ways the student can solve it. */
  modes: { blocks: boolean; code: boolean };
  updated_at: string;
}

/** Problem-solving drafts: a story and one challenge (blocks and/or JavaScript). A teacher sees their own; an admin sees all. */
export interface TeacherProblemService {
  /** `material`: one material's problems; null for those without a material. */
  list(auth: AuthContext, material?: string | null): Promise<{ items: ProblemSummary[] }>;
  /** The caller's materials, to make problems from and to group them by. */
  materials(auth: AuthContext): Promise<{ items: MaterialSourceView[] }>;
  get(auth: AuthContext, id: string): Promise<{ problem: ProblemView }>;
  create(auth: AuthContext, input: { title: string; story: string; chatId: string | null }): Promise<{ problem: ProblemView }>;
  update(auth: AuthContext, id: string, input: { title: string; story: string; challenge: Challenge; chatId?: string | null }): Promise<{ problem: ProblemView }>;
  /** Asks the AI worker for `count` drafts from one material; they come back pending and fill in when it is done. */
  generate(auth: AuthContext, input: { chatId: string; focus: string | null; count: number }): Promise<{ items: ProblemView[] }>;
  /** Makes an AI draft again (after a failure, or to replace it). `focus` undefined keeps the previous one. */
  regenerate(auth: AuthContext, id: string, focus?: string | null): Promise<{ problem: ProblemView }>;
  setStatus(auth: AuthContext, id: string, status: ProblemStatus): Promise<{ problem: ProblemView }>;
  duplicate(auth: AuthContext, id: string): Promise<{ problem: ProblemView }>;
  remove(auth: AuthContext, id: string): Promise<void>;
  /** Grades a block arrangement the way a student's answer will be, so the teacher can try the problem. */
  check(auth: AuthContext, id: string, answer: unknown): Promise<GradeResult>;
}

const count = (nodes: Challenge["solution"]): number => nodes.reduce((sum, n) => sum + 1 + count(n.children ?? []), 0);

const meta = (record: ProblemRecord): ProblemMeta => ({
  material: record.chatId ? { id: record.chatId, title: record.chatTitle ?? "" } : null,
  origin: record.origin,
  ai_focus: record.aiFocus,
  generation: record.generation,
  generation_error: record.generationError,
});

const toSource = (s: ProblemSource): MaterialSourceView => ({ id: s.chatId, title: s.title, ready_files: s.readyFiles, pending_files: s.pendingFiles, problems: s.problems });

function toView(record: ProblemRecord): ProblemView {
  const challenge = readChallenge(record.challenge);
  return {
    ...meta(record),
    id: record.id,
    title: record.title,
    story: record.story,
    status: record.status,
    challenge,
    issues: problemIssues({ story: record.story, challenge }),
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
  };
}

function toSummary(record: ProblemRecord): ProblemSummary {
  const view = toView(record);
  return {
    ...meta(record),
    id: view.id,
    title: view.title,
    story: view.story.slice(0, 200),
    status: view.status,
    issues: view.issues.length,
    answer_blocks: count(view.challenge.solution),
    modes: modesOf(view.challenge),
    updated_at: view.updated_at,
  };
}

export function createTeacherProblemService(repository: TeacherProblemRepository): TeacherProblemService {
  const assertStaff = (auth: AuthContext) => {
    if (auth.kind !== "teacher") throw new AppError(403, "forbidden", "You do not have access to this resource");
  };
  const own = async (auth: AuthContext, id: string) => {
    assertStaff(auth);
    const record = await repository.find(id);
    // another teacher's problem looks like a missing one
    if (!record || (auth.role !== "ADMIN" && record.teacherId !== auth.userId)) throw new AppError(404, "problem_not_found", "Problem not found");
    return record;
  };
  /** The draft is the worker's until it is written. */
  const settled = async (auth: AuthContext, id: string) => {
    const record = await own(auth, id);
    if (record.generation === "pending") throw new AppError(409, "problem_generating", "The AI is still writing this problem");
    return record;
  };
  const ownSource = async (auth: AuthContext, chatId: string) => {
    const source = await repository.findSource(chatId);
    if (!source || (auth.role !== "ADMIN" && source.teacherId !== auth.userId)) throw new AppError(404, "material_not_found", "Material not found");
    return source;
  };
  const readySource = async (auth: AuthContext, chatId: string) => {
    const source = await ownSource(auth, chatId);
    if (source.readyFiles === 0) {
      throw new AppError(409, "material_not_ready", "The material has no file that has been read yet", { pending_files: source.pendingFiles });
    }
    return source;
  };

  return {
    async list(auth, material) {
      assertStaff(auth);
      const rows = await repository.list(auth.role === "ADMIN" ? null : auth.userId, material);
      return { items: rows.map(toSummary) };
    },

    async materials(auth) {
      assertStaff(auth);
      return { items: (await repository.sources(auth.role === "ADMIN" ? null : auth.userId)).map(toSource) };
    },

    async get(auth, id) {
      return { problem: toView(await own(auth, id)) };
    },

    async create(auth, input) {
      assertStaff(auth);
      if (input.chatId) await ownSource(auth, input.chatId);
      return { problem: toView(await repository.create({ teacherId: auth.userId, chatId: input.chatId, title: input.title, story: input.story, challenge: blankChallenge() })) };
    },

    async update(auth, id, input) {
      const record = await settled(auth, id);
      if (input.chatId) await ownSource(auth, input.chatId);
      // an edit that leaves something unfinished takes the problem back to draft, so students never get a broken one
      const status = record.status === "ready" && problemIssues(input).length > 0 ? "draft" : undefined;
      // saving by hand after a failed AI attempt makes it an ordinary draft
      const cleared = record.generation === "failed" ? { generation: null } : {};
      return { problem: toView(await repository.update(record.id, { ...input, ...(status ? { status } : {}), ...cleared })) };
    },

    async generate(auth, { chatId, focus, count }) {
      assertStaff(auth);
      const source = await readySource(auth, chatId);
      const rows = await repository.createGenerating({
        teacherId: auth.userId,
        chatId,
        title: `Soal dari ${source.title}`.slice(0, 120),
        focus,
        challenge: blankChallenge(),
        count: Math.min(Math.max(count, 1), MAX_GENERATE),
      });
      return { items: rows.map(toView) };
    },

    async regenerate(auth, id, focus) {
      const record = await settled(auth, id);
      if (!record.chatId) throw new AppError(409, "problem_without_material", "Only a problem that belongs to a material can be made by the AI");
      await readySource(auth, record.chatId);
      return { problem: toView(await repository.regenerate(record.id, focus === undefined ? record.aiFocus : focus)) };
    },

    async setStatus(auth, id, status) {
      const record = await settled(auth, id);
      if (status === "ready") {
        const issues = problemIssues({ story: record.story, challenge: readChallenge(record.challenge) });
        if (issues.length) throw new AppError(409, "problem_incomplete", "The problem is not finished", { issues });
      }
      return { problem: toView(await repository.update(record.id, { status })) };
    },

    async duplicate(auth, id) {
      const record = await settled(auth, id);
      const copy = await repository.create({ teacherId: auth.userId, chatId: record.chatId, title: `${record.title} (salinan)`.slice(0, 120), story: record.story, challenge: readChallenge(record.challenge) });
      return { problem: toView(copy) };
    },

    async remove(auth, id) {
      const record = await own(auth, id);
      await repository.remove(record.id);
    },

    async check(auth, id, answer) {
      const challenge = readChallenge((await own(auth, id)).challenge);
      const read = readArrangement(answer, challenge.blocks);
      if ("error" in read) throw new AppError(400, "validation_error", "Request validation failed", { fields: { answer: read.error } });
      return gradeArrangement(challenge, read.nodes);
    },
  };
}
